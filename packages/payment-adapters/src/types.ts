export interface AssetCapability {
  asset: string;
  networks: string[];
}

export interface AdapterCapabilities {
  provider: string;
  demo: boolean;
  assets: AssetCapability[];
  supportsConversion: boolean;
  supportsCancel: boolean;
  supportsWebhooks: boolean;
  custody: boolean;
}

export interface AccountRequest {
  tenantId: string;
  walletId: string;
  asset: string;
  network: string;
}

export interface AccountRef {
  providerAccountRef: string;
}

export interface BalanceResult {
  available: number;
  reserved: number;
  authoritative: boolean;
}

export interface TransferRequest {
  idempotencyKey: string;
  fromAccountRef: string | null;
  destination: {
    type: string;
    addressOrReference: string;
    network: string;
  };
  amount: number;
  asset: string;
  network: string;
  memo?: string;
}

export type TransferStatus = "submitted" | "settled" | "failed" | "cancelled";

export interface TransferResult {
  status: TransferStatus;
  reference: string | null;
  demo: boolean;
  provider: string;
  failureReason?: string;
  settledAt?: string;
  metadata: Record<string, unknown>;
}

export interface ConversionQuoteRequest {
  fromAsset: string;
  toAsset: string;
  sourceAmount: number;
}

export interface ConversionQuoteResult {
  providerQuoteRef: string;
  fromAsset: string;
  toAsset: string;
  sourceAmount: number;
  targetAmount: number;
  feeAmount: number;
  rate: number;
  expiresAt: string;
  demo: boolean;
  provider: string;
}

export interface ConversionResult {
  status: TransferStatus;
  reference: string | null;
  sourceAmount: number;
  targetAmount: number;
  feeAmount: number;
  demo: boolean;
  provider: string;
  failureReason?: string;
}

export interface NormalizedWebhookEvent {
  provider: string;
  externalEventId: string;
  reference: string;
  status: TransferStatus;
  failureReason?: string;
}

export interface PaymentAdapter {
  readonly id: string;
  capabilities(): Promise<AdapterCapabilities>;
  resolveAccount(request: AccountRequest): Promise<AccountRef>;
  getBalance(ref: string, asset: string): Promise<BalanceResult | null>;
  quoteConversion(request: ConversionQuoteRequest): Promise<ConversionQuoteResult>;
  convert(quote: ConversionQuoteResult, idempotencyKey: string): Promise<ConversionResult>;
  transfer(request: TransferRequest): Promise<TransferResult>;
  getTransferStatus(reference: string): Promise<TransferResult>;
  cancelTransfer(reference: string): Promise<TransferResult>;
  normalizeWebhookEvent(headers: Record<string, string | undefined>, rawBody: string): NormalizedWebhookEvent | null;
}
