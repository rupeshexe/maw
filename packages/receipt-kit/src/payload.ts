import { createHash } from "node:crypto";
import { canonicalize } from "@maw/shared";

export const RECEIPT_VERSION = "maw.receipt.v1";

export interface ReceiptPayload {
  version: string;
  tenantId: string;
  walletId: string;
  paymentIntentId: string;
  transactionId: string;
  initiatorPrincipalId: string;
  destinationReference: string;
  amount: string;
  asset: string;
  network: string;
  provider: string;
  externalReference: string | null;
  demo: boolean;
  policyDecisionId: string;
  policyVersion: string;
  settledAt: string;
  metadataHash: string;
}

export const sha256Hex = (input: string): string => createHash("sha256").update(input, "utf8").digest("hex");

export const hashMetadata = (metadata: unknown): string => sha256Hex(canonicalize(metadata ?? {}));

export const canonicalPayload = (payload: ReceiptPayload): string => canonicalize(payload);

export const hashPayload = (payload: ReceiptPayload): string => sha256Hex(canonicalPayload(payload));
