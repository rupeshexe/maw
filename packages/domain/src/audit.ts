import type { Prisma } from "@maw/db";
import type { Client } from "./context";

export interface AuditInput {
  eventType: string;
  resourceType: string;
  resourceId: string;
  outcome: "success" | "denied" | "failure" | "pending";
  details?: Record<string, unknown>;
}

export type AuditActor = { tenantId: string; principalId: string | null };

export async function audit(client: Client, actor: AuditActor, input: AuditInput) {
  await client.auditEvent.create({
    data: {
      tenantId: actor.tenantId,
      actorPrincipalId: actor.principalId,
      eventType: input.eventType,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      outcome: input.outcome,
      detailsJson: (input.details ?? {}) as Prisma.InputJsonValue
    }
  });
}

export async function listAuditEvents(
  client: Client,
  tenantId: string,
  filter: { resourceType?: string; resourceId?: string; eventType?: string; limit?: number; before?: Date }
) {
  return client.auditEvent.findMany({
    where: {
      tenantId,
      resourceType: filter.resourceType,
      resourceId: filter.resourceId,
      eventType: filter.eventType,
      createdAt: filter.before ? { lt: filter.before } : undefined
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(filter.limit ?? 100, 500)
  });
}
