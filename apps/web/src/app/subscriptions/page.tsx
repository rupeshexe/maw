"use client";

import { useState } from "react";
import { Button, DataTable, Dialog, Field, Input, Notice, PageHeader, Select, StatusChip, formatDate, formatMoney, titleCase } from "@maw/ui";
import { ActionButton, LoadState, ReasonList, RowActions, useAction } from "@/components/common";
import type { Reason } from "@/components/common";
import { useApi } from "@/lib/use-api";
import type { DestinationRow, SubscriptionRow, WalletRow } from "@/lib/types";

export default function SubscriptionsPage() {
  const subscriptions = useApi<SubscriptionRow[]>("/v1/subscriptions");
  const [open, setOpen] = useState(false);
  const action = useAction();

  async function setStatus(id: string, status: string) {
    await action.run(`/v1/subscriptions/${id}/status`, { method: "POST", body: { status } });
    subscriptions.reload();
  }

  return (
    <>
      <PageHeader
        title="Subscriptions"
        description="Recurring payments initiated by authorized agents. Every execution is re-evaluated against the current policy."
        actions={<Button onClick={() => setOpen(true)}>New subscription</Button>}
      />
      {action.error && <Notice tone="error">{action.error}</Notice>}
      <LoadState loading={subscriptions.loading} error={subscriptions.error} hasData={Boolean(subscriptions.data)}>
        <DataTable
          rows={subscriptions.data ?? []}
          rowKey={(s) => s.id}
          emptyTitle="No subscriptions"
          emptyDescription="Create a recurring payment to a verified destination. It will never bypass policy."
          columns={[
            { key: "d", header: "Destination", render: (s) => <span className="font-medium">{s.destination.label}</span> },
            { key: "w", header: "Wallet", render: (s) => s.wallet.name },
            { key: "a", header: "Amount", align: "right", render: (s) => formatMoney(s.amount, s.asset) },
            { key: "c", header: "Cadence", render: (s) => titleCase(s.cadence) },
            { key: "n", header: "Next run", render: (s) => (s.status === "active" ? formatDate(s.nextExecutionAt) : "-") },
            { key: "e", header: "Runs", align: "right", render: (s) => `${s.executionCount}${s.maxExecutions ? ` / ${s.maxExecutions}` : ""}` },
            { key: "l", header: "Last result", render: (s) => (s.lastResultJson?.status ? <StatusChip status={s.lastResultJson.status} /> : s.lastResultJson?.error ? <StatusChip status="failed" /> : "-") },
            { key: "s", header: "Status", render: (s) => <StatusChip status={s.status} /> },
            {
              key: "x",
              header: "",
              render: (s) =>
                s.status === "active" || s.status === "paused" ? (
                  <RowActions>
                    <ActionButton label={s.status === "active" ? "Pause" : "Resume"} onClick={() => setStatus(s.id, s.status === "active" ? "paused" : "active")} />
                    <ActionButton label="Cancel" variant="danger" onClick={() => setStatus(s.id, "cancelled")} />
                  </RowActions>
                ) : null
            }
          ]}
        />
      </LoadState>
      <SubscriptionDialog open={open} onClose={() => setOpen(false)} onDone={() => subscriptions.reload()} />
    </>
  );
}

function SubscriptionDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const wallets = useApi<WalletRow[]>(open ? "/v1/wallets" : null);
  const destinations = useApi<DestinationRow[]>(open ? "/v1/destinations" : null);
  const [walletId, setWalletId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState("monthly");
  const [category, setCategory] = useState("");
  const [preview, setPreview] = useState<{ decision: string; summary: string; reasons: Reason[] } | null>(null);
  const action = useAction();

  async function submit() {
    const result = await action.run<{ policyPreview: { decision: string; summary: string; reasons: Reason[] } }>("/v1/subscriptions", {
      method: "POST",
      body: { walletId: walletId || wallets.data?.[0]?.id, destinationId, amount: Number(amount), cadence, category: category || undefined }
    });
    if (result) {
      setPreview(result.policyPreview);
      onDone();
    }
  }

  return (
    <Dialog open={open} title="Create subscription" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Wallet">
          <Select value={walletId || wallets.data?.[0]?.id || ""} onChange={(e) => setWalletId(e.target.value)}>
            {(wallets.data ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Destination">
          <Select value={destinationId} onChange={(e) => setDestinationId(e.target.value)}>
            <option value="">Select a destination</option>
            {(destinations.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Amount">
            <Input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Cadence">
            <Select value={cadence} onChange={(e) => setCadence(e.target.value)}>
              {["daily", "weekly", "monthly"].map((c) => (
                <option key={c} value={c}>
                  {titleCase(c)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category">
            <Input value={category} onChange={(e) => setCategory(e.target.value)} />
          </Field>
        </div>
        {action.error && <Notice tone="error">{action.error}</Notice>}
        {preview && (
          <Notice tone={preview.decision === "allow" ? "success" : "warning"}>
            <p className="mb-2 font-medium">Subscription created. Current policy outlook: {preview.summary}</p>
            <ReasonList reasons={preview.reasons} />
          </Notice>
        )}
        <div className="flex justify-end">
          <Button onClick={submit} disabled={!destinationId || Number(amount) <= 0 || action.pending}>
            Create subscription
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
