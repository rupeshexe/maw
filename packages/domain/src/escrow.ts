import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@maw/db";
import { MawError } from "@maw/shared";
import { audit } from "./audit";
import { hasRole, isPrivileged, num } from "./context";
import type { Actor, Deps } from "./context";
import { cancelIntent, executeIntent, submitPayment, toPaymentResponse, loadIntentView } from "./payments";
import { assertWalletAccess, loadWallet } from "./wallets";

export const releaseConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("manual") }),
  z.object({ type: z.literal("time"), releaseAt: z.coerce.date() }),
  z.object({ type: z.literal("external_reference"), reference: z.string().min(1).max(200) }),
  z.object({ type: z.literal("counterparty_ack") })
]);

const createSchema = z.object({
  payerWalletId: z.string().min(1),
  beneficiaryDestinationId: z.string().min(1),
  amount: z.number().positive().finite(),
  asset: z.string().min(2).max(12).optional(),
  releaseCondition: releaseConditionSchema,
  expiresAt: z.coerce.date().optional(),
  purpose: z.string().max(300).optional(),
  category: z.string().max(60).optional(),
  idempotencyKey: z.string().min(8).max(200)
});

const escrowIdFor = (tenantId: string, walletId: string, key: string) =>
  `esc_${createHash("sha256").update(`${tenantId}:${walletId}:${key}`).digest("hex").slice(0, 24)}`;

const escrowInclude = { beneficiary: true, payerWallet: { select: { id: true, name: true, principalId: true, provider: true } } };

async function loadEscrow(deps: Deps, actor: Actor, escrowId: string) {
  const escrow = await deps.db.escrow.findFirst({ where: { id: escrowId, tenantId: actor.tenantId }, include: escrowInclude });
  if (!escrow) throw new MawError("not_found", "Escrow not found");
  assertWalletAccess(actor, escrow.payerWallet);
  return escrow;
}

const view = <T extends { amount: unknown }>(escrow: T) => ({ ...escrow, amount: num(escrow.amount as number) });

export async function createEscrow(deps: Deps, actor: Actor, input: unknown) {
  const data = createSchema.parse(input);
  const wallet = await loadWallet(deps.db, actor.tenantId, data.payerWalletId);
  if (!isPrivileged(actor) && wallet.principalId !== actor.principalId) throw new MawError("forbidden", "Principal is not authorized to fund escrow from this wallet");
  if (data.expiresAt && data.expiresAt <= new Date()) throw new MawError("validation_error", "expiresAt must be in the future");
  const escrowId = escrowIdFor(actor.tenantId, wallet.id, data.idempotencyKey);
  const existing = await deps.db.escrow.findFirst({ where: { id: escrowId, tenantId: actor.tenantId }, include: escrowInclude });
  if (existing) return { escrow: view(existing), payment: null };
  const asset = data.asset ?? wallet.defaultAsset;
  const payment = await submitPayment(
    deps,
    actor,
    {
      walletId: wallet.id,
      destinationId: data.beneficiaryDestinationId,
      amount: data.amount,
      asset,
      category: data.category,
      purpose: data.purpose ?? "Escrow funding",
      idempotencyKey: data.idempotencyKey,
      kind: "escrow",
      escrowId
    },
    { execute: false }
  );
  if (payment.status === "denied") return { escrow: null, payment };
  const escrow = await deps.db.escrow.create({
    data: {
      id: escrowId,
      tenantId: actor.tenantId,
      payerWalletId: wallet.id,
      beneficiaryDestinationId: data.beneficiaryDestinationId,
      amount: data.amount,
      asset,
      state: payment.status === "approval_required" ? "funding_pending" : "funded",
      releaseConditionJson: data.releaseCondition as unknown as Prisma.InputJsonValue,
      expiresAt: data.expiresAt,
      createdBy: actor.principalId
    },
    include: escrowInclude
  });
  await audit(deps.db, actor, { eventType: "escrow.funded", resourceType: "escrow", resourceId: escrow.id, outcome: payment.status === "approval_required" ? "pending" : "success", details: { state: escrow.state, paymentId: payment.id } });
  return { escrow: view(escrow), payment };
}

export async function listEscrows(deps: Deps, actor: Actor) {
  const scoped = !isPrivileged(actor) && actor.roles.every((r) => r === "MAW.Agent");
  const rows = await deps.db.escrow.findMany({
    where: { tenantId: actor.tenantId, ...(scoped ? { payerWallet: { principalId: actor.principalId } } : {}) },
    include: escrowInclude,
    orderBy: { createdAt: "desc" }
  });
  return rows.map(view);
}

export async function getEscrow(deps: Deps, actor: Actor, escrowId: string) {
  const escrow = await loadEscrow(deps, actor, escrowId);
  const intent = await deps.db.paymentIntent.findFirst({ where: { tenantId: actor.tenantId, escrowId }, select: { id: true } });
  return { ...view(escrow), paymentId: intent?.id ?? null };
}

type ReleaseCondition = z.infer<typeof releaseConditionSchema>;

function eligibility(escrow: { releaseConditionJson: unknown; externalComplete: boolean; counterpartyAcknowledged: boolean }, actor: Actor, now: Date) {
  const condition = releaseConditionSchema.parse(escrow.releaseConditionJson) as ReleaseCondition;
  switch (condition.type) {
    case "manual":
      return hasRole(actor, "MAW.Admin", "MAW.WalletOperator", "MAW.Approver") && actor.principalType !== "agent"
        ? { eligible: true as const }
        : { eligible: false as const, reason: "Manual release requires an authorized human operator or approver" };
    case "time":
      return now >= condition.releaseAt ? { eligible: true as const } : { eligible: false as const, reason: `Release time ${condition.releaseAt.toISOString()} has not been reached` };
    case "external_reference":
      return escrow.externalComplete ? { eligible: true as const } : { eligible: false as const, reason: `External reference ${condition.reference} has not been marked complete` };
    case "counterparty_ack":
      return escrow.counterpartyAcknowledged ? { eligible: true as const } : { eligible: false as const, reason: "Counterparty has not acknowledged" };
  }
}

export async function checkEscrowEligibility(deps: Deps, actor: Actor, escrowId: string) {
  const escrow = await loadEscrow(deps, actor, escrowId);
  if (escrow.state !== "funded") return { escrowId, state: escrow.state, eligible: false, reason: `Escrow is ${escrow.state}` };
  const result = eligibility(escrow, actor, new Date());
  return { escrowId, state: escrow.state, eligible: result.eligible, reason: result.eligible ? null : result.reason };
}

export async function releaseEscrow(deps: Deps, actor: Actor, escrowId: string) {
  const escrow = await loadEscrow(deps, actor, escrowId);
  if (escrow.state !== "funded") throw new MawError("invalid_state", `Escrow is ${escrow.state} and cannot be released`);
  const result = eligibility(escrow, actor, new Date());
  if (!result.eligible) {
    await audit(deps.db, actor, { eventType: "escrow.release_denied", resourceType: "escrow", resourceId: escrowId, outcome: "denied", details: { reason: result.reason } });
    throw new MawError("forbidden", result.reason);
  }
  return performRelease(deps, actor, escrowId);
}

async function performRelease(deps: Deps, actor: Actor, escrowId: string) {
  const claim = await deps.db.escrow.updateMany({ where: { id: escrowId, tenantId: actor.tenantId, state: "funded" }, data: { state: "release_pending" } });
  if (claim.count === 0) throw new MawError("invalid_state", "Escrow is no longer releasable");
  const intent = await deps.db.paymentIntent.findFirst({ where: { tenantId: actor.tenantId, escrowId, status: "approved" } });
  if (!intent) {
    await deps.db.escrow.update({ where: { id: escrowId }, data: { state: "disputed" } });
    throw new MawError("invalid_state", "Escrow funding record is not in a releasable state");
  }
  await audit(deps.db, actor, { eventType: "escrow.release_requested", resourceType: "escrow", resourceId: escrowId, outcome: "pending", details: { paymentId: intent.id } });
  const payment = await executeIntent(deps, actor, intent.id);
  const state = payment.status === "settled" ? "released" : payment.status === "submitted" ? "release_pending" : "refunded";
  await deps.db.escrow.update({ where: { id: escrowId }, data: { state } });
  await audit(deps.db, actor, { eventType: state === "released" ? "escrow.released" : state === "refunded" ? "escrow.release_failed" : "escrow.release_submitted", resourceType: "escrow", resourceId: escrowId, outcome: state === "refunded" ? "failure" : "success", details: { paymentId: payment.id, receiptId: payment.receiptId } });
  return { escrow: view(await loadEscrow(deps, actor, escrowId)), payment };
}

export async function refundEscrow(deps: Deps, actor: Actor, escrowId: string) {
  if (!hasRole(actor, "MAW.Admin", "MAW.WalletOperator")) throw new MawError("forbidden", "Requires an administrator or wallet operator");
  const escrow = await loadEscrow(deps, actor, escrowId);
  if (!["funded", "funding_pending", "disputed"].includes(escrow.state)) throw new MawError("invalid_state", `Escrow is ${escrow.state} and cannot be refunded`);
  const intent = await deps.db.paymentIntent.findFirst({ where: { tenantId: actor.tenantId, escrowId } });
  if (!intent) throw new MawError("invalid_state", "Escrow funding record not found");
  await cancelIntent(deps, actor, intent.id, "escrow_refunded");
  await deps.db.escrow.update({ where: { id: escrowId }, data: { state: "refunded" } });
  await audit(deps.db, actor, { eventType: "escrow.refunded", resourceType: "escrow", resourceId: escrowId, outcome: "success" });
  return view(await loadEscrow(deps, actor, escrowId));
}

export async function disputeEscrow(deps: Deps, actor: Actor, escrowId: string) {
  if (!hasRole(actor, "MAW.Admin", "MAW.WalletOperator", "MAW.Approver")) throw new MawError("forbidden", "Requires an administrator, operator or approver");
  const escrow = await loadEscrow(deps, actor, escrowId);
  if (escrow.state !== "funded") throw new MawError("invalid_state", `Escrow is ${escrow.state} and cannot be disputed`);
  await deps.db.escrow.update({ where: { id: escrowId }, data: { state: "disputed" } });
  await audit(deps.db, actor, { eventType: "escrow.disputed", resourceType: "escrow", resourceId: escrowId, outcome: "success" });
  return view(await loadEscrow(deps, actor, escrowId));
}

export async function recordEscrowSignal(deps: Deps, actor: Actor, escrowId: string, signal: "external_complete" | "counterparty_ack") {
  if (!hasRole(actor, "MAW.Admin", "MAW.WalletOperator")) throw new MawError("forbidden", "Requires an administrator or wallet operator");
  await loadEscrow(deps, actor, escrowId);
  await deps.db.escrow.update({ where: { id: escrowId }, data: signal === "external_complete" ? { externalComplete: true } : { counterpartyAcknowledged: true } });
  await audit(deps.db, actor, { eventType: `escrow.${signal}`, resourceType: "escrow", resourceId: escrowId, outcome: "success" });
  return view(await loadEscrow(deps, actor, escrowId));
}

export async function runEscrowMaintenance(deps: Deps, now: Date = new Date()) {
  const results: { escrowId: string; action: string }[] = [];
  const funded = await deps.db.escrow.findMany({ where: { state: "funded" }, take: 200 });
  for (const escrow of funded) {
    const systemActor: Actor = { principalId: escrow.createdBy, tenantId: escrow.tenantId, roles: [], principalType: "service", displayName: "MAW scheduler", system: true };
    if (escrow.expiresAt && escrow.expiresAt <= now) {
      const intent = await deps.db.paymentIntent.findFirst({ where: { tenantId: escrow.tenantId, escrowId: escrow.id } });
      if (intent) await cancelIntent(deps, systemActor, intent.id, "escrow_expired");
      await deps.db.escrow.update({ where: { id: escrow.id }, data: { state: "expired" } });
      await audit(deps.db, systemActor, { eventType: "escrow.expired", resourceType: "escrow", resourceId: escrow.id, outcome: "success" });
      results.push({ escrowId: escrow.id, action: "expired" });
      continue;
    }
    const condition = releaseConditionSchema.parse(escrow.releaseConditionJson);
    if (condition.type === "time" && now >= condition.releaseAt) {
      try {
        await performRelease(deps, systemActor, escrow.id);
        results.push({ escrowId: escrow.id, action: "released" });
      } catch {
        results.push({ escrowId: escrow.id, action: "release_error" });
      }
    }
  }
  return results;
}

export async function getEscrowPayment(deps: Deps, actor: Actor, escrowId: string) {
  await loadEscrow(deps, actor, escrowId);
  const intent = await deps.db.paymentIntent.findFirst({ where: { tenantId: actor.tenantId, escrowId }, select: { id: true } });
  if (!intent) throw new MawError("not_found", "Escrow funding record not found");
  return toPaymentResponse(await loadIntentView(deps.db, actor.tenantId, intent.id));
}
