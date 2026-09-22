"use client";

import { useState } from "react";
import { DataTable, Field, Input, PageHeader, Select, StatusChip, formatDate, shortId, titleCase } from "@maw/ui";
import { LoadState } from "@/components/common";
import { useApi } from "@/lib/use-api";
import type { AuditRow } from "@/lib/types";

const RESOURCES = ["", "payment_intent", "wallet", "policy", "approval", "destination", "supplier", "receipt", "subscription", "escrow", "conversion", "billing_record", "principal"];

export default function AuditPage() {
  const [resourceType, setResourceType] = useState("");
  const [eventType, setEventType] = useState("");
  const query = new URLSearchParams({ limit: "200" });
  if (resourceType) query.set("resourceType", resourceType);
  if (eventType) query.set("eventType", eventType);
  const events = useApi<AuditRow[]>(`/v1/audit-events?${query.toString()}`);

  return (
    <>
      <PageHeader title="Audit Log" description="Append-only record of identity sync, policy changes, decisions, approvals, settlements and integration changes." />
      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Resource type">
          <Select value={resourceType} onChange={(e) => setResourceType(e.target.value)}>
            {RESOURCES.map((r) => (
              <option key={r} value={r}>
                {r ? titleCase(r) : "All resources"}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Exact event type">
          <Input value={eventType} onChange={(e) => setEventType(e.target.value)} placeholder="payment.settled" />
        </Field>
      </div>
      <LoadState loading={events.loading} error={events.error} hasData={Boolean(events.data)}>
        <DataTable
          rows={events.data ?? []}
          rowKey={(e) => e.id}
          emptyTitle="No audit events match"
          columns={[
            { key: "t", header: "Time", render: (e) => formatDate(e.createdAt) },
            { key: "e", header: "Event", render: (e) => <span className="font-medium">{titleCase(e.eventType)}</span> },
            { key: "r", header: "Resource", render: (e) => `${titleCase(e.resourceType)} ${shortId(e.resourceId)}` },
            { key: "a", header: "Actor", render: (e) => (e.actorPrincipalId ? shortId(e.actorPrincipalId) : "System") },
            { key: "d", header: "Details", render: (e) => <code className="block max-w-xs truncate text-xs text-slate-600">{e.detailsJson ? JSON.stringify(e.detailsJson) : ""}</code> },
            { key: "o", header: "Outcome", render: (e) => <StatusChip status={e.outcome} /> }
          ]}
        />
      </LoadState>
    </>
  );
}
