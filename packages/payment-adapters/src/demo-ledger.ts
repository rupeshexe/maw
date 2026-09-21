import { createHash } from "node:crypto";
import { MawError, roundAmount } from "@maw/shared";
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
  TransferResult
} from "./types";

export interface DemoLedgerOptions {
  fxRates: Record<string, number>;
  feeBps: number;
  quoteTtlSeconds: number;
}

const digest = (input: string) => createHash("sha256").update(input).digest("hex");

export class DemoLedgerAdapter implements PaymentAdapter {
  readonly id = "demo-ledger";
  private readonly options: DemoLedgerOptions;

  constructor(options: Partial<DemoLedgerOptions> = {}) {
    this.options = {
      fxRates: options.fxRates ?? { "USD:EUR": 0.92, "EUR:USD": 1.087, "USDC:USD": 1, "USD:USDC": 1, "USDT:USD": 1, "USD:USDT": 1, "USDC:EUR": 0.92, "EUR:USDC": 1.087 },
      feeBps: options.feeBps ?? 25,
      quoteTtlSeconds: options.quoteTtlSeconds ?? 60
    };
  }

  async capabilities(): Promise<AdapterCapabilities> {
    return {
      provider: this.id,
      demo: true,
      assets: [
        { asset: "USDC", networks: ["demo", "ethereum", "polygon", "base"] },
        { asset: "USDT", networks: ["demo", "ethereum", "polygon"] },
        { asset: "USD", networks: ["demo"] },
        { asset: "EUR", networks: ["demo"] },
        { asset: "DEMO", networks: ["demo"] }
      ],
      supportsConversion: true,
      supportsCancel: false,
      supportsWebhooks: false,
      custody: false
    };
  }

  async resolveAccount(request: AccountRequest): Promise<AccountRef> {
    return { providerAccountRef: `demo-acct-${digest(`${request.tenantId}:${request.walletId}`).slice(0, 16)}` };
  }

  async getBalance(): Promise<BalanceResult | null> {
    return null;
  }

  async quoteConversion(request: ConversionQuoteRequest): Promise<ConversionQuoteResult> {
    const rate = request.fromAsset === request.toAsset ? 1 : this.options.fxRates[`${request.fromAsset}:${request.toAsset}`];
    if (!rate) throw new MawError("provider_unsupported", `Demo ledger has no rate for ${request.fromAsset} to ${request.toAsset}`);
    const feeAmount = roundAmount((request.sourceAmount * this.options.feeBps) / 10000);
    const targetAmount = roundAmount((request.sourceAmount - feeAmount) * rate);
    const expiresAt = new Date(Date.now() + this.options.quoteTtlSeconds * 1000).toISOString();
    return {
      providerQuoteRef: `demo-quote-${digest(`${request.fromAsset}${request.toAsset}${request.sourceAmount}${expiresAt}`).slice(0, 24)}`,
      fromAsset: request.fromAsset,
      toAsset: request.toAsset,
      sourceAmount: request.sourceAmount,
      targetAmount,
      feeAmount,
      rate,
      expiresAt,
      demo: true,
      provider: this.id
    };
  }

  async convert(quote: ConversionQuoteResult, idempotencyKey: string): Promise<ConversionResult> {
    if (new Date(quote.expiresAt).getTime() < Date.now()) {
      return {
        status: "failed",
        reference: null,
        sourceAmount: quote.sourceAmount,
        targetAmount: 0,
        feeAmount: quote.feeAmount,
        demo: true,
        provider: this.id,
        failureReason: "quote_expired"
      };
    }
    return {
      status: "settled",
      reference: `demo_conv_${digest(`${quote.providerQuoteRef}:${idempotencyKey}`).slice(0, 32)}`,
      sourceAmount: quote.sourceAmount,
      targetAmount: quote.targetAmount,
      feeAmount: quote.feeAmount,
      demo: true,
      provider: this.id
    };
  }

  async transfer(request: TransferRequest): Promise<TransferResult> {
    const reference = `demo_tx_${digest(`${request.idempotencyKey}:${request.destination.addressOrReference}:${request.amount}:${request.asset}`).slice(0, 32)}`;
    if (request.destination.addressOrReference.toLowerCase().startsWith("demo-fail")) {
      return {
        status: "failed",
        reference,
        demo: true,
        provider: this.id,
        failureReason: "demo_destination_rejected",
        metadata: { simulated: true }
      };
    }
    return {
      status: "settled",
      reference,
      demo: true,
      provider: this.id,
      settledAt: new Date().toISOString(),
      metadata: { simulated: true, note: "Demo ledger transfer. No external funds moved." }
    };
  }

  async getTransferStatus(reference: string): Promise<TransferResult> {
    return { status: "settled", reference, demo: true, provider: this.id, metadata: { simulated: true } };
  }

  async cancelTransfer(): Promise<TransferResult> {
    throw new MawError("provider_unsupported", "Demo ledger transfers settle immediately and cannot be cancelled");
  }

  normalizeWebhookEvent(_headers: Record<string, string | undefined>, _rawBody: string): NormalizedWebhookEvent | null {
    return null;
  }
}
