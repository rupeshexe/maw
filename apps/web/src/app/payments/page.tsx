"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, DataTable, PageHeader, StatusChip, Tabs, formatDate, formatMoney, titleCase } from "@maw/ui";
import { LoadState } from "@/components/common";
import { NewPaymentDialog } from "@/components/new-payment";
import { useApi } from "@/lib/use-api";
import type { PaymentRow } from "@/lib/types";

const FILTERS = [
  { id: "", label: "All" },
  { id: "approval_required", label: "Needs approval" },
  { id: "settled", label: "Settled" },
  { id: "denied", label: "Denied" },
  { id: "failed", label: "Failed" }
];

export default function PaymentsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const payments = useApi<PaymentRow[]>(`/v1/payment-intents?limit=200${filter ? `&status=${filter}` : ""}`);
  const [open, setOpen] = useState(false);

  return (
    <>
      <PageHeader
        title="Payments"
        description="Every payment request with its policy decision, approval state and settlement."
        actions={<Button onClick={() => setOpen(true)}>New payment</Button>}
      />
      <Tabs tabs={FILTERS} active={filter} onChange={setFilter} />
      <LoadState loading={payments.loading} error={payments.error} hasData={Boolean(payments.data)}>
        <DataTable
          rows={payments.data ?? []}
          rowKey={(p) => p.id}
          onRowClick={(p) => router.push(`/payments/${p.id}`)}
          emptyTitle="No payments match"
          emptyDescription="Payments requested by agents and users appear here with their policy explanation."
          columns={[
            { key: "d", header: "Destination", render: (p) => <span className="font-medium">{p.destination.label}</span> },
            { key: "k", header: "Type", render: (p) => titleCase(p.kind) },
            { key: "a", header: "Amount", align: "right", render: (p) => formatMoney(p.amount, p.asset) },
            { key: "c", header: "Category", render: (p) => p.category ?? "-" },
            { key: "i", header: "Initiated by", render: (p) => p.initiatedBy.displayName },
            { key: "s", header: "Status", render: (p) => <StatusChip status={p.status} /> },
            { key: "t", header: "Requested", render: (p) => formatDate(p.createdAt) }
          ]}
        />
      </LoadState>
      <NewPaymentDialog open={open} onClose={() => setOpen(false)} onDone={() => payments.reload()} />
    </>
  );
}
