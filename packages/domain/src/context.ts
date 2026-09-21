import type { Db, Tx } from "@maw/db";
import type { AdapterRegistry } from "@maw/payment-adapters";
import type { ReceiptSigner } from "@maw/receipt-kit";
import { MawError } from "@maw/shared";
import type { PrincipalType, Role } from "@maw/shared";
import { Prisma } from "@maw/db";

export interface Actor {
  principalId: string;
  tenantId: string;
  roles: Role[];
  principalType: PrincipalType;
  displayName: string;
  system?: boolean;
}

export interface Deps {
  db: Db;
  adapters: AdapterRegistry;
  signer: ReceiptSigner;
}

export type Client = Db | Tx;

export const num = (value: Prisma.Decimal | number | string | null | undefined): number =>
  value === null || value === undefined ? 0 : Number(value);

export const hasRole = (actor: Actor, ...roles: Role[]): boolean =>
  actor.system === true || roles.some((role) => actor.roles.includes(role));

export function requireRole(actor: Actor, ...roles: Role[]): void {
  if (!hasRole(actor, ...roles)) {
    throw new MawError("forbidden", `Requires one of: ${roles.join(", ")}`);
  }
}

export const isPrivileged = (actor: Actor): boolean => hasRole(actor, "MAW.Admin", "MAW.WalletOperator");

export const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

export const SYSTEM_ACTOR = (tenantId: string, principalId: string): Actor => ({
  principalId,
  tenantId,
  roles: [],
  principalType: "service",
  displayName: "MAW scheduler",
  system: true
});
