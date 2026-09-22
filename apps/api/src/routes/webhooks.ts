import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { handleProviderWebhook } from "@maw/domain";
import type { AppContext } from "../app";

export function registerWebhookRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post("/v1/webhooks/:provider", async (request) => {
    const { provider } = z.object({ provider: z.string().min(1) }).parse(request.params);
    const headers: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(request.headers)) headers[key] = Array.isArray(value) ? value[0] : value;
    return handleProviderWebhook(ctx.deps, provider, headers, request.rawBody ?? "");
  });
}
