import { COUNTED_PAYMENT_STATUSES, addAmounts, periodStart } from "@maw/shared";
import type { Period } from "@maw/shared";
import { emptyUsage } from "@maw/policy-engine";
import type { UsageSnapshot } from "@maw/policy-engine";
import type { Client } from "./context";
import { num } from "./context";

const PERIODS: Period[] = ["day", "week", "month"];

export async function computeUsage(client: Client, tenantId: string, walletId: string, now: Date, excludeIntentId?: string): Promise<UsageSnapshot> {
  const starts = Object.fromEntries(PERIODS.map((p) => [p, periodStart(p, now)])) as Record<Period, Date>;
  const earliest = new Date(Math.min(...PERIODS.map((p) => starts[p].getTime())));
  const intents = await client.paymentIntent.findMany({
    where: {
      tenantId,
      walletId,
      status: { in: COUNTED_PAYMENT_STATUSES },
      createdAt: { gte: earliest },
      ...(excludeIntentId ? { id: { not: excludeIntentId } } : {})
    },
    include: { destination: { include: { supplier: true } } }
  });
  const usage: UsageSnapshot = emptyUsage();
  for (const intent of intents) {
    const amount = num(intent.amount);
    const supplier = intent.destination.supplier;
    for (const period of PERIODS) {
      if (intent.createdAt < starts[period]) continue;
      usage.total[period] = addAmounts(usage.total[period], amount);
      usage.count[period] += 1;
      if (intent.category) {
        usage.byCategory[intent.category] ??= { day: 0, week: 0, month: 0 };
        usage.byCategory[intent.category][period] = addAmounts(usage.byCategory[intent.category][period], amount);
      }
      if (supplier) {
        usage.bySupplierId[supplier.id] ??= { day: 0, week: 0, month: 0 };
        usage.bySupplierId[supplier.id][period] = addAmounts(usage.bySupplierId[supplier.id][period], amount);
        usage.bySupplierGroup[supplier.supplierGroup] ??= { day: 0, week: 0, month: 0 };
        usage.bySupplierGroup[supplier.supplierGroup][period] = addAmounts(usage.bySupplierGroup[supplier.supplierGroup][period], amount);
      }
    }
    if (intent.kind === "subscription" && intent.createdAt >= starts.month) {
      usage.subscriptionMonthly = addAmounts(usage.subscriptionMonthly, amount);
    }
  }
  return usage;
}

export async function usageSummary(client: Client, tenantId: string, walletId: string, now: Date) {
  const usage = await computeUsage(client, tenantId, walletId, now);
  return usage;
}
