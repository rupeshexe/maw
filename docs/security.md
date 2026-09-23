# Security model

MAW handles payment instructions. It assumes an AI agent can make mistakes, emit malformed requests or be manipulated by untrusted content. An agent request is an input to MAW, never an authorization decision.

## Principles

- **Policy before payment.** Every payment request is evaluated against the wallet's spending policies before anything is executed.
- **Identity first.** Every actor is an authenticated principal scoped to a tenant. Tenant IDs come from the validated token, never from request bodies.
- **Least privilege.** Agents can only act on wallets assigned to them and cannot manage policies, destinations or approvals.
- **Separation of duties.** Policy administration, payment initiation and approval are separate roles. An initiator cannot approve their own payment, and agent principals cannot decide approvals.
- **Safe defaults.** Wallets without an active policy deny everything. Demo mode never submits external transfers. Missing live credentials never fall back to placeholder values.

## Controls

| Area | Control |
| --- | --- |
| Authentication | Entra ID access tokens validated for signature, issuer, audience and expiry |
| Authorization | Role checks and wallet ownership checks in the domain layer on every operation |
| Destinations | Only managed, verified destinations can be paid; agents cannot introduce new ones |
| Concurrency | Wallet row locking with reservation accounting prevents concurrent requests exceeding caps |
| Idempotency | Unique key per tenant, wallet and operation; mismatched retries are rejected |
| Execution | Conditional status claims ensure a payment is submitted at most once |
| Re-evaluation | Hard policy constraints are re-checked at approval time and for every subscription execution |
| Receipts | Canonical JSON, SHA-256 hash, asymmetric signature, key ID and algorithm stored with each receipt |
| Webhooks | HMAC-SHA-256 signature verification and event deduplication |
| Audit | Append-only events for identity, policy, payment, approval, receipt, subscription, escrow and integration changes |
| Secrets | Read from environment or Azure Key Vault; never stored in source control or logged |

## Receipt integrity

A receipt payload contains the version, tenant, wallet, payment intent, transaction, initiator, destination, amount, asset, network, provider, external reference, policy decision and version, settlement time and a hash of the request metadata. The payload is canonicalized with sorted keys, hashed with SHA-256 and the hash is signed.

- Local development signs with an Ed25519 key supplied through `RECEIPT_SIGNING_KEY_PEM`. Without one, demo mode generates an ephemeral key, so receipts cannot be verified after a restart. Run `npm run keygen` to create a persistent development key.
- In Azure, receipts are signed with an ECDSA P-256 key held in Key Vault (`RECEIPT_SIGNER=keyvault`). Private key material never reaches the application.
- Verification recomputes the hash and checks the signature against the key identified in the receipt.

## Demo mode

Demo mode is a real application mode with a deterministic local ledger. It is labelled throughout the UI, never submits external transfers, produces valid MAW receipts and exercises all policy logic. Demo results are not blockchain-final. Demo authentication is rejected when `MAW_MODE=live`.

## Live providers

Live payment adapters run only when explicitly configured. The stablecoin adapter discovers provider capabilities and refuses unsupported asset and network combinations, conversions or cancellations before calling the provider. MAW records a transfer as settled only when the provider returns a confirmed external reference.

Compliance obligations, including KYC, AML and sanctions screening, custody and issuer restrictions, remain the responsibility of the configured provider and the deploying organization.

## Reporting a vulnerability

Please report suspected vulnerabilities privately through the repository's security advisory feature rather than opening a public issue.
