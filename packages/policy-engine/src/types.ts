import type { Decision, Period } from "@maw/shared";
import type { PolicyDocument } from "./schema";

export type PaymentKind = "payment" | "subscription" | "escrow";

export interface EvaluationPolicy {
  id: string;
  name: string;
  version: number;
  document: PolicyDocument;
}

export interface EvaluationDestination {
  id: string;
  status: string;
  address: string;
  network: string;
  supplierId: string | null;
  supplierGroup: string | null;
  category: string | null;
  supplierStatus: string | null;
}

export interface PeriodTotals {
  day: number;
  week: number;
  month: number;
}

export interface PeriodCounts {
  day: number;
  week: number;
  month: number;
}

export interface UsageSnapshot {
  total: PeriodTotals;
  count: PeriodCounts;
  byCategory: Record<string, PeriodTotals>;
  bySupplierId: Record<string, PeriodTotals>;
  bySupplierGroup: Record<string, PeriodTotals>;
  subscriptionMonthly: number;
}

export interface EvaluationRequest {
  amount: number;
  asset: string;
  network: string;
  category: string | null;
  kind: PaymentKind;
}

export interface EvaluationInput {
  now: Date;
  walletActive: boolean;
  principalAuthorized: boolean;
  policies: EvaluationPolicy[];
  request: EvaluationRequest;
  destination: EvaluationDestination | null;
  usage: UsageSnapshot;
  availableBalance: number | null;
}

export interface DecisionReason {
  code: string;
  outcome: "deny" | "approval_required" | "pass";
  message: string;
  rule?: string;
  policyId?: string;
  detail?: Record<string, unknown>;
}

export interface EvaluationResult {
  decision: Decision;
  reasons: DecisionReason[];
  matchedRules: { policyId: string; policyVersion: number; type: string; outcome: "deny" | "approval_required" | "pass" }[];
  policyVersion: string;
  evaluatedAt: string;
}

export type { Period };
