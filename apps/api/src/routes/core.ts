import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getOverview, listAuditEvents, listPrincipals, receiptSigningInfo, requireRole } from "@maw/domain";
import type { AppContext } from "../app";

const auditQuery = z.object({
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  eventType: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional()
});

export function registerCoreRoutes(app: FastifyInstance, ctx: AppContext) {
  const { deps, config } = ctx;

  app.get("/health", async () => ({ status: "ok", mode: deps.adapters.mode, time: new Date().toISOString() }));

  app.get("/v1/me", async (request) => ({
    principalId: request.actor.principalId,
    tenantId: request.actor.tenantId,
    displayName: request.actor.displayName,
    principalType: request.actor.principalType,
    roles: request.actor.roles
  }));

  app.get("/v1/config", async () => ({
    mode: deps.adapters.mode,
    demo: deps.adapters.mode === "demo",
    authMode: ctx.auth.mode,
    providers: await Promise.all(deps.adapters.list().map((a) => a.capabilities()))
  }));

  app.get("/v1/integrations", async (request) => {
    requireRole(request.actor, "MAW.Admin", "MAW.Auditor", "MAW.WalletOperator");
    const providers = await Promise.all(
      deps.adapters.list().map(async (adapter) => {
        const capabilities = await adapter.capabilities().catch(() => null);
        return { id: adapter.id, reachable: capabilities !== null, capabilities };
      })
    );
    return {
      mode: deps.adapters.mode,
      identity: { mode: ctx.auth.mode, entraTenantConfigured: Boolean(config.ENTRA_TENANT_ID), entraClientConfigured: Boolean(config.ENTRA_CLIENT_ID) },
      receiptSigning: await receiptSigningInfo(deps),
      keyVault: { configured: Boolean(process.env.AZURE_KEY_VAULT_URL) },
      providers,
      scheduler: { intervalSeconds: config.SCHEDULER_INTERVAL_SECONDS }
    };
  });

  app.get("/v1/overview", async (request) => getOverview(deps, request.actor));

  app.get("/v1/principals", async (request) => {
    requireRole(request.actor, "MAW.Admin", "MAW.WalletOperator", "MAW.PolicyAdmin", "MAW.Auditor");
    return listPrincipals(deps, request.actor.tenantId);
  });

  app.get("/v1/audit-events", async (request) => {
    requireRole(request.actor, "MAW.Admin", "MAW.Auditor");
    return listAuditEvents(deps.db, request.actor.tenantId, auditQuery.parse(request.query));
  });
}
