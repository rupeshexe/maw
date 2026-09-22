import { prisma } from "@maw/db";
import { createAdapterRegistry } from "@maw/payment-adapters";
import { createSignerFromEnv } from "@maw/receipt-kit";
import { runDueSubscriptions, runEscrowMaintenance } from "@maw/domain";
import type { Deps } from "@maw/domain";
import { buildApp } from "./app";
import { createAuthenticator } from "./auth";
import { loadConfig } from "./config";

async function main() {
  const config = loadConfig();
  const deps: Deps = {
    db: prisma,
    adapters: createAdapterRegistry(process.env),
    signer: createSignerFromEnv(process.env)
  };
  const auth = createAuthenticator(deps, config);
  const app = await buildApp({ deps, auth, config });

  let timer: NodeJS.Timeout | undefined;
  if (config.SCHEDULER_INTERVAL_SECONDS > 0) {
    let running = false;
    timer = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        await runDueSubscriptions(deps);
        await runEscrowMaintenance(deps);
      } catch (error) {
        app.log.error({ err: error }, "scheduler cycle failed");
      } finally {
        running = false;
      }
    }, config.SCHEDULER_INTERVAL_SECONDS * 1000);
  }

  const shutdown = async () => {
    if (timer) clearInterval(timer);
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await app.listen({ port: config.API_PORT, host: "0.0.0.0" });
  app.log.info(`MAW API listening in ${deps.adapters.mode} mode with ${auth.mode} authentication`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
