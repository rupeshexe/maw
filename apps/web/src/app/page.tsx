"use client";

import Link from "next/link";
import { Card, DataTable, EmptyState, PageHeader, ProgressBar, Stat, StatusChip, formatDate, formatMoney, titleCase } from "@maw/ui";
import { LoadState } from "@/components/common";
import { useApi } from "@/lib/use-api";
import type { AuditRow, WalletRow } from "@/lib/types";

interface Overview {
  mode: string;
  wallets: number;
  balances: Record<string, { available: number; reserved: number }>;
  paymentsByStatus: Record<string, number>;
  settledThisMonth: number;
  pendingApprovals: number;
  activeSubscriptions: number;
  escrow: { count: number; amount: number };
  recentAudit: AuditRow[];
  recentPayments: { id: string; status: string; amount: number; asset: string; destination: string; kind: string; createdAt: string }[];
}

interface SpendProgress {
  progress: { key: string; label: string; limit: number; used: number; currency: string }[];
  policies: { id: string; name: string }[];
}

export default function OverviewPage() {
  const overview = useApi<Overview>("/v1/overview");
  const wallets = useApi<WalletRow[]>("/v1/wallets");
  const firstWallet = wallets.data?.[0];
  const spend = useApi<SpendProgress>(firstWallet ? `/v1/wallets/${firstWallet.id}/spend-progress` : null);

  return (
    <>
      <PageHeader title="Overview" description="Agent spending, approvals and settlement activity at a glance." />
      <LoadState loading={overview.loading} error={overview.error} hasData={Boolean(overview.data)}>
        {overview.data && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <Stat label="Agent wallets" value={overview.data.wallets} />
              <Stat label="Settled this month" value={formatMoney(overview.data.settledThisMonth)} hint={overview.data.mode === "demo" ? "Demo ledger" : "Provider settled"} />
              <Stat label="Pending approvals" value={overview.data.pendingApprovals} />
              <Stat label="Active subscriptions" value={overview.data.activeSubscriptions} />
              <Stat label="Funds in escrow" value={formatMoney(overview.data.escrow.amount)} hint={`${overview.data.escrow.count} open`} />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card title="Balances" className="lg:col-span-1">
                {Object.keys(overview.data.balances).length === 0 ? (
                  <EmptyState title="No balances yet" description="Create a wallet and fund it to see balances here." />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {Object.entries(overview.data.balances).map(([asset, b]) => (
                      <li key={asset} className="flex items-center justify-between py-2 text-sm">
                        <span className="font-medium">{asset}</span>
                        <span className="tabular-nums text-slate-700">
                          {formatMoney(b.available)} <span className="text-xs text-slate-500">({formatMoney(b.reserved)} reserved)</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title={firstWallet ? `Spend limits — ${firstWallet.name}` : "Spend limits"} className="lg:col-span-2" action={firstWallet ? <Link href={`/wallets/${firstWallet.id}`} className="text-sm">View wallet</Link> : undefined}>
                {spend.data && spend.data.progress.length > 0 ? (
                  <div className="space-y-4">
                    {spend.data.progress
                      .filter((p) => p.used > 0 || p.limit > 0)
                      .slice(0, 6)
                      .map((p) => (
                        <ProgressBar key={p.key} label={p.label} used={p.used} limit={p.limit} detail={`${formatMoney(p.used)} / ${formatMoney(p.limit)} ${p.currency}`} />
                      ))}
                  </div>
                ) : (
                  <EmptyState title="No spend limits to show" description="Assign a spending policy to a wallet to track usage against its caps." />
                )}
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="Recent payments" action={<Link href="/payments" className="text-sm">All payments</Link>}>
                <DataTable
                  rows={overview.data.recentPayments}
                  rowKey={(r) => r.id}
                  emptyTitle="No payments yet"
                  emptyDescription="Payments requested by agents and users appear here."
                  columns={[
                    { key: "d", header: "Destination", render: (r) => <Link href={`/payments/${r.id}`}>{r.destination}</Link> },
                    { key: "a", header: "Amount", align: "right", render: (r) => formatMoney(r.amount, r.asset) },
                    { key: "s", header: "Status", render: (r) => <StatusChip status={r.status} /> }
                  ]}
                />
              </Card>
              <Card title="Recent activity" action={<Link href="/audit" className="text-sm">Audit log</Link>}>
                {overview.data.recentAudit.length === 0 ? (
                  <EmptyState title="No activity yet" />
                ) : (
                  <ul className="space-y-3">
                    {overview.data.recentAudit.map((e) => (
                      <li key={e.id} className="flex items-start justify-between gap-3 text-sm">
                        <div>
                          <p className="font-medium text-slate-800">{titleCase(e.eventType)}</p>
                          <p className="text-xs text-slate-500">{formatDate(e.createdAt)}</p>
                        </div>
                        <StatusChip status={e.outcome} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        )}
      </LoadState>
    </>
  );
}
