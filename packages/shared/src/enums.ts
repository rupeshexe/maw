export const PRINCIPAL_TYPES = ["human", "agent", "service"] as const;
export type PrincipalType = (typeof PRINCIPAL_TYPES)[number];

export const ROLES = [
  "MAW.Admin",
  "MAW.PolicyAdmin",
  "MAW.WalletOperator",
  "MAW.Approver",
  "MAW.Auditor",
  "MAW.Agent"
] as const;
export type Role = (typeof ROLES)[number];

export const WALLET_STATUSES = ["active", "suspended"] as const;
export type WalletStatus = (typeof WALLET_STATUSES)[number];

export const POLICY_STATUSES = ["draft", "active", "retired"] as const;
export type PolicyStatus = (typeof POLICY_STATUSES)[number];

export const DESTINATION_TYPES = [
  "blockchain_address",
  "supplier",
  "internal_wallet",
  "bank_recipient"
] as const;
export type DestinationType = (typeof DESTINATION_TYPES)[number];

export const DESTINATION_STATUSES = ["pending_verification", "active", "blocked"] as const;
export type DestinationStatus = (typeof DESTINATION_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "draft",
  "requested",
  "evaluating",
  "denied",
  "approval_required",
  "approved",
  "executing",
  "submitted",
  "settled",
  "failed",
  "cancelled"
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PENDING_PAYMENT_STATUSES: PaymentStatus[] = [
  "requested",
  "evaluating",
  "approval_required",
  "approved",
  "executing",
  "submitted"
];

export const COUNTED_PAYMENT_STATUSES: PaymentStatus[] = [...PENDING_PAYMENT_STATUSES, "settled"];

export const DECISIONS = ["allow", "deny", "approval_required"] as const;
export type Decision = (typeof DECISIONS)[number];

export const APPROVAL_STATUSES = ["pending", "approved", "rejected", "expired"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const TRANSACTION_STATUSES = ["submitted", "settled", "failed", "cancelled"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const SUBSCRIPTION_STATUSES = ["active", "paused", "cancelled", "completed"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const CADENCES = ["daily", "weekly", "monthly"] as const;
export type Cadence = (typeof CADENCES)[number];

export const ESCROW_STATES = [
  "created",
  "funding_pending",
  "funded",
  "release_pending",
  "released",
  "refunded",
  "expired",
  "disputed"
] as const;
export type EscrowState = (typeof ESCROW_STATES)[number];

export const PERIODS = ["day", "week", "month"] as const;
export type Period = (typeof PERIODS)[number];

export const ASSETS = ["USDC", "USDT", "USD", "EUR", "DEMO"] as const;
export type AssetCode = string;

export const PROVIDERS = ["demo-ledger", "stablecoin-provider"] as const;
export type ProviderId = (typeof PROVIDERS)[number];
