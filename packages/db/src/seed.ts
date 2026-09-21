import { createHash } from "node:crypto";
import { prisma } from "./index";

const tenantId = process.env.MAW_TENANT_ID ?? "demo-tenant";

if ((process.env.MAW_MODE ?? "demo") !== "demo") {
  throw new Error("Seeding is only permitted when MAW_MODE=demo");
}

const principals = [
  { externalSubjectId: "demo-admin", displayName: "Avery Admin", principalType: "human", email: "admin@demo.maw.local", roles: ["MAW.Admin"] },
  { externalSubjectId: "demo-policy", displayName: "Priya Policy", principalType: "human", email: "policy@demo.maw.local", roles: ["MAW.PolicyAdmin"] },
  { externalSubjectId: "demo-operator", displayName: "Omar Operator", principalType: "human", email: "operator@demo.maw.local", roles: ["MAW.WalletOperator"] },
  { externalSubjectId: "demo-approver", displayName: "Alex Approver", principalType: "human", email: "approver@demo.maw.local", roles: ["MAW.Approver"] },
  { externalSubjectId: "demo-auditor", displayName: "Ada Auditor", principalType: "human", email: "auditor@demo.maw.local", roles: ["MAW.Auditor"] },
  { externalSubjectId: "demo-agent", displayName: "Procurement Agent", principalType: "agent", email: null, roles: ["MAW.Agent"] }
];

const policyDocument = {
  currency: "USD",
  rules: [
    { type: "asset_allowlist", assets: ["USDC", "USDT", "USD"] },
    { type: "max_per_transaction", amount: 500 },
    { type: "max_per_month", amount: 1000 },
    { type: "category_limit", category: "cloud", period: "month", amount: 100 },
    { type: "supplier_limit", supplierGroup: "approved", period: "month", amount: 500 },
    { type: "destination_allowlist", mode: "strict" },
    { type: "require_approval_above", amount: 250 },
    { type: "subscription_limit", amount: 100, monthlyTotal: 200 },
    { type: "escrow_limit", amount: 300 }
  ]
};

async function main() {
  const byKey: Record<string, string> = {};
  for (const p of principals) {
    const row = await prisma.principal.upsert({
      where: { tenantId_externalSubjectId: { tenantId, externalSubjectId: p.externalSubjectId } },
      create: { tenantId, ...p },
      update: { displayName: p.displayName, roles: p.roles, principalType: p.principalType, email: p.email }
    });
    byKey[p.externalSubjectId] = row.id;
  }

  let hosting = await prisma.supplier.findFirst({ where: { tenantId, name: "Contoso Cloud Hosting" } });
  hosting ??= await prisma.supplier.create({ data: { tenantId, name: "Contoso Cloud Hosting", category: "cloud", supplierGroup: "approved", externalReference: "SUP-1001" } });
  let stationery = await prisma.supplier.findFirst({ where: { tenantId, name: "Fabrikam Office Supplies" } });
  stationery ??= await prisma.supplier.create({ data: { tenantId, name: "Fabrikam Office Supplies", category: "office", supplierGroup: "approved", externalReference: "SUP-1002" } });

  const destinations = [
    { label: "Contoso Cloud Hosting (USDC on Polygon)", addressOrReference: "0x5c1a0000000000000000000000000000000c0a70", network: "polygon", supplierId: hosting.id, type: "blockchain_address", status: "active" },
    { label: "Fabrikam Office Supplies (USDC on Base)", addressOrReference: "0x8f4b0000000000000000000000000000000fab01", network: "base", supplierId: stationery.id, type: "blockchain_address", status: "active" },
    { label: "Unverified vendor", addressOrReference: "0x1111000000000000000000000000000000000bad", network: "polygon", supplierId: null, type: "blockchain_address", status: "pending_verification" }
  ];
  for (const d of destinations) {
    await prisma.destination.upsert({
      where: { tenantId_network_addressOrReference: { tenantId, network: d.network, addressOrReference: d.addressOrReference } },
      create: { tenantId, ...d },
      update: { label: d.label, status: d.status }
    });
  }

  let policy = await prisma.spendingPolicy.findFirst({ where: { tenantId, name: "Procurement agent policy" } });
  if (!policy) {
    policy = await prisma.spendingPolicy.create({
      data: { tenantId, name: "Procurement agent policy", description: "Cloud and approved-supplier spending with an approval threshold.", currency: "USD", rulesJson: policyDocument, createdBy: byKey["demo-policy"] }
    });
    await prisma.policyVersion.create({ data: { tenantId, policyId: policy.id, version: 1, currency: "USD", rulesJson: policyDocument, createdBy: byKey["demo-policy"] } });
  }

  let wallet = await prisma.wallet.findFirst({ where: { tenantId, name: "Procurement agent wallet" } });
  if (!wallet) {
    const accountRef = `demo-acct-${createHash("sha256").update(`${tenantId}:seed-wallet`).digest("hex").slice(0, 16)}`;
    wallet = await prisma.wallet.create({
      data: { tenantId, name: "Procurement agent wallet", principalId: byKey["demo-agent"], defaultAsset: "USDC", network: "polygon", provider: "demo-ledger", providerAccountRef: accountRef }
    });
    await prisma.walletBalance.create({ data: { tenantId, walletId: wallet.id, asset: "USDC", available: 2000 } });
    await prisma.policyAssignment.create({ data: { tenantId, policyId: policy.id, walletId: wallet.id } });
    await prisma.auditEvent.create({ data: { tenantId, actorPrincipalId: byKey["demo-admin"], eventType: "seed.completed", resourceType: "wallet", resourceId: wallet.id, outcome: "success", detailsJson: { demo: true } } });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
