type Rule = Record<string, unknown> & { type: string };

const money = (v: unknown, currency: string) => `${Number(v).toLocaleString("en-US")} ${currency}`;

export function describeRule(rule: Rule, currency: string): string {
  switch (rule.type) {
    case "max_per_transaction":
      return `No single payment above ${money(rule.amount, currency)}`;
    case "max_per_day":
    case "max_per_week":
    case "max_per_month":
      return `At most ${money(rule.amount, currency)} in total per ${rule.type.replace("max_per_", "")}`;
    case "category_limit":
      return `At most ${money(rule.amount, currency)} per ${rule.period} on "${rule.category}"`;
    case "supplier_limit":
      return `At most ${money(rule.amount, currency)} per ${rule.period} with ${rule.supplierId ? `supplier ${rule.supplierId}` : `the "${rule.supplierGroup}" supplier group`}`;
    case "asset_allowlist":
      return `Only these assets: ${(rule.assets as string[]).join(", ")}`;
    case "network_allowlist":
      return `Only these networks: ${(rule.networks as string[]).join(", ")}`;
    case "destination_allowlist":
      return "Destinations must be managed, verified and active";
    case "destination_denylist":
      return "Listed destinations are always blocked";
    case "supplier_allowlist":
      return "Destinations must belong to an approved supplier";
    case "require_approval_above":
      return `Payments above ${money(rule.amount, currency)} need human approval`;
    case "business_hours_only":
      return `Only between ${rule.startHour}:00 and ${rule.endHour}:00 UTC`;
    case "max_transactions_per_period":
      return `At most ${rule.count} transactions per ${rule.period}`;
    case "subscription_limit":
      return `Subscriptions up to ${money(rule.amount, currency)} per execution${rule.monthlyTotal ? `, ${money(rule.monthlyTotal, currency)} per month` : ""}`;
    case "escrow_limit":
      return `Escrow up to ${money(rule.amount, currency)}`;
    default:
      return rule.type;
  }
}

export const POLICY_TEMPLATE = {
  currency: "USD",
  rules: [
    { type: "category_limit", category: "cloud", period: "month", amount: 100 },
    { type: "supplier_limit", supplierGroup: "approved", period: "month", amount: 500 },
    { type: "destination_allowlist", mode: "strict" },
    { type: "require_approval_above", amount: 250 }
  ]
};
