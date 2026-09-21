import { MawError, ROLES } from "@maw/shared";
import type { PrincipalType, Role } from "@maw/shared";
import type { Actor, Deps } from "./context";
import { audit } from "./audit";

export interface PrincipalClaims {
  tenantId: string;
  externalSubjectId: string;
  displayName: string;
  email?: string | null;
  roles: string[];
  principalType: PrincipalType;
}

const knownRoles = (roles: string[]): Role[] => roles.filter((r): r is Role => (ROLES as readonly string[]).includes(r));

export async function syncPrincipal(deps: Deps, claims: PrincipalClaims): Promise<Actor> {
  const roles = knownRoles(claims.roles);
  const existing = await deps.db.principal.findUnique({
    where: { tenantId_externalSubjectId: { tenantId: claims.tenantId, externalSubjectId: claims.externalSubjectId } }
  });
  if (existing && existing.status !== "active") throw new MawError("forbidden", "Principal is disabled");
  const changed =
    !existing ||
    existing.displayName !== claims.displayName ||
    existing.email !== (claims.email ?? null) ||
    existing.roles.slice().sort().join() !== roles.slice().sort().join() ||
    existing.principalType !== claims.principalType;
  const principal = changed
    ? await deps.db.principal.upsert({
        where: { tenantId_externalSubjectId: { tenantId: claims.tenantId, externalSubjectId: claims.externalSubjectId } },
        create: {
          tenantId: claims.tenantId,
          externalSubjectId: claims.externalSubjectId,
          principalType: claims.principalType,
          displayName: claims.displayName,
          email: claims.email ?? null,
          roles
        },
        update: { displayName: claims.displayName, email: claims.email ?? null, roles, principalType: claims.principalType }
      })
    : existing;
  if (changed) {
    await audit(deps.db, { tenantId: claims.tenantId, principalId: principal.id }, {
      eventType: existing ? "principal.updated" : "principal.created",
      resourceType: "principal",
      resourceId: principal.id,
      outcome: "success",
      details: { roles, principalType: claims.principalType }
    });
  }
  return {
    principalId: principal.id,
    tenantId: principal.tenantId,
    roles,
    principalType: principal.principalType as PrincipalType,
    displayName: principal.displayName
  };
}

export async function listPrincipals(deps: Deps, tenantId: string) {
  return deps.db.principal.findMany({ where: { tenantId }, orderBy: { displayName: "asc" } });
}
