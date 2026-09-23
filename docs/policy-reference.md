# Policy reference

A policy is a JSON document interpreted by the MAW policy engine. Policies are data; no policy field is ever executed as code. Every change creates a new version, and every decision records the policy versions it was evaluated against.

```json
{
  "currency": "USD",
  "rules": [
    { "type": "max_per_month", "amount": 1000 },
    { "type": "category_limit", "category": "cloud", "period": "month", "amount": 100 },
    { "type": "supplier_limit", "supplierGroup": "approved", "period": "month", "amount": 500 },
    { "type": "destination_allowlist", "mode": "strict" },
    { "type": "require_approval_above", "amount": 250 }
  ]
}
```

## Rule types

| Type | Fields | Effect |
| --- | --- | --- |
| `max_per_transaction` | `amount` | Denies a single payment above the amount |
| `max_per_day`, `max_per_week`, `max_per_month` | `amount` | Caps total spend in the current UTC period |
| `category_limit` | `category`, `period`, `amount` | Caps spend in one category |
| `supplier_limit` | `supplierId` or `supplierGroup`, `period`, `amount` | Caps spend with a supplier or supplier group |
| `asset_allowlist` | `assets[]` | Only listed assets may be spent |
| `network_allowlist` | `networks[]` | Only listed networks may be used |
| `destination_allowlist` | `mode: "strict"`, optional `destinationIds[]` | Destination must be managed, verified and active, and listed when IDs are given |
| `destination_denylist` | `destinationIds[]`, `addresses[]` | Listed destinations are always denied |
| `supplier_allowlist` | `supplierGroups[]`, `supplierIds[]` | Destination must belong to a listed, active supplier |
| `require_approval_above` | `amount` | Payments above the amount need human approval |
| `business_hours_only` | `startHour`, `endHour`, `days[]` | Payments only inside the UTC window |
| `max_transactions_per_period` | `period`, `count` | Velocity limit |
| `subscription_limit` | `amount`, optional `monthlyTotal` | Per-execution and monthly caps for subscriptions |
| `escrow_limit` | `amount` | Cap for a single escrow |

`period` is one of `day`, `week` or `month`. Periods are UTC calendar periods.

## Evaluation

The engine checks, in order: wallet status, principal authorization, destination existence and status, amount validity, asset, network, denylist, allowlists, per-transaction cap, category and supplier caps, aggregate period caps, velocity, business hours, subscription and escrow limits, approval threshold and available balance.

- A wallet with no active policy assignment is denied.
- Any deny reason produces `deny`, regardless of other rules passing.
- Without a deny, an approval threshold produces `approval_required`.
- Otherwise the decision is `allow`.
- When a wallet has several assigned policies, all of them must pass.

Usage counted against caps includes settled, in-flight and reserved payments so that pending requests cannot be used to exceed a limit.

## Decision reasons

Each non-passing check contributes a reason with a stable `code`, an `outcome`, a human-readable `message` and, where relevant, the limit, amount used and amount remaining.

```json
{
  "code": "category_limit_exceeded",
  "outcome": "deny",
  "message": "Spend in category \"cloud\" would exceed the month limit of 100.00 USD",
  "rule": "category_limit",
  "detail": { "period": "month", "limit": 100, "used": 80, "requested": 30, "remaining": 20 }
}
```
