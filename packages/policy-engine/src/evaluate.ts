import { addAmounts, formatAmount } from "@maw/shared";
import type { Period } from "@maw/shared";
import type { PolicyRule } from "./schema";
import type {
  DecisionReason,
  EvaluationInput,
  EvaluationPolicy,
  EvaluationResult,
  PeriodTotals
} from "./types";

const emptyTotals = (): PeriodTotals => ({ day: 0, week: 0, month: 0 });

interface Context {
  input: EvaluationInput;
  currency: string;
  reasons: DecisionReason[];
  matched: EvaluationResult["matchedRules"];
}

function record(
  ctx: Context,
  policy: EvaluationPolicy,
  type: string,
  outcome: "deny" | "approval_required" | "pass",
  code: string,
  message: string,
  detail?: Record<string, unknown>
) {
  ctx.matched.push({ policyId: policy.id, policyVersion: policy.version, type, outcome });
  if (outcome !== "pass") {
    ctx.reasons.push({ code, outcome, message, rule: type, policyId: policy.id, detail });
  }
}

function periodLimit(
  ctx: Context,
  policy: EvaluationPolicy,
  type: string,
  code: string,
  label: string,
  period: Period,
  limit: number,
  used: number
) {
  const projected = addAmounts(used, ctx.input.request.amount);
  if (projected > limit) {
    record(ctx, policy, type, "deny", code, `${label} would exceed the ${period} limit of ${formatAmount(limit, ctx.currency)}`, {
      period,
      limit,
      used,
      requested: ctx.input.request.amount,
      remaining: Math.max(0, addAmounts(limit, -used))
    });
  } else {
    record(ctx, policy, type, "pass", code, label);
  }
}

function applyRule(ctx: Context, policy: EvaluationPolicy, rule: PolicyRule) {
  const { request, destination, usage, now } = ctx.input;
  switch (rule.type) {
    case "asset_allowlist": {
      const ok = rule.assets.includes(request.asset);
      record(ctx, policy, rule.type, ok ? "pass" : "deny", "asset_not_allowed", `Asset ${request.asset} is not permitted`, { allowed: rule.assets });
      return;
    }
    case "network_allowlist": {
      const ok = rule.networks.includes(request.network);
      record(ctx, policy, rule.type, ok ? "pass" : "deny", "network_not_allowed", `Network ${request.network} is not permitted`, { allowed: rule.networks });
      return;
    }
    case "destination_denylist": {
      const denied =
        !!destination && (rule.destinationIds.includes(destination.id) || rule.addresses.includes(destination.address));
      record(ctx, policy, rule.type, denied ? "deny" : "pass", "destination_denied", "Destination is on the denylist");
      return;
    }
    case "destination_allowlist": {
      const listed = !rule.destinationIds || (!!destination && rule.destinationIds.includes(destination.id));
      const ok = !!destination && destination.status === "active" && listed;
      record(ctx, policy, rule.type, ok ? "pass" : "deny", "destination_not_allowlisted", "Destination is not an approved, verified destination");
      return;
    }
    case "supplier_allowlist": {
      const ok =
        !!destination &&
        !!destination.supplierId &&
        destination.supplierStatus === "active" &&
        (rule.supplierIds.includes(destination.supplierId) ||
          (!!destination.supplierGroup && rule.supplierGroups.includes(destination.supplierGroup)));
      record(ctx, policy, rule.type, ok ? "pass" : "deny", "supplier_not_allowed", "Destination supplier is not on the approved supplier list");
      return;
    }
    case "max_per_transaction": {
      const ok = request.amount <= rule.amount;
      record(ctx, policy, rule.type, ok ? "pass" : "deny", "per_transaction_cap_exceeded", `Amount exceeds the per-transaction cap of ${formatAmount(rule.amount, ctx.currency)}`, {
        limit: rule.amount,
        requested: request.amount
      });
      return;
    }
    case "category_limit": {
      if (request.category !== rule.category) {
        record(ctx, policy, rule.type, "pass", "category_limit_exceeded", "Category limit not applicable");
        return;
      }
      const used = (usage.byCategory[rule.category] ?? emptyTotals())[rule.period];
      periodLimit(ctx, policy, rule.type, "category_limit_exceeded", `Spend in category "${rule.category}"`, rule.period, rule.amount, used);
      return;
    }
    case "supplier_limit": {
      if (!destination) return;
      const matchesGroup = rule.supplierGroup && destination.supplierGroup === rule.supplierGroup;
      const matchesId = rule.supplierId && destination.supplierId === rule.supplierId;
      if (!matchesGroup && !matchesId) {
        record(ctx, policy, rule.type, "pass", "supplier_limit_exceeded", "Supplier limit not applicable");
        return;
      }
      const source = matchesId && rule.supplierId ? usage.bySupplierId[rule.supplierId] : usage.bySupplierGroup[rule.supplierGroup as string];
      const used = (source ?? emptyTotals())[rule.period];
      const label = matchesId ? `Spend with supplier ${rule.supplierId}` : `Spend with supplier group "${rule.supplierGroup}"`;
      periodLimit(ctx, policy, rule.type, "supplier_limit_exceeded", label, rule.period, rule.amount, used);
      return;
    }
    case "max_per_day":
      periodLimit(ctx, policy, rule.type, "period_cap_exceeded", "Total spend", "day", rule.amount, usage.total.day);
      return;
    case "max_per_week":
      periodLimit(ctx, policy, rule.type, "period_cap_exceeded", "Total spend", "week", rule.amount, usage.total.week);
      return;
    case "max_per_month":
      periodLimit(ctx, policy, rule.type, "period_cap_exceeded", "Total spend", "month", rule.amount, usage.total.month);
      return;
    case "max_transactions_per_period": {
      const used = usage.count[rule.period];
      const ok = used + 1 <= rule.count;
      record(ctx, policy, rule.type, ok ? "pass" : "deny", "velocity_exceeded", `Transaction count would exceed ${rule.count} per ${rule.period}`, {
        limit: rule.count,
        used
      });
      return;
    }
    case "business_hours_only": {
      const hour = now.getUTCHours();
      const day = now.getUTCDay();
      const ok = rule.days.includes(day) && hour >= rule.startHour && hour < rule.endHour;
      record(ctx, policy, rule.type, ok ? "pass" : "deny", "outside_business_hours", `Payments are only permitted ${rule.startHour}:00-${rule.endHour}:00 UTC on allowed days`);
      return;
    }
    case "subscription_limit": {
      if (request.kind !== "subscription") return;
      if (request.amount > rule.amount) {
        record(ctx, policy, rule.type, "deny", "subscription_cap_exceeded", `Subscription amount exceeds ${formatAmount(rule.amount, ctx.currency)} per execution`, { limit: rule.amount });
        return;
      }
      if (rule.monthlyTotal !== undefined && addAmounts(usage.subscriptionMonthly, request.amount) > rule.monthlyTotal) {
        record(ctx, policy, rule.type, "deny", "subscription_cap_exceeded", `Monthly subscription spend would exceed ${formatAmount(rule.monthlyTotal, ctx.currency)}`, {
          limit: rule.monthlyTotal,
          used: usage.subscriptionMonthly
        });
        return;
      }
      record(ctx, policy, rule.type, "pass", "subscription_cap_exceeded", "Subscription within limit");
      return;
    }
    case "escrow_limit": {
      if (request.kind !== "escrow") return;
      const ok = request.amount <= rule.amount;
      record(ctx, policy, rule.type, ok ? "pass" : "deny", "escrow_cap_exceeded", `Escrow amount exceeds ${formatAmount(rule.amount, ctx.currency)}`, { limit: rule.amount });
      return;
    }
    case "require_approval_above": {
      const needs = request.amount > rule.amount;
      record(ctx, policy, rule.type, needs ? "approval_required" : "pass", "approval_threshold_exceeded", `Amount above ${formatAmount(rule.amount, ctx.currency)} requires approval`, {
        threshold: rule.amount
      });
      return;
    }
  }
}

const ORDER: PolicyRule["type"][] = [
  "asset_allowlist",
  "network_allowlist",
  "destination_denylist",
  "destination_allowlist",
  "supplier_allowlist",
  "max_per_transaction",
  "category_limit",
  "supplier_limit",
  "max_per_day",
  "max_per_week",
  "max_per_month",
  "max_transactions_per_period",
  "business_hours_only",
  "subscription_limit",
  "escrow_limit",
  "require_approval_above"
];

export function evaluatePolicies(input: EvaluationInput): EvaluationResult {
  const reasons: DecisionReason[] = [];
  const matched: EvaluationResult["matchedRules"] = [];
  const versionTag = input.policies.map((p) => `${p.id}@${p.version}`).join(",") || "none";
  const currency = input.policies[0]?.document.currency ?? "USD";
  const ctx: Context = { input, currency, reasons, matched };

  const deny = (code: string, message: string) => {
    reasons.push({ code, outcome: "deny", message });
  };

  if (!input.walletActive) deny("wallet_inactive", "Wallet is not active");
  if (!input.principalAuthorized) deny("principal_not_authorized", "Principal is not authorized to spend from this wallet");
  if (!input.destination) deny("destination_unknown", "Destination does not exist");
  else if (input.destination.status === "blocked") deny("destination_blocked", "Destination is blocked");
  else if (input.destination.status !== "active") deny("destination_unverified", "Destination has not been verified");
  else if (input.destination.network !== input.request.network)
    deny("destination_network_mismatch", "Destination network does not match the requested network");
  if (!(input.request.amount > 0) || !Number.isFinite(input.request.amount)) deny("invalid_amount", "Amount must be a positive number");
  if (input.policies.length === 0) deny("no_active_policy", "No active spending policy is assigned to this wallet");

  for (const policy of input.policies) {
    const rules = [...policy.document.rules].sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
    for (const rule of rules) applyRule(ctx, policy, rule);
  }

  if (input.availableBalance !== null && input.request.amount > input.availableBalance) {
    deny("insufficient_balance", "Available balance is insufficient");
  }

  const hasDeny = reasons.some((r) => r.outcome === "deny");
  const needsApproval = reasons.some((r) => r.outcome === "approval_required");
  return {
    decision: hasDeny ? "deny" : needsApproval ? "approval_required" : "allow",
    reasons,
    matchedRules: matched,
    policyVersion: versionTag,
    evaluatedAt: input.now.toISOString()
  };
}

export function emptyUsage() {
  return {
    total: emptyTotals(),
    count: { day: 0, week: 0, month: 0 },
    byCategory: {},
    bySupplierId: {},
    bySupplierGroup: {},
    subscriptionMonthly: 0
  };
}
