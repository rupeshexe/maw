"use client";

import { useEffect, useState } from "react";
import { Button, DataTable, Dialog, Field, Input, Notice, PageHeader, Select, StatusChip, formatDate, formatMoney, titleCase } from "@maw/ui";
import { ActionButton, LoadState, RowActions, useAction } from "@/components/common";
import { newIdempotencyKey, useApi } from "@/lib/use-api";
import type { DestinationRow, EscrowRow, WalletRow } from "@/lib/types";

const conditionText = (c: EscrowRow["releaseConditionJson"]) => {
  if (c.type === "time") return `At ${formatDate(c.releaseAt)}`;
  if (c.type === "external_reference") return `External ref ${c.reference}`;
  return titleCase(c.type);
};

export default function EscrowPage() {
  const escrows = useApi<EscrowRow[]>("/v1/escrows");
  const [open, setOpen] = useState(false);
  const action = useAction();
  const [message, setMessage] = useState<string | null>(null);

  async function act(id: string, path: string, body?: unknown) {
    setMessage(null);
    const result = await action.run(`/v1/escrows/${id}/${path}`, { method: "POST", body });
    if (result) setMessage(`Escrow ${path.replace(/_/g, " ")} completed.`);
    escrows.reload();
  }

  async function checkEligibility(id: string) {
    setMessage(null);
    const result = await action.run<{ eligible: boolean; reason: string | null }>(`/v1/escrows/${id}/eligibility`, { method: "GET" });
    if (result) setMessage(result.eligible ? "This escrow is eligible for release." : `Not eligible: ${result.reason}`);
  }

  return (
    <>
      <PageHeader
        title="Escrow"
        description="Funds held between agents or with suppliers until a structured release condition is met. Release conditions are data, never executable code."
        actions={<Button onClick={() => setOpen(true)}>Create escrow</Button>}
      />
      {action.error && <Notice tone="error">{action.error}</Notice>}
      {message && <Notice tone="info">{message}</Notice>}
      <div className="mt-4">
        <LoadState loading={escrows.loading} error={escrows.error} hasData={Boolean(escrows.data)}>
          <DataTable
            rows={escrows.data ?? []}
            rowKey={(e) => e.id}
            emptyTitle="No escrows"
            emptyDescription="Fund an escrow to hold payment until delivery is confirmed."
            columns={[
              { key: "b", header: "Beneficiary", render: (e) => <span className="font-medium">{e.beneficiary.label}</span> },
              { key: "w", header: "Payer wallet", render: (e) => e.payerWallet.name },
              { key: "a", header: "Amount", align: "right", render: (e) => formatMoney(e.amount, e.asset) },
              { key: "c", header: "Release condition", render: (e) => conditionText(e.releaseConditionJson) },
              { key: "x", header: "Expires", render: (e) => (e.expiresAt ? formatDate(e.expiresAt) : "-") },
              { key: "s", header: "State", render: (e) => <StatusChip status={e.state} /> },
              {
                key: "act",
                header: "",
                render: (e) =>
                  e.state === "funded" ? (
                    <RowActions>
                      <ActionButton label="Eligible?" variant="ghost" onClick={() => checkEligibility(e.id)} />
                      {e.releaseConditionJson.type === "external_reference" && !e.externalComplete && <ActionButton label="Mark complete" onClick={() => act(e.id, "signals", { signal: "external_complete" })} />}
                      {e.releaseConditionJson.type === "counterparty_ack" && !e.counterpartyAcknowledged && <ActionButton label="Record ack" onClick={() => act(e.id, "signals", { signal: "counterparty_ack" })} />}
                      <ActionButton label="Release" variant="primary" onClick={() => act(e.id, "release")} />
                      <ActionButton label="Dispute" onClick={() => act(e.id, "dispute")} />
                      <ActionButton label="Refund" variant="danger" onClick={() => act(e.id, "refund")} />
                    </RowActions>
                  ) : e.state === "disputed" || e.state === "funding_pending" ? (
                    <RowActions>
                      <ActionButton label="Refund" variant="danger" onClick={() => act(e.id, "refund")} />
                    </RowActions>
                  ) : null
              }
            ]}
          />
        </LoadState>
      </div>
      <EscrowDialog open={open} onClose={() => setOpen(false)} onDone={() => escrows.reload()} />
    </>
  );
}

function EscrowDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const wallets = useApi<WalletRow[]>(open ? "/v1/wallets" : null);
  const destinations = useApi<DestinationRow[]>(open ? "/v1/destinations" : null);
  const [walletId, setWalletId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("manual");
  const [releaseAt, setReleaseAt] = useState("");
  const [reference, setReference] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [key, setKey] = useState(() => newIdempotencyKey("ui-escrow"));
  const action = useAction();

  useEffect(() => {
    if (open) {
      setKey(newIdempotencyKey("ui-escrow"));
      setResult(null);
    }
  }, [open]);

  async function submit() {
    const releaseCondition = type === "time" ? { type, releaseAt: new Date(releaseAt).toISOString() } : type === "external_reference" ? { type, reference } : { type };
    const response = await action.run<{ escrow: { state: string } | null; payment: { summary: string } | null }>("/v1/escrows", {
      method: "POST",
      body: { payerWalletId: walletId || wallets.data?.[0]?.id, beneficiaryDestinationId: destinationId, amount: Number(amount), releaseCondition },
      idempotencyKey: key
    });
    if (response) {
      setResult(response.escrow ? `Escrow ${response.escrow.state.replace(/_/g, " ")}.` : (response.payment?.summary ?? "Escrow was not created."));
      onDone();
    }
  }

  return (
    <Dialog open={open} title="Create escrow" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Payer wallet">
          <Select value={walletId || wallets.data?.[0]?.id || ""} onChange={(e) => setWalletId(e.target.value)}>
            {(wallets.data ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Beneficiary destination">
          <Select value={destinationId} onChange={(e) => setDestinationId(e.target.value)}>
            <option value="">Select a destination</option>
            {(destinations.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount">
            <Input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Release condition">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="manual">Manual release</option>
              <option value="time">Time-based</option>
              <option value="external_reference">External reference</option>
              <option value="counterparty_ack">Counterparty acknowledgment</option>
            </Select>
          </Field>
        </div>
        {type === "time" && (
          <Field label="Release at">
            <Input type="datetime-local" value={releaseAt} onChange={(e) => setReleaseAt(e.target.value)} />
          </Field>
        )}
        {type === "external_reference" && (
          <Field label="External reference">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
        )}
        {action.error && <Notice tone="error">{action.error}</Notice>}
        {result && <Notice tone="info">{result}</Notice>}
        <div className="flex justify-end">
          <Button onClick={submit} disabled={!destinationId || Number(amount) <= 0 || action.pending || Boolean(result)}>
            Fund escrow
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
