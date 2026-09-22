"use client";

import Link from "next/link";
import { useState } from "react";
import { DataTable, Notice, PageHeader, StatusChip, Tabs, formatDate, formatMoney } from "@maw/ui";
import { ActionButton, LoadState, RowActions, useAction, useCurrentRoles } from "@/components/common";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import type { ApprovalRow } from "@/lib/types";

export default function ApprovalsPage() {
  const [tab, setTab] = useState("pending");
  const approvals = useApi<ApprovalRow[]>(`/v1/approvals${tab === "all" ? "" : `?status=${tab}`}`);
  const roles = useCurrentRoles();
  const { me } = useAuth();
  const action = useAction();

  async function decide(paymentId: string, kind: "approve" | "reject") {
    await action.run(`/v1/payment-intents/${paymentId}/${kind}`, { method: "POST", body: {} });
    approvals.reload();
  }

  return (
    <>
      <PageHeader title="Approvals" description="Payments that exceeded an approval threshold. Separation of duties applies: an initiator cannot approve their own request." />
      {action.error && <Notice tone="error">{action.error}</Notice>}
      <Tabs
        tabs={[
          { id: "pending", label: "Pending" },
          { id: "approved", label: "Approved" },
          { id: "rejected", label: "Rejected" },
          { id: "all", label: "All" }
        ]}
        active={tab}
        onChange={setTab}
      />
      <LoadState loading={approvals.loading} error={approvals.error} hasData={Boolean(approvals.data)}>
        <DataTable
          rows={approvals.data ?? []}
          rowKey={(a) => a.id}
          emptyTitle="No approvals in this view"
          emptyDescription="When a payment needs a human decision it will be queued here."
          columns={[
            { key: "p", header: "Payment", render: (a) => <Link href={`/payments/${a.payment.id}`}>{a.payment.destination.label}</Link> },
            { key: "a", header: "Amount", align: "right", render: (a) => formatMoney(a.payment.amount, a.payment.asset) },
            { key: "i", header: "Initiated by", render: (a) => a.payment.initiatedBy.displayName },
            { key: "r", header: "Requested", render: (a) => formatDate(a.requestedAt) },
            { key: "s", header: "Status", render: (a) => <StatusChip status={a.status} /> },
            {
              key: "x",
              header: "",
              render: (a) =>
                a.status === "pending" && roles.has("MAW.Approver", "MAW.Admin") ? (
                  <RowActions>
                    <ActionButton label="Approve" variant="primary" disabled={a.payment.initiatedBy.id === me?.principalId} onClick={() => decide(a.payment.id, "approve")} />
                    <ActionButton label="Reject" variant="danger" disabled={a.payment.initiatedBy.id === me?.principalId} onClick={() => decide(a.payment.id, "reject")} />
                  </RowActions>
                ) : null
            }
          ]}
        />
      </LoadState>
    </>
  );
}
