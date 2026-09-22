import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  cancelPayment,
  decideApprovalByPayment,
  executeConversion,
  getPayment,
  getReceipt,
  listApprovals,
  listConversions,
  listPayments,
  listReceipts,
  receiptSigningInfo,
  requestConversionQuote,
  submitPayment,
  verifyProvidedReceipt,
  verifyStoredReceipt
} from "@maw/domain";
import { MawError } from "@maw/shared";
import type { AppContext } from "../app";

const idParams = z.object({ id: z.string().min(1) });
const decisionBody = z.object({ reason: z.string().max(500).optional() }).default({});

export function registerPaymentRoutes(app: FastifyInstance, ctx: AppContext) {
  const { deps } = ctx;

  app.post("/v1/payment-intents", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const headerKey = request.headers["idempotency-key"];
    const idempotencyKey = (Array.isArray(headerKey) ? headerKey[0] : headerKey) ?? (body.idempotencyKey as string | undefined);
    if (!idempotencyKey) throw new MawError("validation_error", "An Idempotency-Key header or idempotencyKey field is required");
    const result = await submitPayment(deps, request.actor, { ...body, idempotencyKey });
    return reply.status(result.status === "denied" ? 200 : 201).send(result);
  });

  app.get("/v1/payment-intents", async (request) => {
    const query = z.object({ status: z.string().optional(), walletId: z.string().optional(), limit: z.coerce.number().int().min(1).max(500).optional() }).parse(request.query);
    return listPayments(deps, request.actor, query);
  });

  app.get("/v1/payment-intents/:id", async (request) => getPayment(deps, request.actor, idParams.parse(request.params).id));

  app.post("/v1/payment-intents/:id/approve", async (request) =>
    decideApprovalByPayment(deps, request.actor, idParams.parse(request.params).id, "approve", decisionBody.parse(request.body).reason)
  );

  app.post("/v1/payment-intents/:id/reject", async (request) =>
    decideApprovalByPayment(deps, request.actor, idParams.parse(request.params).id, "reject", decisionBody.parse(request.body).reason)
  );

  app.post("/v1/payment-intents/:id/cancel", async (request) => cancelPayment(deps, request.actor, idParams.parse(request.params).id));

  app.get("/v1/approvals", async (request) => {
    const { status } = z.object({ status: z.string().optional() }).parse(request.query);
    return listApprovals(deps, request.actor, status);
  });

  app.get("/v1/receipts", async (request) => listReceipts(deps, request.actor));

  app.get("/v1/receipts/signing-key", async () => receiptSigningInfo(deps));

  app.post("/v1/receipts/verify", async (request) => verifyProvidedReceipt(deps, request.actor, request.body));

  app.get("/v1/receipts/:id", async (request) => getReceipt(deps, request.actor, idParams.parse(request.params).id));

  app.get("/v1/receipts/:id/verify", async (request) => verifyStoredReceipt(deps, request.actor, idParams.parse(request.params).id));

  app.get("/v1/conversions", async (request) => listConversions(deps, request.actor));

  app.post("/v1/conversions/quotes", async (request, reply) => reply.status(201).send(await requestConversionQuote(deps, request.actor, request.body)));

  app.post("/v1/conversions/:id/execute", async (request) => executeConversion(deps, request.actor, idParams.parse(request.params).id));
}
