import type { Reason } from "@/components/common";

export interface Balance {
  asset: string;
  available: number;
  reserved: number;
}

export interface WalletRow {
  id: string;
  name: string;
  status: string;
  defaultAsset: string;
  network: string;
  provider: string;
  providerAccountRef: string | null;
  createdAt: string;
  balances: Balance[];
  principal: { id: string; displayName: string; principalType: string };
  assignments: { id: string; effectiveTo: string | null; policy: { id: string; name: string; version: number; status: string } }[];
}

export interface PolicyRow {
  id: string;
  name: string;
  description: string | null;
  version: number;
  status: string;
  currency: string;
  rulesJson: { currency: string; rules: (Record<string, unknown> & { type: string })[] };
  createdAt: string;
  assignments: { id: string; effectiveTo: string | null; wallet: { id: string; name: string } }[];
}

export interface DestinationRow {
  id: string;
  type: string;
  label: string;
  addressOrReference: string;
  network: string;
  status: string;
  supplierId: string | null;
  supplier: { id: string; name: string; category: string; supplierGroup: string } | null;
}

export interface SupplierRow {
  id: string;
  name: string;
  category: string;
  supplierGroup: string;
  status: string;
  externalReference: string | null;
  destinations: { id: string }[];
}

export interface PaymentRow {
  id: string;
  status: string;
  kind: string;
  summary: string;
  amount: number;
  asset: string;
  network: string;
  walletId: string;
  destination: { id: string; label: string; addressOrReference: string };
  purpose: string | null;
  category: string | null;
  initiatedBy: { id: string; displayName: string; principalType: string };
  policyDecision: { id: string; decision: string; policyVersion: string; evaluatedAt: string } | null;
  reasons: Reason[];
  matchedRules: { policyId: string; type: string; outcome: string }[];
  approval: { id: string; status: string; requiredApproverRole: string; decidedBy: string | null; decisionReason: string | null } | null;
  transactionId: string | null;
  externalReference: string | null;
  demo: boolean | null;
  receiptId: string | null;
  failureReason: string | null;
  createdAt: string;
}

export interface ApprovalRow {
  id: string;
  status: string;
  requestedAt: string;
  decidedAt: string | null;
  decisionReason: string | null;
  payment: PaymentRow;
}

export interface SubscriptionRow {
  id: string;
  amount: number;
  asset: string;
  cadence: string;
  status: string;
  nextExecutionAt: string;
  executionCount: number;
  maxExecutions: number | null;
  endsAt: string | null;
  category: string | null;
  purpose: string | null;
  lastResultJson: { status?: string; paymentId?: string; error?: string } | null;
  destination: { label: string };
  wallet: { id: string; name: string };
}

export interface EscrowRow {
  id: string;
  amount: number;
  asset: string;
  state: string;
  releaseConditionJson: { type: string; releaseAt?: string; reference?: string };
  expiresAt: string | null;
  createdAt: string;
  externalComplete: boolean;
  counterpartyAcknowledged: boolean;
  beneficiary: { label: string };
  payerWallet: { id: string; name: string };
}

export interface ReceiptRow {
  id: string;
  createdAt: string;
  keyId: string;
  algorithm: string;
  payloadHash: string;
  transaction: { id: string; amount: number | string; asset: string; network: string; provider: string; demo: boolean; txHashOrReference: string | null; paymentIntentId: string };
}

export interface AuditRow {
  id: string;
  eventType: string;
  resourceType: string;
  resourceId: string;
  outcome: string;
  actorPrincipalId: string | null;
  detailsJson: Record<string, unknown> | null;
  createdAt: string;
}

export interface BillingRow {
  id: string;
  azureSubscriptionId: string;
  resourceId: string | null;
  costCategory: string;
  invoiceReference: string;
  chargeAmount: number;
  chargeCurrency: string;
  status: string;
  paymentIntentId: string | null;
  settlement: { paymentIntentId: string; status: string; asset: string; network: string; settlementAmount: number; externalReference: string | null; demo: boolean | null; receiptId: string | null } | null;
}

export interface PrincipalRow {
  id: string;
  displayName: string;
  principalType: string;
  roles: string[];
}

export interface PaymentPreview {
  decision: string;
  summary: string;
  reasons: Reason[];
}
