import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  assignPolicy,
  createPolicy,
  createWallet,
  fundDemoWallet,
  getPolicy,
  getWallet,
  getWalletBalance,
  getWalletSpendProgress,
  listPolicies,
  listWallets,
  previewPolicyEvaluation,
  setPolicyStatus,
  setWalletStatus,
  unassignPolicy,
  updatePolicy
} from "@maw/domain";
import type { AppContext } from "../app";

const idParams = z.object({ id: z.string().min(1) });

export function registerWalletRoutes(app: FastifyInstance, ctx: AppContext) {
  const { deps } = ctx;

  app.get("/v1/wallets", async (request) => listWallets(deps, request.actor));

  app.post("/v1/wallets", async (request, reply) => reply.status(201).send(await createWallet(deps, request.actor, request.body)));

  app.get("/v1/wallets/:id", async (request) => getWallet(deps, request.actor, idParams.parse(request.params).id));

  app.get("/v1/wallets/:id/balance", async (request) => getWalletBalance(deps, request.actor, idParams.parse(request.params).id));

  app.get("/v1/wallets/:id/spend-progress", async (request) => getWalletSpendProgress(deps, request.actor, idParams.parse(request.params).id));

  app.post("/v1/wallets/:id/status", async (request) => {
    const { status } = z.object({ status: z.enum(["active", "suspended"]) }).parse(request.body);
    return setWalletStatus(deps, request.actor, idParams.parse(request.params).id, status);
  });

  app.post("/v1/wallets/:id/fund", async (request) => {
    const body = z.object({ amount: z.number().positive().finite(), asset: z.string().optional() }).parse(request.body);
    return fundDemoWallet(deps, request.actor, idParams.parse(request.params).id, body.amount, body.asset);
  });

  app.get("/v1/policies", async (request) => listPolicies(deps, request.actor));

  app.post("/v1/policies", async (request, reply) => reply.status(201).send(await createPolicy(deps, request.actor, request.body)));

  app.get("/v1/policies/:id", async (request) => getPolicy(deps.db, request.actor.tenantId, idParams.parse(request.params).id));

  app.put("/v1/policies/:id", async (request) => updatePolicy(deps, request.actor, idParams.parse(request.params).id, request.body));

  app.post("/v1/policies/:id/status", async (request) => {
    const { status } = z.object({ status: z.enum(["active", "retired"]) }).parse(request.body);
    return setPolicyStatus(deps, request.actor, idParams.parse(request.params).id, status);
  });

  app.post("/v1/policy-assignments", async (request, reply) => reply.status(201).send(await assignPolicy(deps, request.actor, request.body)));

  app.delete("/v1/policy-assignments/:id", async (request) => unassignPolicy(deps, request.actor, idParams.parse(request.params).id));

  app.post("/v1/policy-evaluations/preview", async (request) => previewPolicyEvaluation(deps, request.actor, request.body));
}
