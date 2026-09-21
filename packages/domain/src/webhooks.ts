import { MawError } from "@maw/shared";
import { isUniqueViolation } from "./context";
import type { Deps } from "./context";
import { finalizeTransfer } from "./payments";

export async function handleProviderWebhook(deps: Deps, providerId: string, headers: Record<string, string | undefined>, rawBody: string) {
  const adapter = deps.adapters.get(providerId);
  const event = adapter.normalizeWebhookEvent(headers, rawBody);
  if (!event) return { accepted: false as const, reason: "ignored" };
  try {
    await deps.db.webhookEvent.create({ data: { provider: providerId, externalId: event.externalEventId } });
  } catch (error) {
    if (isUniqueViolation(error)) return { accepted: true as const, duplicate: true };
    throw error;
  }
  const transaction = await deps.db.transaction.findFirst({ where: { txHashOrReference: event.reference, status: "submitted" } });
  if (!transaction) throw new MawError("not_found", "No pending transaction matches this event");
  await finalizeTransfer(
    deps,
    { tenantId: transaction.tenantId, principalId: null },
    transaction.paymentIntentId,
    { status: event.status, reference: event.reference, demo: false, provider: transaction.provider, failureReason: event.failureReason, metadata: { webhookEventId: event.externalEventId } },
    transaction.id
  );
  return { accepted: true as const, duplicate: false };
}
