import { z } from "zod";
import { MawError } from "@maw/shared";
import { audit } from "./audit";
import { num, requireRole } from "./context";
import type { Actor, Deps } from "./context";
import { isUniqueViolation } from "./context";

const recordSchema = z.object({
  azureSubscriptionId: z.string().min(1),
  resourceId: z.string().optional(),
  costCategory: z.string().min(1),
  invoiceReference: z.string().min(1),
  chargeAmount: z.number().positive().finite(),
  chargeCurrency: z.string().min(3).max(8).default("USD")
});

export async function recordAzureCharge(deps: Deps, actor: Actor, input: unknown) {
  requireRole(actor, "MAW.Admin", "MAW.WalletOperator");
  const data = recordSchema.parse(input);
  try {
    const record = await deps.db.azureBillingRecord.create({ data: { tenantId: actor.tenantId, ...data } });
    await audit(deps.db, actor, { eventType: "billing.recorded", resourceType: "billing_record", resourceId: record.id, outcome: "success", details: { invoiceReference: data.invoiceReference } });
    return serialize(record);
  } catch (error) {
    if (isUniqueViolation(error)) throw new MawError("conflict", "A billing record with this invoice reference already exists");
    throw error;
  }
}

const serialize = <T extends { chargeAmount: unknown }>(record: T) => ({ ...record, chargeAmount: num(record.chargeAmount as number) });

export async function listBillingRecords(deps: Deps, actor: Actor) {
  requireRole(actor, "MAW.Admin", "MAW.WalletOperator", "MAW.Auditor");
  const records = await deps.db.azureBillingRecord.findMany({
    where: { tenantId: actor.tenantId },
    include: { paymentIntent: { include: { transactions: { include: { receipts: true } }, destination: true } } },
    orderBy: { createdAt: "desc" },
    take: 200
  });
  return records.map((r) => {
    const transaction = r.paymentIntent?.transactions[0] ?? null;
    return {
      ...serialize({ ...r, paymentIntent: undefined }),
      settlement: r.paymentIntent
        ? {
            paymentIntentId: r.paymentIntent.id,
            status: r.paymentIntent.status,
            asset: r.paymentIntent.asset,
            network: r.paymentIntent.network,
            settlementAmount: num(r.paymentIntent.amount),
            externalReference: transaction?.txHashOrReference ?? null,
            demo: transaction?.demo ?? null,
            receiptId: transaction?.receipts[0]?.id ?? null
          }
        : null
    };
  });
}

export async function linkBillingRecord(deps: Deps, actor: Actor, recordId: string, paymentIntentId: string) {
  requireRole(actor, "MAW.Admin", "MAW.WalletOperator");
  const record = await deps.db.azureBillingRecord.findFirst({ where: { id: recordId, tenantId: actor.tenantId } });
  if (!record) throw new MawError("not_found", "Billing record not found");
  const intent = await deps.db.paymentIntent.findFirst({ where: { id: paymentIntentId, tenantId: actor.tenantId }, include: { transactions: true } });
  if (!intent) throw new MawError("not_found", "Payment intent not found");
  const transaction = intent.transactions.find((t) => t.status === "settled") ?? null;
  const amountsAlign = Math.abs(num(intent.amount) - num(record.chargeAmount)) < 1e-6;
  const status = transaction && amountsAlign ? "matched" : transaction ? "amount_mismatch" : "linked";
  const updated = await deps.db.azureBillingRecord.update({
    where: { id: recordId },
    data: { paymentIntentId, transactionId: transaction?.id ?? null, status }
  });
  await audit(deps.db, actor, { eventType: "billing.linked", resourceType: "billing_record", resourceId: recordId, outcome: "success", details: { paymentIntentId, status } });
  return serialize(updated);
}

export async function reconcileBilling(deps: Deps, actor: Actor) {
  requireRole(actor, "MAW.Admin", "MAW.WalletOperator");
  const open = await deps.db.azureBillingRecord.findMany({ where: { tenantId: actor.tenantId, status: { in: ["unmatched", "linked"] } } });
  const results: { recordId: string; status: string }[] = [];
  for (const record of open) {
    const candidates = await deps.db.paymentIntent.findMany({
      where: { tenantId: actor.tenantId, azureContextJson: { path: ["invoiceReference"], equals: record.invoiceReference } },
      include: { transactions: true }
    });
    const intent = candidates[0];
    if (!intent) {
      results.push({ recordId: record.id, status: record.status });
      continue;
    }
    const updated = await linkBillingRecord(deps, actor, record.id, intent.id);
    results.push({ recordId: record.id, status: updated.status });
  }
  return results;
}
