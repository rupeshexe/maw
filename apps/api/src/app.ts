import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { isMawError, MawError } from "@maw/shared";
import type { Actor, Deps } from "@maw/domain";
import type { Authenticator } from "./auth";
import type { AppConfig } from "./config";
import { registerCoreRoutes } from "./routes/core";
import { registerWalletRoutes } from "./routes/wallets";
import { registerPaymentRoutes } from "./routes/payments";
import { registerProductRoutes } from "./routes/products";
import { registerWebhookRoutes } from "./routes/webhooks";

declare module "fastify" {
  interface FastifyRequest {
    actor: Actor;
    rawBody?: string;
  }
}

export interface AppContext {
  deps: Deps;
  auth: Authenticator;
  config: AppConfig;
}

export async function buildApp(ctx: AppContext) {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info", redact: ["req.headers.authorization", "req.headers.x-signature"] } });

  await app.register(cors, {
    origin: ctx.config.CORS_ORIGIN.split(",").map((o) => o.trim()),
    allowedHeaders: ["content-type", "authorization", "idempotency-key", "x-demo-user"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
  });

  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    request.rawBody = body as string;
    if (!body) return done(null, {});
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(new MawError("validation_error", "Request body is not valid JSON"), undefined);
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (isMawError(error)) return reply.status(error.status).send(error.toJSON());
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: { code: "validation_error", message: "Request validation failed", details: error.flatten() } });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.status(status).send({ error: { code: "bad_request", message: (error as Error).message, details: null } });
    request.log.error({ err: error }, "unhandled error");
    return reply.status(500).send({ error: { code: "internal_error", message: "Unexpected server error", details: null } });
  });

  app.setNotFoundHandler((_request, reply) => reply.status(404).send({ error: { code: "not_found", message: "Route not found", details: null } }));

  app.addHook("onRequest", async (request) => {
    const path = request.url.split("?")[0];
    if (request.method === "OPTIONS" || path === "/health" || path.startsWith("/v1/webhooks/")) return;
    request.actor = await ctx.auth.authenticate(request.headers);
  });

  registerCoreRoutes(app, ctx);
  registerWalletRoutes(app, ctx);
  registerPaymentRoutes(app, ctx);
  registerProductRoutes(app, ctx);
  registerWebhookRoutes(app, ctx);
  return app;
}
