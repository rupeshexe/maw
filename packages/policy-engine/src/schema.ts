import { z } from "zod";
import { MawError } from "@maw/shared";

const period = z.enum(["day", "week", "month"]);
const amount = z.number().positive().finite();

export const ruleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("max_per_transaction"), amount }),
  z.object({ type: z.literal("max_per_day"), amount }),
  z.object({ type: z.literal("max_per_week"), amount }),
  z.object({ type: z.literal("max_per_month"), amount }),
  z.object({ type: z.literal("category_limit"), category: z.string().min(1), period, amount }),
  z.object({
    type: z.literal("supplier_limit"),
    supplierGroup: z.string().min(1).optional(),
    supplierId: z.string().min(1).optional(),
    period,
    amount
  }),
  z.object({ type: z.literal("asset_allowlist"), assets: z.array(z.string().min(1)).min(1) }),
  z.object({ type: z.literal("network_allowlist"), networks: z.array(z.string().min(1)).min(1) }),
  z.object({
    type: z.literal("destination_allowlist"),
    mode: z.literal("strict").default("strict"),
    destinationIds: z.array(z.string().min(1)).optional()
  }),
  z.object({
    type: z.literal("destination_denylist"),
    destinationIds: z.array(z.string().min(1)).default([]),
    addresses: z.array(z.string().min(1)).default([])
  }),
  z.object({
    type: z.literal("supplier_allowlist"),
    supplierGroups: z.array(z.string().min(1)).default([]),
    supplierIds: z.array(z.string().min(1)).default([])
  }),
  z.object({ type: z.literal("require_approval_above"), amount }),
  z.object({
    type: z.literal("business_hours_only"),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
    days: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5])
  }),
  z.object({ type: z.literal("max_transactions_per_period"), period, count: z.number().int().positive() }),
  z.object({ type: z.literal("subscription_limit"), amount, monthlyTotal: amount.optional() }),
  z.object({ type: z.literal("escrow_limit"), amount })
]);

export const policyDocumentSchema = z.object({
  currency: z.string().min(3).max(8).default("USD"),
  rules: z.array(ruleSchema).min(1)
});

export type PolicyRule = z.infer<typeof ruleSchema>;
export type PolicyDocument = z.infer<typeof policyDocumentSchema>;

export function parsePolicyDocument(input: unknown): PolicyDocument {
  const result = policyDocumentSchema.safeParse(input);
  if (!result.success) {
    throw new MawError("validation_error", "Invalid policy document", result.error.flatten());
  }
  return result.data;
}
