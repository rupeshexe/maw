import { z } from "zod";
import type { Prisma } from "@maw/db";
import { MawError } from "@maw/shared";
import { RECEIPT_VERSION, hashMetadata, hashPayload, signReceipt, verifyReceipt } from "@maw/receipt-kit";
import type { ReceiptPayload } from "@maw/receipt-kit";
import { audit } from "./audit";
import type { AuditActor } from "./audit";
import { num } from "./context";
import type { Actor, Client, Deps } from "./context";
import { assertWalletAccess } from "./wallets";

export async function createReceipt(
  client: Client,
  deps: Deps,
  actor: AuditActor,
  transactionId: string
) {
  const transaction = await client.transaction.findUniqueOrThrow({
    where: { id: transactionId },
    include: { paymentIntent: { include: { destination: true, decisions: { orderBy: { evaluatedAt: "desc" }, take: 1 } } } }
  });
  const intent = transaction.paymentIntent;
  const decision = intent.decisions[0];
  const payload: ReceiptPayload = {
    version: RECEIPT_VERSION,
    tenantId: transaction.tenantId,
    walletId: intent.walletId,
    paymentIntentId: intent.id,
    transactionId: transaction.id,
    initiatorPrincipalId: intent.initiatedByPrincipalId,
    destinationReference: intent.destination.addressOrReference,
    amount: num(transaction.amount).toString(),
    asset: transaction.asset,
    network: transaction.network,
    provider: transaction.provider,
    externalReference: transaction.txHashOrReference,
    demo: transaction.demo,
    policyDecisionId: decision?.id ?? "none",
    policyVersion: decision?.policyVersion ?? "none",
    settledAt: (transaction.settledAt ?? new Date()).toISOString(),
    metadataHash: hashMetadata({ purpose: intent.purpose, category: intent.category, kind: intent.kind, azure: intent.azureContextJson })
  };
  const signed = await signReceipt(deps.signer, payload);
  const receipt = await client.receipt.create({
    data: {
      tenantId: transaction.tenantId,
      transactionId: transaction.id,
      payloadJson: signed.payload as unknown as Prisma.InputJsonValue,
      payloadHash: signed.payloadHash,
      signature: signed.signature,
      keyId: signed.keyId,
      algorithm: signed.algorithm
    }
  });
  await audit(client, actor, { eventType: "receipt.created", resourceType: "receipt", resourceId: receipt.id, outcome: "success", details: { transactionId, keyId: signed.keyId } });
  return receipt;
}

export async function getReceipt(deps: Deps, actor: Actor, receiptId: string) {
  const receipt = await deps.db.receipt.findFirst({ where: { id: receiptId, tenantId: actor.tenantId }, include: { transaction: { include: { paymentIntent: { include: { wallet: true } } } } } });
  if (!receipt) throw new MawError("not_found", "Receipt not found");
  assertWalletAccess(actor, receipt.transaction.paymentIntent.wallet);
  const { transaction, ...rest } = receipt;
  return { ...rest, paymentIntentId: transaction.paymentIntentId, walletId: transaction.paymentIntent.walletId };
}

export async function listReceipts(deps: Deps, actor: Actor, limit = 100) {
  return deps.db.receipt.findMany({
    where: { tenantId: actor.tenantId },
    include: { transaction: { select: { id: true, amount: true, asset: true, network: true, provider: true, demo: true, txHashOrReference: true, paymentIntentId: true } } },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 500)
  });
}

export async function verifyStoredReceipt(deps: Deps, actor: Actor, receiptId: string) {
  const receipt = await getReceipt(deps, actor, receiptId);
  const result = await verifyReceipt(deps.signer, {
    payload: receipt.payloadJson as unknown as ReceiptPayload,
    payloadHash: receipt.payloadHash,
    signature: receipt.signature,
    keyId: receipt.keyId,
    algorithm: receipt.algorithm
  });
  await audit(deps.db, actor, { eventType: "receipt.verified", resourceType: "receipt", resourceId: receiptId, outcome: result.valid ? "success" : "failure" });
  return { receiptId, ...result };
}

const verifySchema = z.object({
  payload: z.record(z.unknown()),
  payloadHash: z.string().min(64).max(64),
  signature: z.string().min(1),
  keyId: z.string().min(1),
  algorithm: z.string().min(1)
});

export async function verifyProvidedReceipt(deps: Deps, actor: Actor | null, input: unknown) {
  const data = verifySchema.parse(input);
  const result = await verifyReceipt(deps.signer, {
    payload: data.payload as unknown as ReceiptPayload,
    payloadHash: data.payloadHash,
    signature: data.signature,
    keyId: data.keyId,
    algorithm: data.algorithm
  });
  if (actor) {
    await audit(deps.db, actor, { eventType: "receipt.verified", resourceType: "receipt", resourceId: data.payloadHash, outcome: result.valid ? "success" : "failure" });
  }
  return result;
}

export async function receiptSigningInfo(deps: Deps) {
  return { keyId: deps.signer.keyId, algorithm: deps.signer.algorithm, publicKeyPem: await deps.signer.publicKeyPem() };
}

export { hashPayload };
