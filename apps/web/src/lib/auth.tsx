"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { PublicClientApplication } from "@azure/msal-browser";

export interface PublicConfig {
  authMode: "demo" | "entra";
  entra: { tenantId: string; clientId: string; scope: string };
}

export interface Me {
  principalId: string;
  tenantId: string;
  displayName: string;
  principalType: string;
  roles: string[];
}

export interface RuntimeInfo {
  mode: string;
  demo: boolean;
  authMode: string;
  providers: { provider: string; demo: boolean; assets: { asset: string; networks: string[] }[]; supportsConversion: boolean }[];
}

export const DEMO_USERS = [
  { id: "demo-admin", label: "Avery Admin", role: "Admin" },
  { id: "demo-policy", label: "Priya Policy", role: "Policy admin" },
  { id: "demo-operator", label: "Omar Operator", role: "Wallet operator" },
  { id: "demo-approver", label: "Alex Approver", role: "Approver" },
  { id: "demo-auditor", label: "Ada Auditor", role: "Auditor" },
  { id: "demo-agent", label: "Procurement Agent", role: "Agent" }
];

export class ApiError extends Error {
  code: string;
  status: number;
  details: unknown;
  constructor(status: number, code: string, message: string, details: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface AuthState {
  ready: boolean;
  me: Me | null;
  runtime: RuntimeInfo | null;
  authMode: "demo" | "entra";
  demoUser: string;
  setDemoUser: (id: string) => void;
  signOut: () => void;
  request: <T>(path: string, init?: { method?: string; body?: unknown; idempotencyKey?: string }) => Promise<T>;
  error: string | null;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is missing");
  return value;
}

export function AuthProvider({ config, children }: { config: PublicConfig; children: ReactNode }) {
  const [demoUser, setDemoUserState] = useState("demo-admin");
  const [me, setMe] = useState<Me | null>(null);
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const msal = useRef<PublicClientApplication | null>(null);
  const demoRef = useRef(demoUser);
  demoRef.current = demoUser;

  const getToken = useCallback(async (): Promise<string | null> => {
    const app = msal.current;
    if (!app) return null;
    const account = app.getActiveAccount() ?? app.getAllAccounts()[0];
    if (!account) return null;
    try {
      const result = await app.acquireTokenSilent({ account, scopes: [config.entra.scope] });
      return result.accessToken;
    } catch {
      await app.acquireTokenRedirect({ scopes: [config.entra.scope] });
      return null;
    }
  }, [config.entra.scope]);

  const request = useCallback(
    async <T,>(path: string, init: { method?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<T> => {
      const headers: Record<string, string> = { accept: "application/json" };
      if (init.body !== undefined) headers["content-type"] = "application/json";
      if (init.idempotencyKey) headers["idempotency-key"] = init.idempotencyKey;
      if (config.authMode === "demo") headers["x-demo-user"] = demoRef.current;
      else {
        const token = await getToken();
        if (token) headers.authorization = `Bearer ${token}`;
      }
      const response = await fetch(`/api/maw${path}`, { method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body), cache: "no-store" });
      const text = await response.text();
      const data = text ? JSON.parse(text) : null;
      if (!response.ok) {
        const err = data?.error;
        throw new ApiError(response.status, err?.code ?? "error", err?.message ?? `Request failed (${response.status})`, err?.details);
      }
      return data as T;
    },
    [config.authMode, getToken]
  );

  const load = useCallback(async () => {
    try {
      const [profile, info] = await Promise.all([request<Me>("/v1/me"), request<RuntimeInfo>("/v1/config")]);
      setMe(profile);
      setRuntime(info);
      setError(null);
    } catch (e) {
      setMe(null);
      setError(e instanceof Error ? e.message : "Unable to reach the MAW API");
    } finally {
      setReady(true);
    }
  }, [request]);

  useEffect(() => {
    if (config.authMode === "entra") {
      (async () => {
        const { PublicClientApplication } = await import("@azure/msal-browser");
        const app = new PublicClientApplication({
          auth: { clientId: config.entra.clientId, authority: `https://login.microsoftonline.com/${config.entra.tenantId}`, redirectUri: window.location.origin },
          cache: { cacheLocation: "sessionStorage" }
        });
        await app.initialize();
        const redirect = await app.handleRedirectPromise();
        if (redirect?.account) app.setActiveAccount(redirect.account);
        msal.current = app;
        if (app.getAllAccounts().length === 0) {
          await app.loginRedirect({ scopes: [config.entra.scope] });
          return;
        }
        app.setActiveAccount(app.getAllAccounts()[0]);
        await load();
      })().catch((e) => {
        setError(e instanceof Error ? e.message : "Sign-in failed");
        setReady(true);
      });
      return;
    }
    try {
      const stored = window.localStorage.getItem("maw.demoUser");
      if (stored && DEMO_USERS.some((u) => u.id === stored)) {
        setDemoUserState(stored);
        demoRef.current = stored;
      }
    } catch {
      demoRef.current = "demo-admin";
    }
    load();
  }, [config, load]);

  const setDemoUser = useCallback(
    (id: string) => {
      demoRef.current = id;
      setDemoUserState(id);
      try {
        window.localStorage.setItem("maw.demoUser", id);
      } catch {
        demoRef.current = id;
      }
      setReady(false);
      load();
    },
    [load]
  );

  const signOut = useCallback(() => {
    if (msal.current) msal.current.logoutRedirect();
  }, []);

  const value = useMemo<AuthState>(
    () => ({ ready, me, runtime, authMode: config.authMode, demoUser, setDemoUser, signOut, request, error }),
    [ready, me, runtime, config.authMode, demoUser, setDemoUser, signOut, request, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
