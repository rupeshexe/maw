"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Button, Card, DefinitionList, Input, Notice, PageHeader, StatusChip, formatDate, formatMoney, titleCase } from "@maw/ui";
import { LoadState, ReasonList, useAction, useCurrentRoles } from "@/components/common";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import type { AuditRow, PaymentRow } from "@/lib/types";

export default function PaymentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const payment = useApi<PaymentRow>(`/v1/payment-intents/${id}`);
  const roles = useCurrentRoles();
  const { me } = useAuth();
  const canSeeAudit = roles.has("MAW.Admin", "MAW.Auditor");
  const audit = useApi<AuditRow[]>(canSeeAudit ? `/v1/audit-events?resourceType=payment_intent&resourceId=${id}` : null);
  const [reason, setReason] = useState("");
  const action = useAction();
  const p = payment.data;

  async function decide(kind: "approve" | "reject") {
    await action.run(`/v1/payment-intents/${id}/${kind}`, { method: "POST", body: { reason: reason || undefined } });
    payment.reload();
    audit.reload();
  }

  async function cancel() {
    await action.run(`/v1/payment-intents/${id}/cancel`, { method: "POST" });
    payment.reload();
  }

  const canDecide = roles.has("MAW.Approver", "MAW.Admin") && p?.status === "approval_required" && p.initiatedBy.id !== me?.principalId;

  return (
    <LoadState loading={payment.loading} error={payment.error} hasData={Boolean(p)}>
      {p && (
        <>
          <PageHeader
            title={`${formatMoney(p.amount, p.asset)} to ${p.destination.label}`}
            description={p.summary}
            actions={
              <>
                <StatusChip status={p.status} />
                {p.demo && <StatusChip status="draft" label="Demo ledger" />}
                {["approval_required", "approved"].includes(p.status) && (roles.has("MAW.Admin", "MAW.WalletOperator") || p.initiatedBy.id === me?.principalId) && (
                  <Button variant="secondary" onClick={cancel}>
                    Cancel payment
                  </Button>
                )}
              </>
            }
          />
          {action.error && <Notice tone="error">{action.error}</Notice>}

          {p.status === "approval_required" && (
            <div className="mb-6">
              <Notice tone="warning">
                <p className="mb-3 font-medium">This payment is waiting for approval.</p>
                {canDecide ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input placeholder="Decision reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} className="max-w-sm" />
                    <Button onClick={() => decide("approve")} disabled={action.pending}>
                      Approve
                    </Button>
                    <Button variant="danger" onClick={() => decide("reject")} disabled={action.pending}>
                      Reject
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm">An approver other than the initiator must decide. Initiators cannot approve their own payments.</p>
                )}
              </Notice>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Policy decision">
              <div className="mb-3 flex items-center gap-2">
                {p.policyDecision && <StatusChip status={p.policyDecision.decision} />}
                <span className="text-xs text-slate-500">Policy version {p.policyDecision?.policyVersion ?? "-"}</span>
              </div>
              <ReasonList reasons={p.reasons} />
              {p.matchedRules.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Rules evaluated</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {p.matchedRules.map((r, i) => (
                      <li key={i}>
                        <StatusChip status={r.outcome} label={titleCase(r.type)} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
            <Card title="Payment details">
              <DefinitionList
                items={[
                  { label: "Payment ID", value: p.id },
                  { label: "Kind", value: titleCase(p.kind) },
                  { label: "Asset / network", value: `${p.asset} on ${p.network}` },
                  { label: "Category", value: p.category ?? "-" },
                  { label: "Purpose", value: p.purpose ?? "-" },
                  { label: "Initiated by", value: `${p.initiatedBy.displayName} (${p.initiatedBy.principalType})` },
                  { label: "Destination", value: p.destination.addressOrReference },
                  { label: "Requested", value: formatDate(p.createdAt) },
                  { label: "External reference", value: p.externalReference ?? "-" },
                  { label: "Approval", value: p.approval ? `${titleCase(p.approval.status)}${p.approval.decisionReason ? ` — ${p.approval.decisionReason}` : ""}` : "Not required" },
                  { label: "Receipt", value: p.receiptId ? <Link href={`/receipts/${p.receiptId}`}>{p.receiptId}</Link> : "-" },
                  { label: "Failure reason", value: p.failureReason ?? "-" }
                ]}
              />
            </Card>
          </div>

          {canSeeAudit && (
            <Card title="Audit trail" className="mt-6">
              {audit.data && audit.data.length > 0 ? (
                <ol className="space-y-3">
                  {[...audit.data].reverse().map((e) => (
                    <li key={e.id} className="flex items-start justify-between gap-3 text-sm">
                      <div>
                        <p className="font-medium text-slate-800">{titleCase(e.eventType)}</p>
                        <p className="text-xs text-slate-500">{formatDate(e.createdAt)}</p>
                      </div>
                      <StatusChip status={e.outcome} />
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-slate-500">No audit events recorded.</p>
              )}
            </Card>
          )}
        </>
      )}
    </LoadState>
  );
}
