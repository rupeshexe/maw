import { z } from "zod";
import { MawError, addAmounts, isPositiveAmount } from "@maw/shared";
import { audit } from "./audit";
import { isPrivileged, num, requireRole } from "./context";
import type { Actor, Client, Deps } from "./context";

const createWalletSchema = z.object({
  name: z.string().min(1).max(120),
  principalId: z.string().min(1),
  defaultAsset: z.string().min(2).max(12),
  network: z.string().min(2).max(40),
  provider: z.string().min(2).max(60)
});

export type WalletView = Awaited<ReturnType<typeof getWallet>>;

export async function loadWallet(client: Client, tenantId: string, walletId: string) {
  const wallet = await client.wallet.findFirst({ where: { id: walletId, tenantId } });
  if (!wallet) throw new MawError("not_found", "Wallet not found");
  return wallet;
}

export function assertWalletAccess(actor: Actor, wallet: { principalId: string }) {
  if (isPrivileged(actor) || actor.system) return;
  if (actor.roles.includes("MAW.Auditor") || actor.roles.includes("MAW.Approver") || actor.roles.includes("MAW.PolicyAdmin")) return;
  if (wallet.principalId !== actor.principalId) throw new MawError("forbidden", "Wallet is not assigned to this principal");
}

export async function createWallet(deps: Deps, actor: Actor, input: unknown) {
  requireRole(actor, "MAW.Admin", "MAW.WalletOperator");
  const data = createWalletSchema.parse(input);
  if (!deps.adapters.has(data.provider)) throw new MawError("provider_unsupported", `Provider "${data.provider}" is not configured`);
  const adapter = deps.adapters.get(data.provider);
  const caps = await adapter.capabilities();
  const supported = caps.assets.find((a) => a.asset === data.defaultAsset);
  if (!supported || !supported.networks.includes(data.network)) {
    throw new MawError("provider_unsupported", `${data.provider} does not support ${data.defaultAsset} on ${data.network}`);
  }
  const owner = await deps.db.principal.findFirst({ where: { id: data.principalId, tenantId: actor.tenantId } });
  if (!owner) throw new MawError("not_found", "Principal not found");
  const wallet = await deps.db.$transaction(async (tx) => {
    const created = await tx.wallet.create({
      data: { tenantId: actor.tenantId, name: data.name, principalId: data.principalId, defaultAsset: data.defaultAsset, network: data.network, provider: data.provider }
    });
    const account = await adapter.resolveAccount({ tenantId: actor.tenantId, walletId: created.id, asset: data.defaultAsset, network: data.network });
    const updated = await tx.wallet.update({ where: { id: created.id }, data: { providerAccountRef: account.providerAccountRef } });
    await tx.walletBalance.create({ data: { tenantId: actor.tenantId, walletId: created.id, asset: data.defaultAsset } });
    await audit(tx, actor, { eventType: "wallet.created", resourceType: "wallet", resourceId: created.id, outcome: "success", details: { provider: data.provider, asset: data.defaultAsset, network: data.network } });
    return updated;
  });
  return wallet;
}

export async function listWallets(deps: Deps, actor: Actor) {
  const wallets = await deps.db.wallet.findMany({
    where: { tenantId: actor.tenantId, ...(isPrivileged(actor) || actor.roles.some((r) => r !== "MAW.Agent") ? {} : { principalId: actor.principalId }) },
    include: { balances: true, principal: { select: { id: true, displayName: true, principalType: true } }, assignments: { include: { policy: { select: { id: true, name: true, version: true, status: true } } } } },
    orderBy: { createdAt: "desc" }
  });
  return wallets.map(serializeWallet);
}

export async function getWallet(deps: Deps, actor: Actor, walletId: string) {
  const wallet = await deps.db.wallet.findFirst({
    where: { id: walletId, tenantId: actor.tenantId },
    include: { balances: true, principal: { select: { id: true, displayName: true, principalType: true } }, assignments: { include: { policy: { select: { id: true, name: true, version: true, status: true } } } } }
  });
  if (!wallet) throw new MawError("not_found", "Wallet not found");
  assertWalletAccess(actor, wallet);
  return serializeWallet(wallet);
}

function serializeWallet<T extends { balances: { asset: string; available: unknown; reserved: unknown; updatedAt: Date }[] }>(wallet: T) {
  return {
    ...wallet,
    balances: wallet.balances.map((b) => ({ asset: b.asset, available: num(b.available as number), reserved: num(b.reserved as number), updatedAt: b.updatedAt }))
  };
}

export async function getWalletBalance(deps: Deps, actor: Actor, walletId: string) {
  const wallet = await loadWallet(deps.db, actor.tenantId, walletId);
  assertWalletAccess(actor, wallet);
  const balances = await deps.db.walletBalance.findMany({ where: { walletId, tenantId: actor.tenantId } });
  const adapter = deps.adapters.get(wallet.provider);
  let providerBalance: { available: number; reserved: number } | null = null;
  if (wallet.providerAccountRef) {
    const result = await adapter.getBalance(wallet.providerAccountRef, wallet.defaultAsset).catch(() => null);
    if (result?.authoritative) providerBalance = { available: result.available, reserved: result.reserved };
  }
  return {
    walletId,
    provider: wallet.provider,
    demo: (await adapter.capabilities()).demo,
    balances: balances.map((b) => ({ asset: b.asset, available: num(b.available), reserved: num(b.reserved) })),
    providerBalance
  };
}

export async function setWalletStatus(deps: Deps, actor: Actor, walletId: string, status: "active" | "suspended") {
  requireRole(actor, "MAW.Admin", "MAW.WalletOperator");
  const wallet = await loadWallet(deps.db, actor.tenantId, walletId);
  if (wallet.status === status) return wallet;
  const updated = await deps.db.wallet.update({ where: { id: walletId }, data: { status } });
  await audit(deps.db, actor, { eventType: status === "suspended" ? "wallet.suspended" : "wallet.reactivated", resourceType: "wallet", resourceId: walletId, outcome: "success" });
  return updated;
}

export async function fundDemoWallet(deps: Deps, actor: Actor, walletId: string, amount: number, asset?: string) {
  requireRole(actor, "MAW.Admin", "MAW.WalletOperator");
  const wallet = await loadWallet(deps.db, actor.tenantId, walletId);
  const adapter = deps.adapters.get(wallet.provider);
  const caps = await adapter.capabilities();
  if (!caps.demo) throw new MawError("provider_unsupported", "Only demo ledger wallets can be credited locally");
  if (!isPositiveAmount(amount)) throw new MawError("validation_error", "Amount must be a positive number");
  const target = asset ?? wallet.defaultAsset;
  const balance = await deps.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${walletId} FOR UPDATE`;
    const current = await tx.walletBalance.findUnique({ where: { walletId_asset: { walletId, asset: target } } });
    const next = addAmounts(num(current?.available), amount);
    const row = await tx.walletBalance.upsert({
      where: { walletId_asset: { walletId, asset: target } },
      create: { tenantId: actor.tenantId, walletId, asset: target, available: next },
      update: { available: next }
    });
    await audit(tx, actor, { eventType: "wallet.demo_funded", resourceType: "wallet", resourceId: walletId, outcome: "success", details: { amount, asset: target, demo: true } });
    return row;
  });
  return { walletId, asset: target, available: num(balance.available), reserved: num(balance.reserved), demo: true };
}
