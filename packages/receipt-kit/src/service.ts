import { canonicalPayload, hashPayload } from "./payload";
import type { ReceiptPayload } from "./payload";
import type { ReceiptSigner } from "./signers";

export interface SignedReceipt {
  payload: ReceiptPayload;
  payloadHash: string;
  signature: string;
  keyId: string;
  algorithm: string;
}

export async function signReceipt(signer: ReceiptSigner, payload: ReceiptPayload): Promise<SignedReceipt> {
  const payloadHash = hashPayload(payload);
  const signature = await signer.sign(payloadHash);
  return { payload, payloadHash, signature, keyId: signer.keyId, algorithm: signer.algorithm };
}

export interface VerificationResult {
  valid: boolean;
  hashMatches: boolean;
  signatureValid: boolean;
  keyId: string;
  algorithm: string;
  reason: string | null;
}

export async function verifyReceipt(
  signer: ReceiptSigner,
  receipt: { payload: ReceiptPayload; payloadHash: string; signature: string; keyId: string; algorithm: string }
): Promise<VerificationResult> {
  const recomputed = hashPayload(receipt.payload);
  const hashMatches = recomputed === receipt.payloadHash;
  let signatureValid = false;
  if (hashMatches) {
    try {
      signatureValid = await signer.verify(recomputed, receipt.signature, receipt.keyId);
    } catch {
      signatureValid = false;
    }
  }
  const valid = hashMatches && signatureValid;
  return {
    valid,
    hashMatches,
    signatureValid,
    keyId: receipt.keyId,
    algorithm: receipt.algorithm,
    reason: valid ? null : !hashMatches ? "payload hash does not match payload" : "signature verification failed"
  };
}

export { canonicalPayload };
