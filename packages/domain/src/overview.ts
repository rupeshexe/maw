import { periodStart, roundAmount } from "@maw/shared";
import type { Period } from "@maw/shared";
import { isPrivileged, num } from "./context";
import type { Actor, Deps } from "./context";
import { activePoliciesForWallet } from "./policies";
import { computeUsage } from "./usage";
import { assertWalletAccess, loadWallet } from "./wallets";

export interface SpendProgress {
  key: string;
  label: string;
  period: Period | "transaction";
  limit: number;
  used: number;
  currency: string;
}

export async function getWalletSpendProgress(deps: Deps, actor: Actor, walletId: string) {
  const wallet = await loadWallet(deps.db, actor.tenantId, walletId);
  assertWalletAccess(actor, wallet);
  const now = new Date();
  const [policies, usage] = await Promise.all([activePoliciesForWallet(deps.db, actor.tenantId, walletId, now), computeUsage(deps.db, actor.tenantId, walletId, now)]);
  const progress: SpendProgress[] = [];
  for (const policy of policies) {
    const currency = policy.document.currency;
    for (const rule of policy.document.rules) {
      switch (rule.type) {
        case "max_per_day":
        case "max_per_week":
        case "max_per_month": {
          const period = rule.type.replace("max_per_", "") as Period;
          progress.push({ key: `${policy.id}:${rule.type}`, label: `Total spend per ${period}`, period, limit: rule.amount, used: usage.total[period], currency });
          break;
        }
        case "category_limit":
          progress.push({ key: `${policy.id}:cat:${rule.category}:${rule.period}`, label: `Category "${rule.category}" per ${rule.period}`, period: rule.period, limit: rule.amount, used: usage.byCategory[rule.category]?.[rule.period] ?? 0, currency });
          break;
        case "supplier_limit": {
          const source = rule.supplierId ? usage.bySupplierId[rule.supplierId] : rule.supplierGroup ? usage.bySupplierGroup[rule.supplierGroup] : undefined;
          progress.push({ key: `${policy.id}:sup:${rule.supplierId ?? rule.supplierGroup}:${rule.period}`, label: `Supplier ${rule.supplierId ? rule.supplierId : `group "${rule.supplierGroup}"`} per ${rule.period}`, period: rule.period, limit: rule.amount, used: source?.[rule.period] ?? 0, currency });
          break;
        }
        case "max_per_transaction":
          progress.push({ key: `${policy.id}:txn`, label: "Per-transaction cap", period: "transaction", limit: rule.amount, used: 0, currency });
          break;
        default:
          break;
      }
    }
  }
  return { walletId, policies: policies.map((p) => ({ id: p.id, name: p.name, version: p.version })), progress, usage };
}

export async function getOverview(deps: Deps, actor: Actor) {
  const tenantId = actor.tenantId;
  const monthStart = periodStart("month", new Date());
  const scope = !isPrivileged(actor) && actor.roles.every((r) => r === "MAW.Agent") ? { wallet: { principalId: actor.principalId } } : {};
  const walletScope = "wallet" in scope ? { principalId: actor.principalId } : {};
  const [wallets, balances, statusGroups, monthSpend, pendingApprovals, activeSubscriptions, openEscrows, recent, recentPayments] = await Promise.all([
    deps.db.wallet.count({ where: { tenantId, ...walletScope } }),
    deps.db.walletBalance.findMany({ where: { tenantId, wallet: walletScope } }),
    deps.db.paymentIntent.groupBy({ by: ["status"], where: { tenantId, createdAt: { gte: monthStart }, ...scope }, _count: { _all: true } }),
    deps.db.paymentIntent.aggregate({ where: { tenantId, status: "settled", createdAt: { gte: monthStart }, ...scope }, _sum: { amount: true } }),
    deps.db.approvalRequest.count({ where: { tenantId, status: "pending" } }),
    deps.db.subscription.count({ where: { tenantId, status: "active", ...scope } }),
    deps.db.escrow.aggregate({ where: { tenantId, state: { in: ["funded", "release_pending", "funding_pending"] }, ...("wallet" in scope ? { payerWallet: walletScope } : {}) }, _sum: { amount: true }, _count: { _all: true } }),
    deps.db.auditEvent.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 8 }),
    deps.db.paymentIntent.findMany({ where: { tenantId, ...scope }, include: { destination: true }, orderBy: { createdAt: "desc" }, take: 6 })
  ]);
  const byAsset: Record<string, { available: number; reserved: number }> = {};
  for (const b of balances) {
    byAsset[b.asset] ??= { available: 0, reserved: 0 };
    byAsset[b.asset].available = roundAmount(byAsset[b.asset].available + num(b.available));
    byAsset[b.asset].reserved = roundAmount(byAsset[b.asset].reserved + num(b.reserved));
  }
  return {
    mode: deps.adapters.mode,
    wallets,
    balances: byAsset,
    paymentsByStatus: Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all])),
    settledThisMonth: num(monthSpend._sum.amount),
    pendingApprovals,
    activeSubscriptions,
    escrow: { count: openEscrows._count._all, amount: num(openEscrows._sum.amount) },
    recentAudit: recent,
    recentPayments: recentPayments.map((p) => ({ id: p.id, status: p.status, amount: num(p.amount), asset: p.asset, destination: p.destination.label, kind: p.kind, createdAt: p.createdAt }))
  };
}
