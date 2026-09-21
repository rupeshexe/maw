import { z } from "zod";
import { MawError, addAmounts, subtractAmounts } from "@maw/shared";
import type { ConversionQuoteResult } from "@maw/payment-adapters";
import { audit } from "./audit";
import { isPrivileged, num } from "./context";
import type { Actor, Deps } from "./context";
import { assertWalletAccess, loadWallet } from "./wallets";

const quoteSchema = z.object({
  walletId: z.string().min(1),
  fromAsset: z.string().min(2).max(12),
  toAsset: z.string().min(2).max(12),
  sourceAmount: z.number().positive().finite()
});

const LOCAL_LEDGER = "demo-ledger";

function assertCanConvert(actor: Actor, wallet: { principalId: string }) {
  assertWalletAccess(actor, wallet);
  if (!isPrivileged(actor) && wallet.principalId !== actor.principalId) throw new MawError("forbidden", "Not permitted to convert funds for this wallet");
}

export async function requestConversionQuote(deps: Deps, actor: Actor, input: unknown) {
  const data = quoteSchema.parse(input);
  const wallet = await loadWallet(deps.db, actor.tenantId, data.walletId);
  assertCanConvert(actor, wallet);
  if (wallet.status !== "active") throw new MawError("invalid_state", "Wallet is not active");
  const adapter = deps.adapters.get(wallet.provider);
  const caps = await adapter.capabilities();
  if (!caps.supportsConversion) throw new MawError("provider_unsupported", `${wallet.provider} does not support conversion`);
  const quote = await adapter.quoteConversion({ fromAsset: data.fromAsset, toAsset: data.toAsset, sourceAmount: data.sourceAmount });
  const row = await deps.db.conversionQuote.create({
    data: {
      tenantId: actor.tenantId,
      walletId: wallet.id,
      fromAsset: quote.fromAsset,
      toAsset: quote.toAsset,
      sourceAmount: quote.sourceAmount,
      targetAmount: quote.targetAmount,
      feeAmount: quote.feeAmount,
      rate: quote.rate,
      provider: wallet.provider,
      demo: quote.demo,
      expiresAt: new Date(quote.expiresAt),
      requestedBy: actor.principalId,
      providerRef: quote.providerQuoteRef
    }
  });
  await audit(deps.db, actor, { eventType: "conversion.quoted", resourceType: "conversion", resourceId: row.id, outcome: "success", details: { fromAsset: quote.fromAsset, toAsset: quote.toAsset, demo: quote.demo } });
  return serialize(row);
}

const serialize = <T extends { sourceAmount: unknown; targetAmount: unknown; feeAmount: unknown; rate: unknown }>(row: T) => ({
  ...row,
  sourceAmount: num(row.sourceAmount as number),
  targetAmount: num(row.targetAmount as number),
  feeAmount: num(row.feeAmount as number),
  rate: num(row.rate as number)
});

export async function executeConversion(deps: Deps, actor: Actor, quoteId: string) {
  const quote = await deps.db.conversionQuote.findFirst({ where: { id: quoteId, tenantId: actor.tenantId } });
  if (!quote) throw new MawError("not_found", "Quote not found");
  const wallet = await loadWallet(deps.db, actor.tenantId, quote.walletId);
  assertCanConvert(actor, wallet);
  if (wallet.status !== "active") throw new MawError("invalid_state", "Wallet is not active");
  if (quote.expiresAt.getTime() <= Date.now()) {
    await deps.db.conversionQuote.updateMany({ where: { id: quoteId, status: "open" }, data: { status: "expired" } });
    throw new MawError("invalid_state", "Quote has expired");
  }
  const local = wallet.provider === LOCAL_LEDGER;
  if (local) {
    const balance = await deps.db.walletBalance.findUnique({ where: { walletId_asset: { walletId: wallet.id, asset: quote.fromAsset } } });
    if (num(balance?.available) < num(quote.sourceAmount)) throw new MawError("insufficient_funds", "Available balance is insufficient for this conversion");
  }
  const claim = await deps.db.conversionQuote.updateMany({ where: { id: quoteId, status: "open", expiresAt: { gt: new Date() } }, data: { status: "converting" } });
  if (claim.count === 0) throw new MawError("invalid_state", "Quote is no longer available");
  const adapter = deps.adapters.get(wallet.provider);
  const providerQuote: ConversionQuoteResult = {
    providerQuoteRef: quote.providerRef ?? quote.id,
    fromAsset: quote.fromAsset,
    toAsset: quote.toAsset,
    sourceAmount: num(quote.sourceAmount),
    targetAmount: num(quote.targetAmount),
    feeAmount: num(quote.feeAmount),
    rate: num(quote.rate),
    expiresAt: quote.expiresAt.toISOString(),
    demo: quote.demo,
    provider: wallet.provider
  };
  const result = await adapter.convert(providerQuote, `conv:${quote.id}`).catch((error: unknown) => ({
    status: "failed" as const,
    reference: null,
    sourceAmount: providerQuote.sourceAmount,
    targetAmount: 0,
    feeAmount: providerQuote.feeAmount,
    demo: quote.demo,
    provider: wallet.provider,
    failureReason: error instanceof MawError ? error.message : "provider_request_failed"
  }));
  await deps.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${wallet.id} FOR UPDATE`;
    if (result.status === "settled") {
      if (local) {
        const from = await tx.walletBalance.findUnique({ where: { walletId_asset: { walletId: wallet.id, asset: quote.fromAsset } } });
        if (num(from?.available) < providerQuote.sourceAmount) throw new MawError("insufficient_funds", "Available balance is insufficient for this conversion");
        await tx.walletBalance.update({ where: { walletId_asset: { walletId: wallet.id, asset: quote.fromAsset } }, data: { available: subtractAmounts(num(from?.available), providerQuote.sourceAmount) } });
        const to = await tx.walletBalance.findUnique({ where: { walletId_asset: { walletId: wallet.id, asset: quote.toAsset } } });
        await tx.walletBalance.upsert({
          where: { walletId_asset: { walletId: wallet.id, asset: quote.toAsset } },
          create: { tenantId: actor.tenantId, walletId: wallet.id, asset: quote.toAsset, available: result.targetAmount },
          update: { available: addAmounts(num(to?.available), result.targetAmount) }
        });
      }
      await tx.conversionQuote.update({ where: { id: quote.id }, data: { status: "settled" } });
    } else {
      await tx.conversionQuote.update({ where: { id: quote.id }, data: { status: "failed" } });
    }
    await audit(tx, actor, {
      eventType: result.status === "settled" ? "conversion.settled" : "conversion.failed",
      resourceType: "conversion",
      resourceId: quote.id,
      outcome: result.status === "settled" ? "success" : "failure",
      details: { reference: result.reference, demo: result.demo, reason: result.failureReason ?? null }
    });
  });
  const final = await deps.db.conversionQuote.findUniqueOrThrow({ where: { id: quote.id } });
  return { ...serialize(final), externalReference: result.reference, demo: result.demo, failureReason: result.failureReason ?? null };
}

export async function listConversions(deps: Deps, actor: Actor) {
  const rows = await deps.db.conversionQuote.findMany({ where: { tenantId: actor.tenantId }, orderBy: { createdAt: "desc" }, take: 100 });
  return rows.map(serialize);
}
