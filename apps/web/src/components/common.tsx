"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Button, Notice, StatusChip } from "@maw/ui";
import { ApiError, useAuth } from "@/lib/auth";

export function ErrorNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return <Notice tone="error">{message}</Notice>;
}

export function LoadState({ loading, error, children, hasData }: { loading: boolean; error: string | null; hasData: boolean; children: ReactNode }) {
  if (error) return <ErrorNotice message={error} />;
  if (!hasData) return loading ? <p className="text-sm text-slate-500">Loading…</p> : null;
  return <>{children}</>;
}

export function useAction() {
  const { request } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(path: string, init: { method?: string; body?: unknown; idempotencyKey?: string }): Promise<T | null> {
    setPending(true);
    setError(null);
    try {
      return await request<T>(path, init);
    } catch (e) {
      if (e instanceof ApiError && e.details && typeof e.details === "object" && "reasons" in (e.details as object)) {
        const reasons = (e.details as { reasons: { message: string }[] }).reasons;
        setError(`${e.message}: ${reasons.map((r) => r.message).join("; ")}`);
      } else setError(e instanceof Error ? e.message : "Request failed");
      return null;
    } finally {
      setPending(false);
    }
  }

  return { run, pending, error, setError };
}

export function RowActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-1.5">{children}</div>;
}

export function ActionButton({ label, onClick, variant = "secondary", disabled }: { label: string; onClick: () => void | Promise<void>; variant?: "primary" | "secondary" | "danger" | "ghost"; disabled?: boolean }) {
  return (
    <Button
      variant={variant}
      disabled={disabled}
      className="px-2 py-1 text-xs"
      onClick={(e) => {
        e.stopPropagation();
        void onClick();
      }}
    >
      {label}
    </Button>
  );
}

export interface Reason {
  code: string;
  outcome: string;
  message: string;
}

export function ReasonList({ reasons }: { reasons: Reason[] }) {
  if (!reasons?.length) return <p className="text-sm text-slate-600">All policy checks passed.</p>;
  return (
    <ul className="space-y-2">
      {reasons.map((r, i) => (
        <li key={`${r.code}-${i}`} className="flex items-start gap-2 text-sm">
          <StatusChip status={r.outcome} />
          <span className="text-slate-800">{r.message}</span>
        </li>
      ))}
    </ul>
  );
}

export function useCurrentRoles() {
  const { me } = useAuth();
  const roles = me?.roles ?? [];
  return {
    roles,
    has: (...wanted: string[]) => wanted.some((r) => roles.includes(r)),
    isAgentOnly: roles.length > 0 && roles.every((r) => r === "MAW.Agent")
  };
}
