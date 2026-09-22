import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTPayload } from "jose";
import { MawError } from "@maw/shared";
import type { PrincipalType } from "@maw/shared";
import { syncPrincipal } from "@maw/domain";
import type { Actor, Deps } from "@maw/domain";
import type { AppConfig } from "./config";

export interface Authenticator {
  readonly mode: "demo" | "entra";
  authenticate(headers: Record<string, string | string[] | undefined>): Promise<Actor>;
}

const header = (headers: Record<string, string | string[] | undefined>, name: string): string | undefined => {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
};

class DemoAuthenticator implements Authenticator {
  readonly mode = "demo" as const;
  constructor(
    private readonly deps: Deps,
    private readonly tenantId: string
  ) {}

  async authenticate(headers: Record<string, string | string[] | undefined>): Promise<Actor> {
    const subject = header(headers, "x-demo-user");
    if (!subject) throw new MawError("unauthenticated", "Demo mode requires the x-demo-user header");
    const principal = await this.deps.db.principal.findUnique({
      where: { tenantId_externalSubjectId: { tenantId: this.tenantId, externalSubjectId: subject } }
    });
    if (!principal || principal.status !== "active") throw new MawError("unauthenticated", "Unknown demo user");
    return syncPrincipal(this.deps, {
      tenantId: this.tenantId,
      externalSubjectId: subject,
      displayName: principal.displayName,
      email: principal.email,
      roles: principal.roles,
      principalType: principal.principalType as PrincipalType
    });
  }
}

class EntraAuthenticator implements Authenticator {
  readonly mode = "entra" as const;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuers: string[];
  private readonly audience: string[];

  constructor(
    private readonly deps: Deps,
    config: AppConfig
  ) {
    const tenant = config.ENTRA_TENANT_ID as string;
    this.jwks = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`));
    this.issuers = config.ENTRA_ISSUER ? [config.ENTRA_ISSUER] : [`https://login.microsoftonline.com/${tenant}/v2.0`, `https://sts.windows.net/${tenant}/`];
    const clientId = config.ENTRA_CLIENT_ID as string;
    this.audience = config.ENTRA_AUDIENCE ? [config.ENTRA_AUDIENCE] : [clientId, `api://${clientId}`];
  }

  async authenticate(headers: Record<string, string | string[] | undefined>): Promise<Actor> {
    const authorization = header(headers, "authorization");
    if (!authorization?.toLowerCase().startsWith("bearer ")) throw new MawError("unauthenticated", "Missing bearer token");
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(authorization.slice(7).trim(), this.jwks, { issuer: this.issuers, audience: this.audience }));
    } catch {
      throw new MawError("unauthenticated", "Invalid or expired access token");
    }
    const tenantId = typeof payload.tid === "string" ? payload.tid : null;
    const subject = typeof payload.oid === "string" ? payload.oid : payload.sub;
    if (!tenantId || !subject) throw new MawError("unauthenticated", "Token is missing tenant or subject claims");
    const roles = Array.isArray(payload.roles) ? payload.roles.filter((r): r is string => typeof r === "string") : [];
    const isAppToken = payload.idtyp === "app" || (typeof payload.scp !== "string" && roles.length > 0 && typeof payload.preferred_username !== "string");
    const principalType: PrincipalType = roles.includes("MAW.Agent") ? "agent" : isAppToken ? "service" : "human";
    const displayName = String(payload.name ?? payload.preferred_username ?? payload.azp ?? subject);
    return syncPrincipal(this.deps, {
      tenantId,
      externalSubjectId: subject,
      displayName,
      email: typeof payload.preferred_username === "string" ? payload.preferred_username : null,
      roles,
      principalType
    });
  }
}

export function createAuthenticator(deps: Deps, config: AppConfig): Authenticator {
  return config.AUTH_MODE === "entra" ? new EntraAuthenticator(deps, config) : new DemoAuthenticator(deps, config.MAW_TENANT_ID);
}
