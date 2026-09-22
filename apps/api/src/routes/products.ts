import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  checkEscrowEligibility,
  createDestination,
  createEscrow,
  createSubscription,
  createSupplier,
  disputeEscrow,
  getEscrow,
  linkBillingRecord,
  listBillingRecords,
  listDestinations,
  listEscrows,
  listSubscriptions,
  listSuppliers,
  reconcileBilling,
  recordAzureCharge,
  recordEscrowSignal,
  refundEscrow,
  releaseEscrow,
  setDestinationStatus,
  setSubscriptionStatus,
  setSupplierStatus
} from "@maw/domain";
import { MawError } from "@maw/shared";
import type { AppContext } from "../app";

const idParams = z.object({ id: z.string().min(1) });

function keyFrom(request: { headers: Record<string, string | string[] | undefined>; body: unknown }): Record<string, unknown> {
  const body = (request.body ?? {}) as Record<string, unknown>;
  const headerKey = request.headers["idempotency-key"];
  const idempotencyKey = (Array.isArray(headerKey) ? headerKey[0] : headerKey) ?? (body.idempotencyKey as string | undefined);
  if (!idempotencyKey) throw new MawError("validation_error", "An Idempotency-Key header or idempotencyKey field is required");
  return { ...body, idempotencyKey };
}

export function registerProductRoutes(app: FastifyInstance, ctx: AppContext) {
  const { deps } = ctx;

  app.get("/v1/suppliers", async (request) => listSuppliers(deps, request.actor));
  app.post("/v1/suppliers", async (request, reply) => reply.status(201).send(await createSupplier(deps, request.actor, request.body)));
  app.post("/v1/suppliers/:id/status", async (request) => {
    const { status } = z.object({ status: z.enum(["active", "blocked"]) }).parse(request.body);
    return setSupplierStatus(deps, request.actor, idParams.parse(request.params).id, status);
  });

  app.get("/v1/destinations", async (request) => listDestinations(deps, request.actor));
  app.post("/v1/destinations", async (request, reply) => reply.status(201).send(await createDestination(deps, request.actor, request.body)));
  app.post("/v1/destinations/:id/status", async (request) => {
    const { status } = z.object({ status: z.enum(["active", "blocked"]) }).parse(request.body);
    return setDestinationStatus(deps, request.actor, idParams.parse(request.params).id, status);
  });

  app.get("/v1/subscriptions", async (request) => listSubscriptions(deps, request.actor));
  app.post("/v1/subscriptions", async (request, reply) => reply.status(201).send(await createSubscription(deps, request.actor, request.body)));
  app.post("/v1/subscriptions/:id/status", async (request) => {
    const { status } = z.object({ status: z.enum(["active", "paused", "cancelled"]) }).parse(request.body);
    return setSubscriptionStatus(deps, request.actor, idParams.parse(request.params).id, status);
  });

  app.get("/v1/escrows", async (request) => listEscrows(deps, request.actor));
  app.post("/v1/escrows", async (request, reply) => {
    const result = await createEscrow(deps, request.actor, keyFrom(request));
    return reply.status(result.escrow ? 201 : 200).send(result);
  });
  app.get("/v1/escrows/:id", async (request) => getEscrow(deps, request.actor, idParams.parse(request.params).id));
  app.get("/v1/escrows/:id/eligibility", async (request) => checkEscrowEligibility(deps, request.actor, idParams.parse(request.params).id));
  app.post("/v1/escrows/:id/release", async (request) => releaseEscrow(deps, request.actor, idParams.parse(request.params).id));
  app.post("/v1/escrows/:id/refund", async (request) => refundEscrow(deps, request.actor, idParams.parse(request.params).id));
  app.post("/v1/escrows/:id/dispute", async (request) => disputeEscrow(deps, request.actor, idParams.parse(request.params).id));
  app.post("/v1/escrows/:id/signals", async (request) => {
    const { signal } = z.object({ signal: z.enum(["external_complete", "counterparty_ack"]) }).parse(request.body);
    return recordEscrowSignal(deps, request.actor, idParams.parse(request.params).id, signal);
  });

  app.get("/v1/billing/records", async (request) => listBillingRecords(deps, request.actor));
  app.post("/v1/billing/records", async (request, reply) => reply.status(201).send(await recordAzureCharge(deps, request.actor, request.body)));
  app.post("/v1/billing/records/:id/link", async (request) => {
    const { paymentIntentId } = z.object({ paymentIntentId: z.string().min(1) }).parse(request.body);
    return linkBillingRecord(deps, request.actor, idParams.parse(request.params).id, paymentIntentId);
  });
  app.post("/v1/billing/reconcile", async (request) => reconcileBilling(deps, request.actor));
}
