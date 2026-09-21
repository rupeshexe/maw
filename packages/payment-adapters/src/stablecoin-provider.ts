import { createHmac, timingSafeEqual } from "node:crypto";
import { MawError } from "@maw/shared";
import type {
  AccountRef,
  AccountRequest,
  AdapterCapabilities,
  BalanceResult,
  ConversionQuoteRequest,
  ConversionQuoteResult,
  ConversionResult,
  NormalizedWebhookEvent,
  PaymentAdapter,
  TransferRequest,
  TransferResult,
  TransferStatus
} from "./types";

export interface StablecoinProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  webhookSecret: string | null;
  capabilityTtlSeconds?: number;
  requestTimeoutMs?: number;
}

const STATUSES: TransferStatus[] = ["submitted", "settled", "failed", "cancelled"];

const asStatus = (value: unknown): TransferStatus => {
  if (typeof value === "string" && (STATUSES as string[]).includes(value)) return value as TransferStatus;
  throw new MawError("provider_error", "Provider returned an unrecognized status");
};

const asNumber = (value: unknown, field: string): number => {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) throw new MawError("provider_error", `Provider returned an invalid ${field}`);
  return n;
};

export class StablecoinProviderAdapter implements PaymentAdapter {
  readonly id = "stablecoin-provider";
  private readonly config: StablecoinProviderConfig;
  private cached: { value: AdapterCapabilities; fetchedAt: number } | null = null;

  constructor(config: StablecoinProviderConfig) {
    this.config = config;
  }

  private async call(method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs ?? 15000);
    try {
      const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json",
          accept: "application/json",
          ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      const text = await response.text();
      let parsed: Record<string, unknown> = {};
      if (text) {
        try {
          parsed = JSON.parse(text) as Record<string, unknown>;
        } catch {
          throw new MawError("provider_error", `Provider returned a non-JSON response (${response.status})`);
        }
      }
      if (!response.ok) {
        const message = typeof parsed.message === "string" ? parsed.message : `Provider request failed with status ${response.status}`;
        throw new MawError("provider_error", message, { status: response.status });
      }
      return parsed;
    } catch (error) {
      if (error instanceof MawError) throw error;
      throw new MawError("provider_error", "Provider request failed or timed out");
    } finally {
      clearTimeout(timer);
    }
  }

  async capabilities(): Promise<AdapterCapabilities> {
    const ttl = (this.config.capabilityTtlSeconds ?? 300) * 1000;
    if (this.cached && Date.now() - this.cached.fetchedAt < ttl) return this.cached.value;
    const data = await this.call("GET", "/v1/capabilities");
    const assetsRaw = Array.isArray(data.assets) ? data.assets : [];
    const value: AdapterCapabilities = {
      provider: this.config.name,
      demo: false,
      assets: assetsRaw
        .filter((a): a is { asset: string; networks: string[] } => !!a && typeof (a as { asset?: unknown }).asset === "string" && Array.isArray((a as { networks?: unknown }).networks))
        .map((a) => ({ asset: a.asset, networks: a.networks.map(String) })),
      supportsConversion: data.supportsConversion === true,
      supportsCancel: data.supportsCancel === true,
      supportsWebhooks: data.supportsWebhooks === true,
      custody: data.custody === true
    };
    this.cached = { value, fetchedAt: Date.now() };
    return value;
  }

  private async assertSupported(asset: string, network: string) {
    const caps = await this.capabilities();
    const entry = caps.assets.find((a) => a.asset === asset);
    if (!entry || !entry.networks.includes(network)) {
      throw new MawError("provider_unsupported", `Provider does not support ${asset} on ${network}`);
    }
  }

  async resolveAccount(request: AccountRequest): Promise<AccountRef> {
    await this.assertSupported(request.asset, request.network);
    const data = await this.call("POST", "/v1/accounts", request, `acct:${request.tenantId}:${request.walletId}:${request.asset}:${request.network}`);
    if (typeof data.accountRef !== "string") throw new MawError("provider_error", "Provider did not return an account reference");
    return { providerAccountRef: data.accountRef };
  }

  async getBalance(ref: string, asset: string): Promise<BalanceResult | null> {
    const data = await this.call("GET", `/v1/accounts/${encodeURIComponent(ref)}/balances/${encodeURIComponent(asset)}`);
    return { available: asNumber(data.available, "available"), reserved: asNumber(data.reserved ?? 0, "reserved"), authoritative: true };
  }

  async quoteConversion(request: ConversionQuoteRequest): Promise<ConversionQuoteResult> {
    const caps = await this.capabilities();
    if (!caps.supportsConversion) throw new MawError("provider_unsupported", "Provider does not support conversion");
    const data = await this.call("POST", "/v1/quotes", request);
    if (typeof data.quoteRef !== "string" || typeof data.expiresAt !== "string") {
      throw new MawError("provider_error", "Provider returned an incomplete quote");
    }
    return {
      providerQuoteRef: data.quoteRef,
      fromAsset: request.fromAsset,
      toAsset: request.toAsset,
      sourceAmount: request.sourceAmount,
      targetAmount: asNumber(data.targetAmount, "targetAmount"),
      feeAmount: asNumber(data.feeAmount, "feeAmount"),
      rate: asNumber(data.rate, "rate"),
      expiresAt: data.expiresAt,
      demo: false,
      provider: this.config.name
    };
  }

  async convert(quote: ConversionQuoteResult, idempotencyKey: string): Promise<ConversionResult> {
    if (new Date(quote.expiresAt).getTime() < Date.now()) {
      return { status: "failed", reference: null, sourceAmount: quote.sourceAmount, targetAmount: 0, feeAmount: quote.feeAmount, demo: false, provider: this.config.name, failureReason: "quote_expired" };
    }
    const data = await this.call("POST", "/v1/conversions", { quoteRef: quote.providerQuoteRef }, idempotencyKey);
    const status = asStatus(data.status);
    const reference = typeof data.reference === "string" ? data.reference : null;
    if (status === "settled" && !reference) throw new MawError("provider_error", "Provider reported settlement without an external reference");
    return {
      status,
      reference,
      sourceAmount: quote.sourceAmount,
      targetAmount: data.targetAmount === undefined ? quote.targetAmount : asNumber(data.targetAmount, "targetAmount"),
      feeAmount: quote.feeAmount,
      demo: false,
      provider: this.config.name,
      failureReason: typeof data.failureReason === "string" ? data.failureReason : undefined
    };
  }

  async transfer(request: TransferRequest): Promise<TransferResult> {
    await this.assertSupported(request.asset, request.network);
    const data = await this.call(
      "POST",
      "/v1/transfers",
      {
        fromAccountRef: request.fromAccountRef,
        destination: request.destination,
        amount: request.amount.toString(),
        asset: request.asset,
        network: request.network,
        memo: request.memo
      },
      request.idempotencyKey
    );
    return this.toTransferResult(data);
  }

  private toTransferResult(data: Record<string, unknown>): TransferResult {
    const status = asStatus(data.status);
    const reference = typeof data.reference === "string" ? data.reference : null;
    if (status === "settled" && !reference) throw new MawError("provider_error", "Provider reported settlement without an external reference");
    return {
      status,
      reference,
      demo: false,
      provider: this.config.name,
      failureReason: typeof data.failureReason === "string" ? data.failureReason : undefined,
      settledAt: typeof data.settledAt === "string" ? data.settledAt : undefined,
      metadata: {
        providerStatus: data.status,
        confirmations: typeof data.confirmations === "number" ? data.confirmations : undefined
      }
    };
  }

  async getTransferStatus(reference: string): Promise<TransferResult> {
    return this.toTransferResult(await this.call("GET", `/v1/transfers/${encodeURIComponent(reference)}`));
  }

  async cancelTransfer(reference: string): Promise<TransferResult> {
    const caps = await this.capabilities();
    if (!caps.supportsCancel) throw new MawError("provider_unsupported", "Provider does not support cancelling transfers");
    return this.toTransferResult(await this.call("POST", `/v1/transfers/${encodeURIComponent(reference)}/cancel`, {}));
  }

  normalizeWebhookEvent(headers: Record<string, string | undefined>, rawBody: string): NormalizedWebhookEvent | null {
    if (!this.config.webhookSecret) throw new MawError("misconfigured", "Webhook secret is not configured");
    const provided = headers["x-signature"] ?? headers["x-webhook-signature"];
    if (!provided) throw new MawError("unauthenticated", "Missing webhook signature");
    const expected = createHmac("sha256", this.config.webhookSecret).update(rawBody).digest("hex");
    const a = Buffer.from(provided.replace(/^sha256=/, ""), "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new MawError("unauthenticated", "Invalid webhook signature");
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    if (typeof body.eventId !== "string" || typeof body.reference !== "string") return null;
    return {
      provider: this.config.name,
      externalEventId: body.eventId,
      reference: body.reference,
      status: asStatus(body.status),
      failureReason: typeof body.failureReason === "string" ? body.failureReason : undefined
    };
  }
}
