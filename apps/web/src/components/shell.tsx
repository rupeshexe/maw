"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { Notice, cx } from "@maw/ui";
import { DEMO_USERS, useAuth } from "@/lib/auth";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/wallets", label: "Agent Wallets" },
  { href: "/policies", label: "Spending Policies" },
  { href: "/payments", label: "Payments" },
  { href: "/approvals", label: "Approvals" },
  { href: "/destinations", label: "Suppliers & Destinations" },
  { href: "/subscriptions", label: "Subscriptions" },
  { href: "/escrow", label: "Escrow" },
  { href: "/receipts", label: "Receipts" },
  { href: "/billing", label: "Azure Billing" },
  { href: "/audit", label: "Audit Log" },
  { href: "/settings", label: "Settings & Integrations" }
];

export function Shell({ children }: { children: ReactNode }) {
  const { ready, me, runtime, authMode, demoUser, setDemoUser, signOut, error } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen lg:flex">
      <aside className={cx("fixed inset-y-0 left-0 z-40 w-64 transform border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-16 items-center gap-3 border-b border-slate-100 px-5">
          <img src="/maw-logo.png" alt="MAW" className="h-8 w-8" />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-900">MAW</p>
            <p className="text-xs text-slate-500">Microsoft Agent Wallet</p>
          </div>
        </div>
        <nav className="space-y-0.5 p-3" aria-label="Primary">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cx("block rounded-lg px-3 py-2 text-sm font-medium", active ? "bg-indigo-50 text-indigo-800" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900")}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <div className="min-w-0 flex-1">
        {runtime?.demo && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-900">
            Demo mode — transactions run on a simulated ledger. No external funds move and results are not blockchain-final.
          </div>
        )}
        <header className="flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 lg:px-8">
          <button className="rounded p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
            ☰
          </button>
          <div className="hidden text-sm text-slate-500 lg:block">{me ? `Tenant ${me.tenantId}` : ""}</div>
          <div className="flex items-center gap-3">
            {authMode === "demo" ? (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <span className="hidden sm:inline">Acting as</span>
                <select value={demoUser} onChange={(e) => setDemoUser(e.target.value)} className="rounded-lg border-0 py-1 pl-2 pr-8 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-600">
                  {DEMO_USERS.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label} ({u.role})
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              me && (
                <div className="flex items-center gap-3 text-sm text-slate-700">
                  <span>{me.displayName}</span>
                  <button className="text-indigo-700 hover:underline" onClick={signOut}>
                    Sign out
                  </button>
                </div>
              )
            )}
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
          {!ready ? (
            <p className="text-sm text-slate-500">Connecting to MAW…</p>
          ) : !me ? (
            <Notice tone="error">{error ?? "Unable to authenticate with the MAW API."}</Notice>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
