# API reference

All endpoints are under `/v1` and return JSON. Errors have one shape:

```json
{ "error": { "code": "policy_denied", "message": "...", "details": null } }
```

Codes: `validation_error`, `unauthenticated`, `forbidden`, `not_found`, `conflict`, `idempotency_mismatch`, `policy_denied`, `invalid_state`, `insufficient_funds`, `provider_unsupported`, `provider_error`, `misconfigured`.

## Authentication

- `AUTH_MODE=entra`: send `Authorization: Bearer <access token>`. Tokens are validated against the Entra tenant JWKS, issuer and audience. Roles come from the token `roles` claim.
- `AUTH_MODE=demo`: send `x-demo-user: <subject>` where the subject is a seeded principal (`demo-admin`, `demo-policy`, `demo-operator`, `demo-approver`, `demo-auditor`, `demo-agent`). Demo authentication is refused when `MAW_MODE=live`.

## Roles

| Role | Capabilities |
| --- | --- |
| `MAW.Admin` | Full administrative access; cannot approve their own requests |
| `MAW.PolicyAdmin` | Create, version, assign and retire policies; verify or block destinations and suppliers |
| `MAW.WalletOperator` | Create and suspend wallets, manage suppliers and destinations, release or refund escrow, Azure billing |
| `MAW.Approver` | Approve or reject payments awaiting approval |
| `MAW.Auditor` | Read audit events, receipts, approvals and billing |
| `MAW.Agent` | Request payments, subscriptions and escrows from wallets assigned to it |

## Payments

`POST /v1/payment-intents` requires an `Idempotency-Key` header (or `idempotencyKey` field).

```bash
curl -X POST http://localhost:4000/v1/payment-intents \
  -H "content-type: application/json" \
  -H "x-demo-user: demo-agent" \
  -H "idempotency-key: invoice-2026-09-hosting" \
  -d '{
    "walletId": "<wallet id>",
    "destinationId": "<destination id>",
    "amount": 42,
    "category": "cloud",
    "purpose": "Hosting invoice"
  }'
```

```json
{
  "id": "cm...",
  "status": "settled",
  "summary": "Payment of 42.00 USDC to Contoso Cloud Hosting settled on the demo ledger (no external funds moved).",
  "policyDecision": { "decision": "allow", "policyVersion": "cm...@1" },
  "reasons": [],
  "receiptId": "cm...",
  "demo": true
}
```

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/payment-intents` | Create and evaluate a payment; executes when allowed |
| GET | `/payment-intents` | Filter by `status`, `walletId`, `limit` |
| GET | `/payment-intents/{id}` | Status, decision, reasons, receipt |
| POST | `/payment-intents/{id}/approve` | Approver only; initiator cannot approve |
| POST | `/payment-intents/{id}/reject` | Approver only |
| POST | `/payment-intents/{id}/cancel` | Initiator or operator, before execution |
| POST | `/policy-evaluations/preview` | Evaluate without creating a payment |
| GET | `/approvals` | Filter by `status` |

## Wallets and policies

| Method | Path |
| --- | --- |
| GET, POST | `/wallets` |
| GET | `/wallets/{id}`, `/wallets/{id}/balance`, `/wallets/{id}/spend-progress` |
| POST | `/wallets/{id}/status`, `/wallets/{id}/fund` (demo ledger only) |
| GET, POST | `/policies` |
| GET, PUT | `/policies/{id}` |
| POST | `/policies/{id}/status` |
| POST | `/policy-assignments` |
| DELETE | `/policy-assignments/{id}` |

## Suppliers and destinations

| Method | Path |
| --- | --- |
| GET, POST | `/suppliers`, `/destinations` |
| POST | `/suppliers/{id}/status`, `/destinations/{id}/status` |

## Subscriptions and escrow

| Method | Path |
| --- | --- |
| GET, POST | `/subscriptions` |
| POST | `/subscriptions/{id}/status` |
| GET, POST | `/escrows` (`Idempotency-Key` required for POST) |
| GET | `/escrows/{id}`, `/escrows/{id}/eligibility` |
| POST | `/escrows/{id}/release`, `/refund`, `/dispute`, `/signals` |

Release conditions: `manual`, `time` (`releaseAt`), `external_reference` (`reference`) and `counterparty_ack`. They are evaluated as data.

## Receipts, conversions, billing and audit

| Method | Path |
| --- | --- |
| GET | `/receipts`, `/receipts/{id}`, `/receipts/{id}/verify`, `/receipts/signing-key` |
| POST | `/receipts/verify` |
| GET | `/conversions` |
| POST | `/conversions/quotes`, `/conversions/{id}/execute` |
| GET, POST | `/billing/records` |
| POST | `/billing/records/{id}/link`, `/billing/reconcile` |
| GET | `/audit-events` |

## Platform

| Method | Path |
| --- | --- |
| GET | `/health` (unauthenticated) |
| GET | `/v1/me`, `/v1/config`, `/v1/overview`, `/v1/integrations`, `/v1/principals` |
| POST | `/v1/webhooks/{provider}` (signature-authenticated, unauthenticated by token) |
