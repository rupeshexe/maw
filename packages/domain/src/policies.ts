import { z } from "zod";
import type { Prisma } from "@maw/db";
import { MawError } from "@maw/shared";
import { parsePolicyDocument } from "@maw/policy-engine";
import { audit } from "./audit";
import { requireRole } from "./context";
import type { Actor, Client, Deps } from "./context";

const policyInput = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  document: z.unknown()
});

export async function createPolicy(deps: Deps, actor: Actor, input: unknown) {
  requireRole(actor, "MAW.Admin", "MAW.PolicyAdmin");
  const data = policyInput.parse(input);
  const document = parsePolicyDocument(data.document);
  return deps.db.$transaction(async (tx) => {
    const policy = await tx.spendingPolicy.create({
      data: {
        tenantId: actor.tenantId,
        name: data.name,
        description: data.description,
        currency: document.currency,
        rulesJson: document as unknown as Prisma.InputJsonValue,
        createdBy: actor.principalId,
        status: "active"
      }
    });
    await tx.policyVersion.create({
      data: { tenantId: actor.tenantId, policyId: policy.id, version: 1, currency: document.currency, rulesJson: document as unknown as Prisma.InputJsonValue, createdBy: actor.principalId }
    });
    await audit(tx, actor, { eventType: "policy.created", resourceType: "policy", resourceId: policy.id, outcome: "success", details: { version: 1 } });
    return policy;
  });
}

export async function updatePolicy(deps: Deps, actor: Actor, policyId: string, input: unknown) {
  requireRole(actor, "MAW.Admin", "MAW.PolicyAdmin");
  const data = policyInput.partial().parse(input);
  const existing = await getPolicy(deps.db, actor.tenantId, policyId);
  const document = data.document === undefined ? undefined : parsePolicyDocument(data.document);
  return deps.db.$transaction(async (tx) => {
    const version = document ? existing.version + 1 : existing.version;
    const policy = await tx.spendingPolicy.update({
      where: { id: policyId },
      data: {
        name: data.name,
        description: data.description,
        version,
        ...(document ? { currency: document.currency, rulesJson: document as unknown as Prisma.InputJsonValue } : {})
      }
    });
    if (document) {
      await tx.policyVersion.create({
        data: { tenantId: actor.tenantId, policyId, version, currency: document.currency, rulesJson: document as unknown as Prisma.InputJsonValue, createdBy: actor.principalId }
      });
    }
    await audit(tx, actor, { eventType: document ? "policy.versioned" : "policy.updated", resourceType: "policy", resourceId: policyId, outcome: "success", details: { version } });
    return policy;
  });
}

export async function setPolicyStatus(deps: Deps, actor: Actor, policyId: string, status: "active" | "retired") {
  requireRole(actor, "MAW.Admin", "MAW.PolicyAdmin");
  await getPolicy(deps.db, actor.tenantId, policyId);
  const policy = await deps.db.spendingPolicy.update({ where: { id: policyId }, data: { status } });
  await audit(deps.db, actor, { eventType: `policy.${status}`, resourceType: "policy", resourceId: policyId, outcome: "success" });
  return policy;
}

export async function getPolicy(client: Client, tenantId: string, policyId: string) {
  const policy = await client.spendingPolicy.findFirst({
    where: { id: policyId, tenantId },
    include: { assignments: { include: { wallet: { select: { id: true, name: true } } } }, versions: { orderBy: { version: "desc" } } }
  });
  if (!policy) throw new MawError("not_found", "Policy not found");
  return policy;
}

export async function listPolicies(deps: Deps, actor: Actor) {
  return deps.db.spendingPolicy.findMany({
    where: { tenantId: actor.tenantId },
    include: { assignments: { include: { wallet: { select: { id: true, name: true } } } } },
    orderBy: { createdAt: "desc" }
  });
}

const assignSchema = z.object({
  policyId: z.string().min(1),
  walletId: z.string().min(1),
  priority: z.number().int().min(0).max(1000).default(100),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().optional()
});

export async function assignPolicy(deps: Deps, actor: Actor, input: unknown) {
  requireRole(actor, "MAW.Admin", "MAW.PolicyAdmin");
  const data = assignSchema.parse(input);
  const policy = await deps.db.spendingPolicy.findFirst({ where: { id: data.policyId, tenantId: actor.tenantId } });
  if (!policy) throw new MawError("not_found", "Policy not found");
  if (policy.status !== "active") throw new MawError("invalid_state", "Only active policies can be assigned");
  const wallet = await deps.db.wallet.findFirst({ where: { id: data.walletId, tenantId: actor.tenantId } });
  if (!wallet) throw new MawError("not_found", "Wallet not found");
  if (data.effectiveFrom && data.effectiveTo && data.effectiveTo <= data.effectiveFrom) {
    throw new MawError("validation_error", "effectiveTo must be after effectiveFrom");
  }
  const assignment = await deps.db.policyAssignment.create({
    data: { tenantId: actor.tenantId, policyId: data.policyId, walletId: data.walletId, priority: data.priority, effectiveFrom: data.effectiveFrom ?? new Date(), effectiveTo: data.effectiveTo }
  });
  await audit(deps.db, actor, { eventType: "policy.assigned", resourceType: "policy", resourceId: data.policyId, outcome: "success", details: { walletId: data.walletId, assignmentId: assignment.id } });
  return assignment;
}

export async function unassignPolicy(deps: Deps, actor: Actor, assignmentId: string) {
  requireRole(actor, "MAW.Admin", "MAW.PolicyAdmin");
  const assignment = await deps.db.policyAssignment.findFirst({ where: { id: assignmentId, tenantId: actor.tenantId } });
  if (!assignment) throw new MawError("not_found", "Assignment not found");
  const ended = await deps.db.policyAssignment.update({ where: { id: assignmentId }, data: { effectiveTo: new Date() } });
  await audit(deps.db, actor, { eventType: "policy.unassigned", resourceType: "policy", resourceId: assignment.policyId, outcome: "success", details: { walletId: assignment.walletId } });
  return ended;
}

export async function activePoliciesForWallet(client: Client, tenantId: string, walletId: string, now: Date) {
  const assignments = await client.policyAssignment.findMany({
    where: {
      tenantId,
      walletId,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      policy: { status: "active" }
    },
    include: { policy: true },
    orderBy: { priority: "asc" }
  });
  return assignments.map((a) => ({
    id: a.policy.id,
    name: a.policy.name,
    version: a.policy.version,
    document: parsePolicyDocument(a.policy.rulesJson)
  }));
}
