"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, DataTable, Dialog, Field, Input, Notice, PageHeader, StatusChip, formatMoney } from "@maw/ui";
import { ActionButton, LoadState, RowActions, useAction, useCurrentRoles } from "@/components/common";
import { useApi } from "@/lib/use-api";
import type { BillingRow } from "@/lib/types";

export default function BillingPage() {
  const records = useApi<BillingRow[]>("/v1/billing/records");
  const [open, setOpen] = useState(false);
  const [linking, setLinking] = useState<BillingRow | null>(null);
  const roles = useCurrentRoles();
  const action = useAction();
  const canEdit = roles.has("MAW.Admin", "MAW.WalletOperator");

  async function reconcile() {
    await action.run("/v1/billing/reconcile", { method: "POST" });
    records.reload();
  }

  return (
    <>
      <PageHeader
        title="Azure Billing"
        description="Conventional Azure charge metadata associated with provider or demo-ledger settlement references. This is reconciliation metadata; Azure invoices are not themselves settled on-chain by MAW."
        actions={
          canEdit && (
            <>
              <Button variant="secondary" onClick={reconcile} disabled={action.pending}>
                Reconcile
              </Button>
              <Button onClick={() => setOpen(true)}>Record charge</Button>
            </>
          )
        }
      />
      {action.error && <Notice tone="error">{action.error}</Notice>}
      <LoadState loading={records.loading} error={records.error} hasData={Boolean(records.data)}>
        <DataTable
          rows={records.data ?? []}
          rowKey={(r) => r.id}
          emptyTitle="No billing records"
          emptyDescription="Record an Azure charge, or attach azureContext to a payment, to see charge and settlement side by side."
          columns={[
            { key: "i", header: "Invoice", render: (r) => <span className="font-medium">{r.invoiceReference}</span> },
            { key: "s", header: "Azure subscription", render: (r) => <code className="text-xs">{r.azureSubscriptionId}</code> },
            { key: "c", header: "Cost category", render: (r) => r.costCategory },
            { key: "a", header: "Charge", align: "right", render: (r) => formatMoney(r.chargeAmount, r.chargeCurrency) },
            { key: "st", header: "Settlement", render: (r) => (r.settlement ? <span>{formatMoney(r.settlement.settlementAmount, r.settlement.asset)} · {r.settlement.demo ? "demo ledger" : (r.settlement.externalReference ?? r.settlement.network)}</span> : "-") },
            { key: "p", header: "Payment", render: (r) => (r.settlement ? <Link href={`/payments/${r.settlement.paymentIntentId}`}>View</Link> : "-") },
            { key: "r", header: "Receipt", render: (r) => (r.settlement?.receiptId ? <Link href={`/receipts/${r.settlement.receiptId}`}>View</Link> : "-") },
            { key: "x", header: "Status", render: (r) => <StatusChip status={r.status} /> },
            { key: "l", header: "", render: (r) => (canEdit && r.status !== "matched" ? <RowActions><ActionButton label="Link payment" onClick={() => setLinking(r)} /></RowActions> : null) }
          ]}
        />
      </LoadState>
      <RecordDialog open={open} onClose={() => setOpen(false)} onDone={() => records.reload()} />
      <LinkDialog record={linking} onClose={() => setLinking(null)} onDone={() => records.reload()} />
    </>
  );
}

function RecordDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [azureSubscriptionId, setSub] = useState("");
  const [resourceId, setResource] = useState("");
  const [costCategory, setCategory] = useState("compute");
  const [invoiceReference, setInvoice] = useState("");
  const [amount, setAmount] = useState("");
  const action = useAction();
  async function submit() {
    const result = await action.run("/v1/billing/records", {
      method: "POST",
      body: { azureSubscriptionId, resourceId: resourceId || undefined, costCategory, invoiceReference, chargeAmount: Number(amount), chargeCurrency: "USD" }
    });
    if (result) {
      onDone();
      onClose();
    }
  }
  return (
    <Dialog open={open} title="Record Azure charge" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Azure subscription ID">
          <Input value={azureSubscriptionId} onChange={(e) => setSub(e.target.value)} />
        </Field>
        <Field label="Resource ID (optional)">
          <Input value={resourceId} onChange={(e) => setResource(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Cost category">
            <Input value={costCategory} onChange={(e) => setCategory(e.target.value)} />
          </Field>
          <Field label="Charge (USD)">
            <Input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
        </div>
        <Field label="Invoice reference">
          <Input value={invoiceReference} onChange={(e) => setInvoice(e.target.value)} />
        </Field>
        {action.error && <Notice tone="error">{action.error}</Notice>}
        <div className="flex justify-end">
          <Button onClick={submit} disabled={!azureSubscriptionId || !invoiceReference || Number(amount) <= 0 || action.pending}>
            Record charge
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function LinkDialog({ record, onClose, onDone }: { record: BillingRow | null; onClose: () => void; onDone: () => void }) {
  const [paymentId, setPaymentId] = useState("");
  const action = useAction();
  async function submit() {
    if (!record) return;
    const result = await action.run(`/v1/billing/records/${record.id}/link`, { method: "POST", body: { paymentIntentId: paymentId } });
    if (result) {
      onDone();
      onClose();
      setPaymentId("");
    }
  }
  return (
    <Dialog open={record !== null} title={`Link ${record?.invoiceReference ?? ""}`} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Payment ID">
          <Input value={paymentId} onChange={(e) => setPaymentId(e.target.value)} />
        </Field>
        {action.error && <Notice tone="error">{action.error}</Notice>}
        <div className="flex justify-end">
          <Button onClick={submit} disabled={!paymentId || action.pending}>
            Link payment
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
