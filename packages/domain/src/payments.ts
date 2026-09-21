import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@maw/db";
import { MawError, PENDING_PAYMENT_STATUSES, addAmounts, canonicalize, formatAmount, subtractAmounts } from "@maw/shared";
import { evaluatePolicies } from "@maw/policy-engine";
import type { EvaluationResult, PaymentKind } from "@maw/policy-engine";
import type { TransferResult } from "@maw/payment-adapters";
import { audit } from "./audit";
import { isPrivileged, isUniqueViolation, num, requireRole } from "./context";
import type { Actor, Client, Deps } from "./context";
import { activePoliciesForWallet } from "./policies";
import { createReceipt } from "./receipts";
import { computeUsage } from "./usage";
import { assertWalletAccess, loadWallet } from "./wallets";

export const paymentSchema = z.object({
  walletId: z.string().min(1),
  destinationId: z.string().min(1),
  amount: z.number().positive().finite(),
  asset: z.string().min(2).max(12).optional(),
  network: z.string().min(2).max(40).optional(),
  purpose: z.string().max(300).optional(),
  category: z.string().max(60).optional(),
  idempotencyKey: z.string().min(8).max(200),
  kind: z.enum(["payment", "subscription", "escrow"]).default("payment"),
  subscriptionId: z.string().optional(),
  escrowId: z.string().optional(),
  azureContext: z
    .object({
      azureSubscriptionId: z.string().min(1),
      resourceId: z.string().optional(),
      costCategory: z.string().min(1),
      invoiceReference: z.string().min(1)
    })
    .optional()
});

export type PaymentRequest = z.infer<typeof paymentSchema>;

const LOCAL_LEDGER = "demo-ledger";

const requestHashOf = (req: PaymentRequest, asset: string, network: string) =>
  createHash("sha256")
    .update(
      canonicalize({
        walletId: req.walletId,
        destinationId: req.destinationId,
        amount: req.amount,
        asset,
        network,
        purpose: req.purpose ?? null,
        category: req.category ?? null,
        kind: req.kind,
        azure: req.azureContext ?? null
      })
    )
    .digest("hex");

interface EvalParams {
  walletId: string;
  destinationId: string;
  amount: number;
  asset: string;
  network: string;
  category: string | null;
  kind: PaymentKind;
  now: Date;
  excludeIntentId?: string;
  ignoreBalance?: boolean;
  liveBalance?: number | null;
  principalAuthorized: boolean;
}

async function evaluateRequest(client: Client, deps: Deps, tenantId: string, params: EvalParams): Promise<EvaluationResult> {
  const wallet = await loadWallet(client, tenantId, params.walletId);
  const destination = await client.destination.findFirst({ where: { id: params.destinationId, tenantId }, include: { supplier: true } });
  const policies = await activePoliciesForWallet(client, tenantId, wallet.id, params.now);
  const usage = await computeUsage(client, tenantId, wallet.id, params.now, params.excludeIntentId);
  let availableBalance: number | null = null;
  if (!params.ignoreBalance) {
    if (wallet.provider === LOCAL_LEDGER) {
      const row = await client.walletBalance.findUnique({ where: { walletId_asset: { walletId: wallet.id, asset: params.asset } } });
      availableBalance = num(row?.available);
    } else if (params.liveBalance !== undefined && params.liveBalance !== null) {
      const pending = await client.paymentIntent.aggregate({
        where: { tenantId, walletId: wallet.id, asset: params.asset, status: { in: PENDING_PAYMENT_STATUSES }, ...(params.excludeIntentId ? { id: { not: params.excludeIntentId } } : {}) },
        _sum: { amount: true }
      });
      availableBalance = subtractAmounts(params.liveBalance, num(pending._sum.amount));
    }
  }
  const result = evaluatePolicies({
    now: params.now,
    walletActive: wallet.status === "active",
    principalAuthorized: params.principalAuthorized,
    policies,
    request: { amount: params.amount, asset: params.asset, network: params.network, category: params.category, kind: params.kind },
    destination: destination
      ? {
          id: destination.id,
          status: destination.status,
          address: destination.addressOrReference,
          network: destination.network,
          supplierId: destination.supplierId,
          supplierGroup: destination.supplier?.supplierGroup ?? null,
          category: destination.supplier?.category ?? null,
          supplierStatus: destination.supplier?.status ?? null
        }
      : null,
    usage,
    availableBalance
  });
  if (!params.ignoreBalance && wallet.provider !== LOCAL_LEDGER && availableBalance === null) {
    result.reasons.push({ code: "balance_unavailable", outcome: "deny", message: "Provider balance could not be confirmed" });
    result.decision = "deny";
  }
  const adapter = deps.adapters.has(wallet.provider) ? deps.adapters.get(wallet.provider) : null;
  if (!adapter) {
    result.reasons.push({ code: "provider_unavailable", outcome: "deny", message: `Provider "${wallet.provider}" is not configured` });
    result.decision = "deny";
  } else {
    const caps = await adapter.capabilities().catch(() => null);
    const entry = caps?.assets.find((a) => a.asset === params.asset);
    if (!caps || !entry || !entry.networks.includes(params.network)) {
      result.reasons.push({ code: "provider_unsupported", outcome: "deny", message: `${wallet.provider} does not support ${params.asset} on ${params.network}` });
      result.decision = "deny";
    }
  }
  return result;
}

async function reserveFunds(tx: Client, tenantId: string, walletId: string, asset: string, amount: number) {
  const row = await tx.walletBalance.findUnique({ where: { walletId_asset: { walletId, asset } } });
  if (!row || num(row.available) < amount) throw new MawError("insufficient_funds", "Available balance is insufficient");
  await tx.walletBalance.update({ where: { walletId_asset: { walletId, asset } }, data: { available: subtractAmounts(num(row.available), amount), reserved: addAmounts(num(row.reserved), amount) } });
}

export async function releaseFunds(tx: Client, walletId: string, asset: string, amount: number) {
  const row = await tx.walletBalance.findUnique({ where: { walletId_asset: { walletId, asset } } });
  if (!row) return;
  await tx.walletBalance.update({ where: { walletId_asset: { walletId, asset } }, data: { available: addAmounts(num(row.available), amount), reserved: Math.max(0, subtractAmounts(num(row.reserved), amount)) } });
}

async function consumeReservation(tx: Client, walletId: string, asset: string, amount: number) {
  const row = await tx.walletBalance.findUnique({ where: { walletId_asset: { walletId, asset } } });
  if (!row) return;
  await tx.walletBalance.update({ where: { walletId_asset: { walletId, asset } }, data: { reserved: Math.max(0, subtractAmounts(num(row.reserved), amount)) } });
}

const lockWallet = (tx: Client, walletId: string) => tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${walletId} FOR UPDATE`;

const intentInclude = {
  destination: true,
  decisions: { orderBy: { evaluatedAt: "desc" as const } },
  approvals: { orderBy: { requestedAt: "desc" as const } },
  transactions: { include: { receipts: true }, orderBy: { createdAt: "desc" as const } },
  wallet: { select: { id: true, name: true, provider: true, principalId: true, defaultAsset: true } },
  initiator: { select: { id: true, displayName: true, principalType: true } }
};

export async function loadIntentView(client: Client, tenantId: string, intentId: string) {
  const intent = await client.paymentIntent.findFirst({ where: { id: intentId, tenantId }, include: intentInclude });
  if (!intent) throw new MawError("not_found", "Payment intent not found");
  return intent;
}

type IntentRecord = Awaited<ReturnType<typeof loadIntentView>>;

export function toPaymentResponse(intent: IntentRecord) {
  const decision = intent.decisions[0];
  const transaction = intent.transactions[0];
  const receipt = transaction?.receipts[0];
  const reasons = (decision?.reasonsJson as { code: string; outcome: string; message: string }[] | undefined) ?? [];
  const amountText = formatAmount(num(intent.amount), intent.asset);
  let summary: string;
  switch (intent.status) {
    case "denied":
      summary = `Payment of ${amountText} was denied: ${reasons.filter((r) => r.outcome === "deny").map((r) => r.message).join("; ") || "policy denied the request"}.`;
      break;
    case "approval_required":
      summary = `Payment of ${amountText} requires approval before it can be executed.`;
      break;
    case "settled":
      summary = `Payment of ${amountText} to ${intent.destination.label} settled${transaction?.demo ? " on the demo ledger (no external funds moved)" : ""}.`;
      break;
    case "submitted":
      summary = `Payment of ${amountText} to ${intent.destination.label} was submitted to the provider and is awaiting confirmation.`;
      break;
    case "failed":
      summary = `Payment of ${amountText} failed${intent.failureReason ? `: ${intent.failureReason}` : ""}.`;
      break;
    case "cancelled":
      summary = `Payment of ${amountText} was cancelled.`;
      break;
    default:
      summary = `Payment of ${amountText} is ${intent.status.replace(/_/g, " ")}.`;
  }
  return {
    id: intent.id,
    status: intent.status,
    kind: intent.kind,
    summary,
    amount: num(intent.amount),
    asset: intent.asset,
    network: intent.network,
    walletId: intent.walletId,
    destination: { id: intent.destination.id, label: intent.destination.label, addressOrReference: intent.destination.addressOrReference },
    purpose: intent.purpose,
    category: intent.category,
    initiatedBy: intent.initiator,
    policyDecision: decision
      ? { id: decision.id, decision: decision.decision, policyVersion: decision.policyVersion, evaluatedAt: decision.evaluatedAt }
      : null,
    reasons,
    matchedRules: decision?.matchedRulesJson ?? [],
    approval: intent.approvals[0]
      ? { id: intent.approvals[0].id, status: intent.approvals[0].status, requiredApproverRole: intent.approvals[0].requiredApproverRole, decidedBy: intent.approvals[0].decidedBy, decisionReason: intent.approvals[0].decisionReason }
      : null,
    transactionId: transaction?.id ?? null,
    externalReference: intent.providerTransactionRef,
    demo: transaction?.demo ?? null,
    receiptId: receipt?.id ?? null,
    failureReason: intent.failureReason,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt
  };
}

export type PaymentResponse = ReturnType<typeof toPaymentResponse>;

export async function previewPolicyEvaluation(deps: Deps, actor: Actor, input: unknown) {
  const data = paymentSchema.omit({ idempotencyKey: true }).parse(input);
  const wallet = await loadWallet(deps.db, actor.tenantId, data.walletId);
  assertWalletAccess(actor, wallet);
  const asset = data.asset ?? wallet.defaultAsset;
  const network = data.network ?? wallet.network;
  const result = await evaluateRequest(deps.db, deps, actor.tenantId, {
    walletId: wallet.id,
    destinationId: data.destinationId,
    amount: data.amount,
    asset,
    network,
    category: data.category ?? null,
    kind: data.kind,
    now: new Date(),
    principalAuthorized: true,
    liveBalance: wallet.provider === LOCAL_LEDGER ? undefined : await liveBalance(deps, wallet)
  });
  return {
    decision: result.decision,
    reasons: result.reasons,
    matchedRules: result.matchedRules,
    summary:
      result.decision === "allow"
        ? "The request satisfies all active spending policies."
        : result.decision === "approval_required"
          ? "The request is permitted but requires approval."
          : `The request would be denied: ${result.reasons.filter((r) => r.outcome === "deny").map((r) => r.message).join("; ")}.`
  };
}

async function liveBalance(deps: Deps, wallet: { provider: string; providerAccountRef: string | null; defaultAsset: string }): Promise<number | null> {
  if (!wallet.providerAccountRef) return null;
  const adapter = deps.adapters.get(wallet.provider);
  const result = await adapter.getBalance(wallet.providerAccountRef, wallet.defaultAsset).catch(() => null);
  return result ? result.available : null;
}

export interface SubmitOptions {
  execute?: boolean;
}

export async function submitPayment(deps: Deps, actor: Actor, raw: unknown, options: SubmitOptions = {}) {
  const req = paymentSchema.parse(raw);
  const wallet = await loadWallet(deps.db, actor.tenantId, req.walletId);
  if (!actor.system && !isPrivileged(actor) && wallet.principalId !== actor.principalId) {
    throw new MawError("forbidden", "Principal is not authorized to spend from this wallet");
  }
  const asset = req.asset ?? wallet.defaultAsset;
  const network = req.network ?? wallet.network;
  const requestHash = requestHashOf(req, asset, network);

  const existing = await deps.db.paymentIntent.findUnique({
    where: { tenantId_walletId_idempotencyKey: { tenantId: actor.tenantId, walletId: wallet.id, idempotencyKey: req.idempotencyKey } },
    select: { id: true, requestHash: true }
  });
  if (existing) return replay(deps, actor, existing, requestHash);

  const balanceLive = wallet.provider === LOCAL_LEDGER ? undefined : await liveBalance(deps, wallet);
  const now = new Date();

  let created: { intentId: string; decision: EvaluationResult["decision"] };
  try {
    created = await deps.db.$transaction(
      async (tx) => {
        await lockWallet(tx, wallet.id);
        const evaluation = await evaluateRequest(tx, deps, actor.tenantId, {
          walletId: wallet.id,
          destinationId: req.destinationId,
          amount: req.amount,
          asset,
          network,
          category: req.category ?? null,
          kind: req.kind,
          now,
          principalAuthorized: true,
          liveBalance: balanceLive
        });
        const destination = await tx.destination.findFirst({ where: { id: req.destinationId, tenantId: actor.tenantId } });
        if (!destination) throw new MawError("not_found", "Destination not found");
        const status = evaluation.decision === "deny" ? "denied" : evaluation.decision === "approval_required" ? "approval_required" : "approved";
        const intent = await tx.paymentIntent.create({
          data: {
            tenantId: actor.tenantId,
            walletId: wallet.id,
            initiatedByPrincipalId: actor.principalId,
            amount: req.amount,
            currency: "USD",
            asset,
            network,
            destinationId: destination.id,
            purpose: req.purpose,
            category: req.category,
            idempotencyKey: req.idempotencyKey,
            requestHash,
            status,
            kind: req.kind,
            subscriptionId: req.subscriptionId,
            escrowId: req.escrowId,
            azureContextJson: (req.azureContext ?? undefined) as Prisma.InputJsonValue | undefined
          }
        });
        const decision = await tx.policyDecision.create({
          data: {
            tenantId: actor.tenantId,
            paymentIntentId: intent.id,
            decision: evaluation.decision,
            reasonsJson: evaluation.reasons as unknown as Prisma.InputJsonValue,
            matchedRulesJson: evaluation.matchedRules as unknown as Prisma.InputJsonValue,
            policyVersion: evaluation.policyVersion,
            evaluatedAt: now
          }
        });
        await audit(tx, actor, { eventType: "payment.requested", resourceType: "payment_intent", resourceId: intent.id, outcome: "pending", details: { amount: req.amount, asset, network, kind: req.kind, walletId: wallet.id } });
        await audit(tx, actor, {
          eventType: "policy.decision",
          resourceType: "payment_intent",
          resourceId: intent.id,
          outcome: evaluation.decision === "deny" ? "denied" : "success",
          details: { decision: evaluation.decision, decisionId: decision.id, reasons: evaluation.reasons.map((r) => r.code) }
        });
        if (evaluation.decision !== "deny") {
          if (wallet.provider === LOCAL_LEDGER) await reserveFunds(tx, actor.tenantId, wallet.id, asset, req.amount);
          if (evaluation.decision === "approval_required") {
            const approval = await tx.approvalRequest.create({ data: { tenantId: actor.tenantId, paymentIntentId: intent.id } });
            await audit(tx, actor, { eventType: "approval.requested", resourceType: "approval", resourceId: approval.id, outcome: "pending", details: { paymentIntentId: intent.id } });
          }
        }
        return { intentId: intent.id, decision: evaluation.decision };
      },
      { timeout: 20000 }
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await deps.db.paymentIntent.findUnique({
        where: { tenantId_walletId_idempotencyKey: { tenantId: actor.tenantId, walletId: wallet.id, idempotencyKey: req.idempotencyKey } },
        select: { id: true, requestHash: true }
      });
      if (raced) return replay(deps, actor, raced, requestHash);
    }
    throw error;
  }

  if (created.decision === "allow" && req.kind !== "escrow" && options.execute !== false) {
    await executeIntent(deps, actor, created.intentId);
  }
  return toPaymentResponse(await loadIntentView(deps.db, actor.tenantId, created.intentId));
}

async function replay(deps: Deps, actor: Actor, existing: { id: string; requestHash: string }, requestHash: string) {
  if (existing.requestHash !== requestHash) {
    throw new MawError("idempotency_mismatch", "Idempotency key was already used with a different request payload");
  }
  return toPaymentResponse(await loadIntentView(deps.db, actor.tenantId, existing.id));
}

export async function executeIntent(deps: Deps, actor: Pick<Actor, "tenantId" | "principalId">, intentId: string) {
  const claim = await deps.db.paymentIntent.updateMany({ where: { id: intentId, tenantId: actor.tenantId, status: "approved" }, data: { status: "executing" } });
  if (claim.count === 0) throw new MawError("invalid_state", "Payment intent is not ready for execution");
  const intent = await deps.db.paymentIntent.findUniqueOrThrow({ where: { id: intentId }, include: { wallet: true, destination: true } });
  await audit(deps.db, actor, { eventType: "payment.executing", resourceType: "payment_intent", resourceId: intentId, outcome: "pending" });
  let result: TransferResult;
  try {
    const adapter = deps.adapters.get(intent.wallet.provider);
    result = await adapter.transfer({
      idempotencyKey: `${intent.tenantId}:${intent.id}`,
      fromAccountRef: intent.wallet.providerAccountRef,
      destination: { type: intent.destination.type, addressOrReference: intent.destination.addressOrReference, network: intent.destination.network },
      amount: num(intent.amount),
      asset: intent.asset,
      network: intent.network,
      memo: intent.purpose ?? undefined
    });
  } catch (error) {
    result = {
      status: "failed",
      reference: null,
      demo: intent.wallet.provider === LOCAL_LEDGER,
      provider: intent.wallet.provider,
      failureReason: error instanceof MawError ? error.message : "provider_request_failed",
      metadata: {}
    };
  }
  await finalizeTransfer(deps, actor, intentId, result);
  return toPaymentResponse(await loadIntentView(deps.db, intent.tenantId, intentId));
}

export async function finalizeTransfer(
  deps: Deps,
  actor: Pick<Actor, "tenantId" | "principalId">,
  intentId: string,
  result: TransferResult,
  existingTransactionId?: string
) {
  await deps.db.$transaction(
    async (tx) => {
      const intent = await tx.paymentIntent.findUniqueOrThrow({ where: { id: intentId }, include: { wallet: true } });
      await lockWallet(tx, intent.walletId);
      const local = intent.wallet.provider === LOCAL_LEDGER;
      const amount = num(intent.amount);
      const data = {
        status: result.status,
        txHashOrReference: result.reference,
        demo: result.demo,
        settlementMetadataJson: { ...result.metadata, failureReason: result.failureReason ?? null } as unknown as Prisma.InputJsonValue,
        settledAt: result.status === "settled" ? (result.settledAt ? new Date(result.settledAt) : new Date()) : null
      };
      const transaction = existingTransactionId
        ? await tx.transaction.update({ where: { id: existingTransactionId }, data })
        : await tx.transaction.create({ data: { tenantId: intent.tenantId, paymentIntentId: intent.id, provider: result.provider, network: intent.network, asset: intent.asset, amount, ...data } });
      if (result.status === "settled") {
        if (local) await consumeReservation(tx, intent.walletId, intent.asset, amount);
        await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: "settled", providerTransactionRef: result.reference } });
        await audit(tx, actor, { eventType: "payment.settled", resourceType: "payment_intent", resourceId: intent.id, outcome: "success", details: { transactionId: transaction.id, reference: result.reference, demo: result.demo } });
        await createReceipt(tx, deps, actor, transaction.id);
        await linkBilling(tx, intent.id, transaction.id);
      } else if (result.status === "submitted") {
        await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: "submitted", providerTransactionRef: result.reference } });
        await audit(tx, actor, { eventType: "payment.submitted", resourceType: "payment_intent", resourceId: intent.id, outcome: "pending", details: { transactionId: transaction.id, reference: result.reference } });
      } else {
        if (local) await releaseFunds(tx, intent.walletId, intent.asset, amount);
        await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: result.status === "cancelled" ? "cancelled" : "failed", failureReason: result.failureReason ?? "transfer_failed", providerTransactionRef: result.reference } });
        await audit(tx, actor, { eventType: "payment.failed", resourceType: "payment_intent", resourceId: intent.id, outcome: "failure", details: { transactionId: transaction.id, reason: result.failureReason ?? null } });
      }
    },
    { timeout: 20000 }
  );
}

async function linkBilling(tx: Client, intentId: string, transactionId: string) {
  const intent = await tx.paymentIntent.findUniqueOrThrow({ where: { id: intentId } });
  const azure = intent.azureContextJson as { azureSubscriptionId: string; resourceId?: string; costCategory: string; invoiceReference: string } | null;
  if (!azure) return;
  await tx.azureBillingRecord.upsert({
    where: { tenantId_invoiceReference: { tenantId: intent.tenantId, invoiceReference: azure.invoiceReference } },
    create: {
      tenantId: intent.tenantId,
      azureSubscriptionId: azure.azureSubscriptionId,
      resourceId: azure.resourceId,
      costCategory: azure.costCategory,
      invoiceReference: azure.invoiceReference,
      chargeAmount: intent.amount,
      chargeCurrency: intent.currency,
      paymentIntentId: intent.id,
      transactionId,
      status: "matched"
    },
    update: { paymentIntentId: intent.id, transactionId, status: "matched" }
  });
}

export async function decideApproval(deps: Deps, actor: Actor, approvalId: string, action: "approve" | "reject", reason?: string) {
  requireRole(actor, "MAW.Approver", "MAW.Admin");
  if (actor.principalType === "agent") throw new MawError("forbidden", "Agent principals cannot decide approvals");
  const approval = await deps.db.approvalRequest.findFirst({ where: { id: approvalId, tenantId: actor.tenantId }, include: { paymentIntent: { include: { wallet: true } } } });
  if (!approval) throw new MawError("not_found", "Approval request not found");
  const intent = approval.paymentIntent;
  if (intent.initiatedByPrincipalId === actor.principalId) {
    await audit(deps.db, actor, { eventType: "approval.self_approval_blocked", resourceType: "approval", resourceId: approvalId, outcome: "denied" });
    throw new MawError("forbidden", "The initiator cannot decide their own approval request");
  }
  if (approval.status !== "pending") throw new MawError("invalid_state", `Approval is already ${approval.status}`);
  const nextStatus = action === "approve" ? "approved" : "rejected";
  const claim = await deps.db.approvalRequest.updateMany({
    where: { id: approvalId, status: "pending" },
    data: { status: nextStatus, decidedAt: new Date(), decidedBy: actor.principalId, decisionReason: reason }
  });
  if (claim.count === 0) throw new MawError("invalid_state", "Approval was already decided");
  await deps.db.approvalEvent.create({ data: { tenantId: actor.tenantId, approvalId, actorId: actor.principalId, action, reason } });
  await audit(deps.db, actor, { eventType: `approval.${nextStatus}`, resourceType: "approval", resourceId: approvalId, outcome: "success", details: { paymentIntentId: intent.id, reason: reason ?? null } });

  if (action === "reject") {
    await cancelIntent(deps, actor, intent.id, "approval_rejected");
    return toPaymentResponse(await loadIntentView(deps.db, actor.tenantId, intent.id));
  }

  const violation = await recheckBeforeExecution(deps, actor, intent.id);
  if (violation) {
    await cancelIntent(deps, actor, intent.id, violation);
    return toPaymentResponse(await loadIntentView(deps.db, actor.tenantId, intent.id));
  }
  const moved = await deps.db.paymentIntent.updateMany({ where: { id: intent.id, status: "approval_required" }, data: { status: "approved" } });
  if (moved.count === 0) throw new MawError("invalid_state", "Payment intent is no longer awaiting approval");
  if (intent.kind !== "escrow") await executeIntent(deps, actor, intent.id);
  else await deps.db.escrow.updateMany({ where: { id: intent.escrowId ?? "", tenantId: actor.tenantId, state: "funding_pending" }, data: { state: "funded" } });
  return toPaymentResponse(await loadIntentView(deps.db, actor.tenantId, intent.id));
}

async function recheckBeforeExecution(deps: Deps, actor: Actor, intentId: string): Promise<string | null> {
  const intent = await deps.db.paymentIntent.findUniqueOrThrow({ where: { id: intentId } });
  const evaluation = await evaluateRequest(deps.db, deps, intent.tenantId, {
    walletId: intent.walletId,
    destinationId: intent.destinationId,
    amount: num(intent.amount),
    asset: intent.asset,
    network: intent.network,
    category: intent.category,
    kind: intent.kind as PaymentKind,
    now: new Date(),
    excludeIntentId: intent.id,
    ignoreBalance: true,
    principalAuthorized: true
  });
  const denial = evaluation.reasons.find((r) => r.outcome === "deny");
  if (denial) {
    await audit(deps.db, actor, { eventType: "payment.recheck_failed", resourceType: "payment_intent", resourceId: intentId, outcome: "denied", details: { reason: denial.code } });
    return `policy_recheck_failed:${denial.code}`;
  }
  return null;
}

export async function cancelIntent(deps: Deps, actor: Pick<Actor, "tenantId" | "principalId">, intentId: string, reason: string) {
  await deps.db.$transaction(async (tx) => {
    const intent = await tx.paymentIntent.findUniqueOrThrow({ where: { id: intentId }, include: { wallet: true } });
    await lockWallet(tx, intent.walletId);
    const moved = await tx.paymentIntent.updateMany({ where: { id: intentId, status: { in: ["approval_required", "approved"] } }, data: { status: "cancelled", failureReason: reason } });
    if (moved.count === 0) return;
    if (intent.wallet.provider === LOCAL_LEDGER) await releaseFunds(tx, intent.walletId, intent.asset, num(intent.amount));
    if (intent.escrowId) await tx.escrow.updateMany({ where: { id: intent.escrowId, state: { in: ["created", "funding_pending", "funded"] } }, data: { state: "refunded" } });
    await tx.approvalRequest.updateMany({ where: { paymentIntentId: intentId, status: "pending" }, data: { status: "expired", decidedAt: new Date() } });
    await audit(tx, actor, { eventType: "payment.cancelled", resourceType: "payment_intent", resourceId: intentId, outcome: "success", details: { reason } });
  });
}

export async function cancelPayment(deps: Deps, actor: Actor, intentId: string) {
  const intent = await loadIntentView(deps.db, actor.tenantId, intentId);
  if (!isPrivileged(actor) && intent.initiatedByPrincipalId !== actor.principalId) throw new MawError("forbidden", "Only the initiator or an operator can cancel a payment");
  if (!["approval_required", "approved"].includes(intent.status)) throw new MawError("invalid_state", `Payment in status ${intent.status} cannot be cancelled`);
  await cancelIntent(deps, actor, intentId, "cancelled_by_request");
  return toPaymentResponse(await loadIntentView(deps.db, actor.tenantId, intentId));
}

export async function getPayment(deps: Deps, actor: Actor, intentId: string) {
  const intent = await loadIntentView(deps.db, actor.tenantId, intentId);
  assertWalletAccess(actor, intent.wallet);
  return toPaymentResponse(intent);
}

export async function listPayments(deps: Deps, actor: Actor, filter: { status?: string; walletId?: string; limit?: number }) {
  const scoped = !isPrivileged(actor) && actor.roles.every((r) => r === "MAW.Agent");
  const intents = await deps.db.paymentIntent.findMany({
    where: { tenantId: actor.tenantId, status: filter.status, walletId: filter.walletId, ...(scoped ? { wallet: { principalId: actor.principalId } } : {}) },
    include: intentInclude,
    orderBy: { createdAt: "desc" },
    take: Math.min(filter.limit ?? 100, 500)
  });
  return intents.map(toPaymentResponse);
}

export async function listApprovals(deps: Deps, actor: Actor, status?: string) {
  requireRole(actor, "MAW.Approver", "MAW.Admin", "MAW.Auditor");
  const approvals = await deps.db.approvalRequest.findMany({
    where: { tenantId: actor.tenantId, status },
    include: { paymentIntent: { include: intentInclude } },
    orderBy: { requestedAt: "desc" },
    take: 200
  });
  return approvals.map((a) => ({
    id: a.id,
    status: a.status,
    requiredApproverRole: a.requiredApproverRole,
    requestedAt: a.requestedAt,
    decidedAt: a.decidedAt,
    decidedBy: a.decidedBy,
    decisionReason: a.decisionReason,
    payment: toPaymentResponse(a.paymentIntent)
  }));
}

export async function decideApprovalByPayment(deps: Deps, actor: Actor, intentId: string, action: "approve" | "reject", reason?: string) {
  const approval = await deps.db.approvalRequest.findFirst({ where: { paymentIntentId: intentId, tenantId: actor.tenantId, status: "pending" } });
  if (!approval) throw new MawError("not_found", "No pending approval for this payment");
  return decideApproval(deps, actor, approval.id, action, reason);
}
