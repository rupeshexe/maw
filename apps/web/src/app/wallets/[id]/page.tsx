"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Button, Card, DataTable, DefinitionList, Dialog, Field, Input, Notice, PageHeader, ProgressBar, Select, StatusChip, formatDate, formatMoney } from "@maw/ui";
import { LoadState, useAction, useCurrentRoles } from "@/components/common";
import { NewPaymentDialog } from "@/components/new-payment";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import type { PaymentRow, WalletRow } from "@/lib/types";

interface SpendProgress {
  progress: { key: string; label: string; period: string; limit: number; used: number; currency: string }[];
}

interface Quote {
  id: string;
  fromAsset: string;
  toAsset: string;
  sourceAmount: number;
  targetAmount: number;
  feeAmount: number;
  rate: number;
  expiresAt: string;
  demo: boolean;
}

export default function WalletDetailPage() {
  const { id } = useParams<{ id: string }>();
  const wallet = useApi<WalletRow>(`/v1/wallets/${id}`);
  const spend = useApi<SpendProgress>(`/v1/wallets/${id}/spend-progress`);
  const payments = useApi<PaymentRow[]>(`/v1/payment-intents?walletId=${id}&limit=20`);
  const [pay, setPay] = useState(false);
  const [fund, setFund] = useState(false);
  const [convert, setConvert] = useState(false);
  const action = useAction();
  const roles = useCurrentRoles();
  const { runtime } = useAuth();
  const w = wallet.data;
  const isDemo = runtime?.providers.find((p) => p.provider === w?.provider)?.demo ?? false;

  async function toggle() {
    if (!w) return;
    await action.run(`/v1/wallets/${id}/status`, { method: "POST", body: { status: w.status === "active" ? "suspended" : "active" } });
    wallet.reload();
  }

  return (
    <LoadState loading={wallet.loading} error={wallet.error} hasData={Boolean(w)}>
      {w && (
        <>
          <PageHeader
            title={w.name}
            description={`${w.provider} · ${w.defaultAsset} on ${w.network}`}
            actions={
              <>
                <StatusChip status={w.status} />
                <Button variant="secondary" onClick={() => setConvert(true)}>
                  Convert
                </Button>
                {roles.has("MAW.Admin", "MAW.WalletOperator") && isDemo && (
                  <Button variant="secondary" onClick={() => setFund(true)}>
                    Add demo funds
                  </Button>
                )}
                {roles.has("MAW.Admin", "MAW.WalletOperator") && (
                  <Button variant="secondary" onClick={toggle}>
                    {w.status === "active" ? "Suspend" : "Reactivate"}
                  </Button>
                )}
                <Button onClick={() => setPay(true)}>New payment</Button>
              </>
            }
          />
          {action.error && <Notice tone="error">{action.error}</Notice>}
          <div className="mt-4 grid gap-6 lg:grid-cols-3">
            <Card title="Details" className="lg:col-span-2">
              <DefinitionList
                items={[
                  { label: "Principal", value: `${w.principal.displayName} (${w.principal.principalType})` },
                  { label: "Provider account", value: w.providerAccountRef ?? "-" },
                  { label: "Created", value: formatDate(w.createdAt) },
                  { label: "Policies", value: w.assignments.filter((a) => !a.effectiveTo).map((a) => `${a.policy.name} v${a.policy.version}`).join(", ") || "None assigned" }
                ]}
              />
            </Card>
            <Card title="Balances">
              <ul className="divide-y divide-slate-100 text-sm">
                {w.balances.length === 0 && <li className="py-2 text-slate-500">No balances</li>}
                {w.balances.map((b) => (
                  <li key={b.asset} className="flex justify-between py-2">
                    <span className="font-medium">{b.asset}</span>
                    <span className="tabular-nums">
                      {formatMoney(b.available)} <span className="text-xs text-slate-500">+ {formatMoney(b.reserved)} reserved</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card title="Spend against policy">
              {spend.data && spend.data.progress.length > 0 ? (
                <div className="space-y-4">
                  {spend.data.progress.map((p) => (
                    <ProgressBar key={p.key} label={p.label} used={p.used} limit={p.limit} detail={p.period === "transaction" ? `Cap ${formatMoney(p.limit)} ${p.currency}` : `${formatMoney(p.used)} / ${formatMoney(p.limit)} ${p.currency}`} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-600">No spending limits are configured for this wallet. Payments are denied until a policy is assigned.</p>
              )}
            </Card>
            <Card title="Recent payments" action={<Link href="/payments" className="text-sm">All payments</Link>}>
              <DataTable
                rows={payments.data ?? []}
                rowKey={(p) => p.id}
                emptyTitle="No payments from this wallet"
                columns={[
                  { key: "d", header: "Destination", render: (p) => <Link href={`/payments/${p.id}`}>{p.destination.label}</Link> },
                  { key: "a", header: "Amount", align: "right", render: (p) => formatMoney(p.amount, p.asset) },
                  { key: "s", header: "Status", render: (p) => <StatusChip status={p.status} /> }
                ]}
              />
            </Card>
          </div>
          <NewPaymentDialog open={pay} onClose={() => setPay(false)} walletId={id} onDone={() => { payments.reload(); spend.reload(); wallet.reload(); }} />
          <FundDialog open={fund} walletId={id} asset={w.defaultAsset} onClose={() => setFund(false)} onDone={() => wallet.reload()} />
          <ConvertDialog open={convert} walletId={id} balances={w.balances.map((b) => b.asset)} onClose={() => setConvert(false)} onDone={() => wallet.reload()} />
        </>
      )}
    </LoadState>
  );
}

function FundDialog({ open, walletId, asset, onClose, onDone }: { open: boolean; walletId: string; asset: string; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("1000");
  const action = useAction();
  async function submit() {
    const result = await action.run(`/v1/wallets/${walletId}/fund`, { method: "POST", body: { amount: Number(amount), asset } });
    if (result) {
      onDone();
      onClose();
    }
  }
  return (
    <Dialog open={open} title="Add demo funds" onClose={onClose}>
      <div className="space-y-4">
        <Notice tone="warning">These funds exist only on the demo ledger. No real assets are created or moved.</Notice>
        <Field label={`Amount (${asset})`}>
          <Input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        {action.error && <Notice tone="error">{action.error}</Notice>}
        <div className="flex justify-end">
          <Button onClick={submit} disabled={Number(amount) <= 0 || action.pending}>
            Add funds
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ConvertDialog({ open, walletId, balances, onClose, onDone }: { open: boolean; walletId: string; balances: string[]; onClose: () => void; onDone: () => void }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("USD");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const action = useAction();
  const source = from || balances[0] || "USDC";

  async function getQuote() {
    setDone(null);
    setQuote(await action.run<Quote>("/v1/conversions/quotes", { method: "POST", body: { walletId, fromAsset: source, toAsset: to, sourceAmount: Number(amount) } }));
  }

  async function execute() {
    if (!quote) return;
    const result = await action.run<{ status: string; demo: boolean }>(`/v1/conversions/${quote.id}/execute`, { method: "POST" });
    if (result) {
      setDone(`Conversion ${result.status}${result.demo ? " on the demo ledger" : ""}.`);
      setQuote(null);
      onDone();
    }
  }

  return (
    <Dialog open={open} title="Convert assets" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Field label="From">
            <Select value={source} onChange={(e) => setFrom(e.target.value)}>
              {(balances.length ? balances : ["USDC"]).map((a) => (
                <option key={a}>{a}</option>
              ))}
            </Select>
          </Field>
          <Field label="To">
            <Select value={to} onChange={(e) => setTo(e.target.value)}>
              {["USD", "EUR", "USDC", "USDT"].map((a) => (
                <option key={a}>{a}</option>
              ))}
            </Select>
          </Field>
          <Field label="Amount">
            <Input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
        </div>
        {quote && (
          <Notice tone="info">
            <p className="font-medium">
              {formatMoney(quote.sourceAmount, quote.fromAsset)} → {formatMoney(quote.targetAmount, quote.toAsset)}
            </p>
            <p className="mt-1 text-xs">
              Rate {quote.rate} · fee {formatMoney(quote.feeAmount, quote.fromAsset)} · expires {formatDate(quote.expiresAt)}
              {quote.demo ? " · demo rate" : ""}
            </p>
          </Notice>
        )}
        {done && <Notice tone="success">{done}</Notice>}
        {action.error && <Notice tone="error">{action.error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={getQuote} disabled={Number(amount) <= 0 || action.pending}>
            Get quote
          </Button>
          <Button onClick={execute} disabled={!quote || action.pending}>
            Execute conversion
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
