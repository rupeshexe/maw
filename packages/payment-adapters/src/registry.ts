import { MawError } from "@maw/shared";
import { DemoLedgerAdapter } from "./demo-ledger";
import { StablecoinProviderAdapter } from "./stablecoin-provider";
import type { PaymentAdapter } from "./types";

export interface AdapterEnv {
  MAW_MODE?: string;
  STABLECOIN_PROVIDER_ENABLED?: string;
  STABLECOIN_PROVIDER_NAME?: string;
  STABLECOIN_PROVIDER_BASE_URL?: string;
  STABLECOIN_PROVIDER_API_KEY?: string;
  STABLECOIN_PROVIDER_WEBHOOK_SECRET?: string;
  DEMO_FX_USD_EUR?: string;
  DEMO_FX_FEE_BPS?: string;
}

export class AdapterRegistry {
  private readonly adapters = new Map<string, PaymentAdapter>();
  readonly mode: "demo" | "live";

  constructor(mode: "demo" | "live") {
    this.mode = mode;
  }

  register(adapter: PaymentAdapter) {
    this.adapters.set(adapter.id, adapter);
  }

  has(id: string) {
    return this.adapters.has(id);
  }

  get(id: string): PaymentAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter) throw new MawError("provider_unsupported", `Payment provider "${id}" is not configured`);
    return adapter;
  }

  list(): PaymentAdapter[] {
    return [...this.adapters.values()];
  }
}

export function createAdapterRegistry(env: AdapterEnv): AdapterRegistry {
  const mode = env.MAW_MODE === "live" ? "live" : "demo";
  const registry = new AdapterRegistry(mode);
  const usd = env.DEMO_FX_USD_EUR ? Number(env.DEMO_FX_USD_EUR) : 0.92;
  const feeBps = env.DEMO_FX_FEE_BPS ? Number(env.DEMO_FX_FEE_BPS) : 25;
  if (mode === "demo") {
    registry.register(
      new DemoLedgerAdapter({
        fxRates: { "USD:EUR": usd, "EUR:USD": 1 / usd, "USDC:USD": 1, "USD:USDC": 1, "USDT:USD": 1, "USD:USDT": 1, "USDC:EUR": usd, "EUR:USDC": 1 / usd },
        feeBps
      })
    );
  }
  if (env.STABLECOIN_PROVIDER_ENABLED === "true") {
    if (!env.STABLECOIN_PROVIDER_BASE_URL || !env.STABLECOIN_PROVIDER_API_KEY || !env.STABLECOIN_PROVIDER_NAME) {
      throw new MawError("misconfigured", "STABLECOIN_PROVIDER_NAME, STABLECOIN_PROVIDER_BASE_URL and STABLECOIN_PROVIDER_API_KEY are required when the provider is enabled");
    }
    registry.register(
      new StablecoinProviderAdapter({
        name: env.STABLECOIN_PROVIDER_NAME,
        baseUrl: env.STABLECOIN_PROVIDER_BASE_URL,
        apiKey: env.STABLECOIN_PROVIDER_API_KEY,
        webhookSecret: env.STABLECOIN_PROVIDER_WEBHOOK_SECRET || null
      })
    );
  }
  return registry;
}
