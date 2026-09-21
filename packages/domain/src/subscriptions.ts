import { z } from "zod";
import { CADENCES, MawError, nextExecution } from "@maw/shared";
import type { Cadence } from "@maw/shared";
import { audit } from "./audit";
import { isPrivileged, num } from "./context";
import type { Actor, Deps } from "./context";
import { previewPolicyEvaluation, submitPayment } from "./payments";
import { assertWalletAccess, loadWallet } from "./wallets";

const createSchema = z.object({
  walletId: z.string().min(1),
  destinationId: z.string().min(1),
  amount: z.number().positive().finite(),
  asset: z.string().min(2).max(12).optional(),
  category: z.string().max(60).optional(),
  purpose: z.string().max(300).optional(),
  cadence: z.enum(CADENCES),
  firstExecutionAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  maxExecutions: z.number().int().positive().optional()
});

export async function createSubscription(deps: Deps, actor: Actor, input: unknown) {
  const data = createSchema.parse(input);
  const wallet = await loadWallet(deps.db, actor.tenantId, data.walletId);
  if (!isPrivileged(actor) && wallet.principalId !== actor.principalId) throw new MawError("forbidden", "Principal is not authorized to create subscriptions for this wallet");
  const asset = data.asset ?? wallet.defaultAsset;
  const first = data.firstExecutionAt ?? new Date();
  if (data.endsAt && data.endsAt <= first) throw new MawError("validation_error", "endsAt must be after the first execution");
  const preview = await previewPolicyEvaluation(deps, actor, {
    walletId: wallet.id,
    destinationId: data.destinationId,
    amount: data.amount,
    asset,
    category: data.category,
    kind: "subscription"
  });
  const hardDenials = preview.reasons.filter((r) => r.outcome === "deny" && !["insufficient_balance", "period_cap_exceeded", "category_limit_exceeded", "supplier_limit_exceeded", "velocity_exceeded", "outside_business_hours"].includes(r.code));
  if (hardDenials.length > 0) {
    throw new MawError("policy_denied", "Subscription violates the active spending policy", { reasons: hardDenials });
  }
  const subscription = await deps.db.subscription.create({
    data: {
      tenantId: actor.tenantId,
      walletId: wallet.id,
      destinationId: data.destinationId,
      amount: data.amount,
      asset,
      category: data.category,
      purpose: data.purpose,
      cadence: data.cadence,
      nextExecutionAt: first,
      endsAt: data.endsAt,
      maxExecutions: data.maxExecutions,
      createdBy: actor.principalId
    }
  });
  await audit(deps.db, actor, { eventType: "subscription.created", resourceType: "subscription", resourceId: subscription.id, outcome: "success", details: { cadence: data.cadence, amount: data.amount, asset } });
  return { subscription, policyPreview: { decision: preview.decision, reasons: preview.reasons, summary: preview.summary } };
}

export async function listSubscriptions(deps: Deps, actor: Actor) {
  const scoped = !isPrivileged(actor) && actor.roles.every((r) => r === "MAW.Agent");
  const rows = await deps.db.subscription.findMany({
    where: { tenantId: actor.tenantId, ...(scoped ? { wallet: { principalId: actor.principalId } } : {}) },
    include: { destination: true, wallet: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" }
  });
  return rows.map((s) => ({ ...s, amount: num(s.amount) }));
}

export async function setSubscriptionStatus(deps: Deps, actor: Actor, subscriptionId: string, status: "active" | "paused" | "cancelled") {
  const subscription = await deps.db.subscription.findFirst({ where: { id: subscriptionId, tenantId: actor.tenantId }, include: { wallet: true } });
  if (!subscription) throw new MawError("not_found", "Subscription not found");
  assertWalletAccess(actor, subscription.wallet);
  if (!isPrivileged(actor) && subscription.wallet.principalId !== actor.principalId) throw new MawError("forbidden", "Not permitted to change this subscription");
  if (subscription.status === "cancelled" || subscription.status === "completed") throw new MawError("invalid_state", `Subscription is ${subscription.status}`);
  const updated = await deps.db.subscription.update({ where: { id: subscriptionId }, data: { status } });
  await audit(deps.db, actor, { eventType: `subscription.${status === "active" ? "resumed" : status}`, resourceType: "subscription", resourceId: subscriptionId, outcome: "success" });
  return updated;
}

export async function runDueSubscriptions(deps: Deps, now: Date = new Date()) {
  const due = await deps.db.subscription.findMany({ where: { status: "active", nextExecutionAt: { lte: now } }, orderBy: { nextExecutionAt: "asc" }, take: 100 });
  const outcomes: { subscriptionId: string; status: string; paymentId?: string }[] = [];
  for (const sub of due) {
    if (sub.endsAt && sub.endsAt <= now) {
      await deps.db.subscription.update({ where: { id: sub.id }, data: { status: "completed" } });
      await audit(deps.db, { tenantId: sub.tenantId, principalId: null }, { eventType: "subscription.completed", resourceType: "subscription", resourceId: sub.id, outcome: "success" });
      outcomes.push({ subscriptionId: sub.id, status: "completed" });
      continue;
    }
    const executionIndex = sub.executionCount + 1;
    const upcoming = nextExecution(sub.cadence as Cadence, sub.nextExecutionAt);
    const finished = (sub.maxExecutions !== null && executionIndex >= sub.maxExecutions) || (sub.endsAt !== null && upcoming > sub.endsAt);
    const claim = await deps.db.subscription.updateMany({
      where: { id: sub.id, status: "active", nextExecutionAt: sub.nextExecutionAt },
      data: { nextExecutionAt: upcoming, executionCount: { increment: 1 }, ...(finished ? { status: "completed" } : {}) }
    });
    if (claim.count === 0) continue;
    const actor: Actor = { principalId: sub.createdBy, tenantId: sub.tenantId, roles: [], principalType: "service", displayName: "MAW scheduler", system: true };
    try {
      const payment = await submitPayment(deps, actor, {
        walletId: sub.walletId,
        destinationId: sub.destinationId,
        amount: num(sub.amount),
        asset: sub.asset,
        category: sub.category ?? undefined,
        purpose: sub.purpose ?? `Subscription ${sub.id} execution ${executionIndex}`,
        idempotencyKey: `sub-${sub.id}-${executionIndex}`,
        kind: "subscription",
        subscriptionId: sub.id
      });
      await deps.db.subscription.update({ where: { id: sub.id }, data: { lastResultJson: { paymentId: payment.id, status: payment.status, at: now.toISOString() } } });
      await audit(deps.db, actor, { eventType: "subscription.executed", resourceType: "subscription", resourceId: sub.id, outcome: payment.status === "denied" || payment.status === "failed" ? "failure" : "success", details: { paymentId: payment.id, status: payment.status, execution: executionIndex } });
      outcomes.push({ subscriptionId: sub.id, status: payment.status, paymentId: payment.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : "execution_failed";
      await deps.db.subscription.update({ where: { id: sub.id }, data: { lastResultJson: { error: message, at: now.toISOString() } } });
      await audit(deps.db, actor, { eventType: "subscription.executed", resourceType: "subscription", resourceId: sub.id, outcome: "failure", details: { error: message, execution: executionIndex } });
      outcomes.push({ subscriptionId: sub.id, status: "error" });
    }
  }
  return outcomes;
}
