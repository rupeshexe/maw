"use client";

import { useState } from "react";
import { Button, DataTable, Dialog, Field, Input, Notice, PageHeader, Select, StatusChip, Tabs, titleCase } from "@maw/ui";
import { ActionButton, LoadState, RowActions, useAction, useCurrentRoles } from "@/components/common";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import type { DestinationRow, SupplierRow } from "@/lib/types";

export default function DestinationsPage() {
  const [tab, setTab] = useState("destinations");
  const suppliers = useApi<SupplierRow[]>("/v1/suppliers");
  const destinations = useApi<DestinationRow[]>("/v1/destinations");
  const [dialog, setDialog] = useState<"supplier" | "destination" | null>(null);
  const roles = useCurrentRoles();
  const action = useAction();
  const canCreate = roles.has("MAW.Admin", "MAW.WalletOperator");
  const canApprove = roles.has("MAW.Admin", "MAW.PolicyAdmin");

  async function setStatus(kind: "suppliers" | "destinations", id: string, status: "active" | "blocked") {
    await action.run(`/v1/${kind}/${id}/status`, { method: "POST", body: { status } });
    suppliers.reload();
    destinations.reload();
  }

  return (
    <>
      <PageHeader
        title="Suppliers & Destinations"
        description="Only managed, verified destinations can receive funds. Agents cannot introduce new destinations on their own."
        actions={canCreate && <Button onClick={() => setDialog(tab === "suppliers" ? "supplier" : "destination")}>{tab === "suppliers" ? "Add supplier" : "Add destination"}</Button>}
      />
      {action.error && <Notice tone="error">{action.error}</Notice>}
      <Tabs
        tabs={[
          { id: "destinations", label: "Destinations", count: destinations.data?.length },
          { id: "suppliers", label: "Suppliers", count: suppliers.data?.length }
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === "destinations" ? (
        <LoadState loading={destinations.loading} error={destinations.error} hasData={Boolean(destinations.data)}>
          <DataTable
            rows={destinations.data ?? []}
            rowKey={(d) => d.id}
            emptyTitle="No destinations"
            emptyDescription="Add a blockchain address, supplier account or internal wallet, then verify it."
            columns={[
              { key: "l", header: "Label", render: (d) => <span className="font-medium">{d.label}</span> },
              { key: "t", header: "Type", render: (d) => titleCase(d.type) },
              { key: "a", header: "Address / reference", render: (d) => <code className="text-xs">{d.addressOrReference}</code> },
              { key: "n", header: "Network", render: (d) => d.network },
              { key: "s", header: "Supplier", render: (d) => d.supplier?.name ?? "-" },
              { key: "st", header: "Verification", render: (d) => <StatusChip status={d.status} /> },
              {
                key: "x",
                header: "",
                render: (d) =>
                  canApprove ? (
                    <RowActions>
                      {d.status !== "active" && <ActionButton label="Approve" variant="primary" onClick={() => setStatus("destinations", d.id, "active")} />}
                      {d.status !== "blocked" && <ActionButton label="Block" variant="danger" onClick={() => setStatus("destinations", d.id, "blocked")} />}
                    </RowActions>
                  ) : null
              }
            ]}
          />
        </LoadState>
      ) : (
        <LoadState loading={suppliers.loading} error={suppliers.error} hasData={Boolean(suppliers.data)}>
          <DataTable
            rows={suppliers.data ?? []}
            rowKey={(s) => s.id}
            emptyTitle="No suppliers"
            emptyDescription="Suppliers group destinations so policies can cap spend by supplier or supplier group."
            columns={[
              { key: "n", header: "Supplier", render: (s) => <span className="font-medium">{s.name}</span> },
              { key: "c", header: "Category", render: (s) => s.category },
              { key: "g", header: "Group", render: (s) => s.supplierGroup },
              { key: "r", header: "Reference", render: (s) => s.externalReference ?? "-" },
              { key: "d", header: "Destinations", align: "right", render: (s) => s.destinations.length },
              { key: "s", header: "Status", render: (s) => <StatusChip status={s.status} /> },
              {
                key: "x",
                header: "",
                render: (s) =>
                  canApprove ? (
                    <RowActions>
                      <ActionButton label={s.status === "active" ? "Block" : "Reactivate"} variant={s.status === "active" ? "danger" : "secondary"} onClick={() => setStatus("suppliers", s.id, s.status === "active" ? "blocked" : "active")} />
                    </RowActions>
                  ) : null
              }
            ]}
          />
        </LoadState>
      )}
      <SupplierDialog open={dialog === "supplier"} onClose={() => setDialog(null)} onDone={() => suppliers.reload()} />
      <DestinationDialog open={dialog === "destination"} suppliers={suppliers.data ?? []} onClose={() => setDialog(null)} onDone={() => destinations.reload()} />
    </>
  );
}

function SupplierDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("cloud");
  const [group, setGroup] = useState("approved");
  const action = useAction();
  async function submit() {
    const result = await action.run("/v1/suppliers", { method: "POST", body: { name, category, supplierGroup: group } });
    if (result) {
      onDone();
      onClose();
      setName("");
    }
  }
  return (
    <Dialog open={open} title="Add supplier" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Category">
            <Input value={category} onChange={(e) => setCategory(e.target.value)} />
          </Field>
          <Field label="Supplier group">
            <Input value={group} onChange={(e) => setGroup(e.target.value)} />
          </Field>
        </div>
        {action.error && <Notice tone="error">{action.error}</Notice>}
        <div className="flex justify-end">
          <Button onClick={submit} disabled={!name || action.pending}>
            Add supplier
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function DestinationDialog({ open, suppliers, onClose, onDone }: { open: boolean; suppliers: SupplierRow[]; onClose: () => void; onDone: () => void }) {
  const { runtime } = useAuth();
  const [label, setLabel] = useState("");
  const [type, setType] = useState("blockchain_address");
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState("polygon");
  const [supplierId, setSupplierId] = useState("");
  const action = useAction();
  const networks = Array.from(new Set((runtime?.providers ?? []).flatMap((p) => p.assets.flatMap((a) => a.networks))));
  async function submit() {
    const result = await action.run("/v1/destinations", { method: "POST", body: { label, type, addressOrReference: address, network, supplierId: supplierId || undefined } });
    if (result) {
      onDone();
      onClose();
      setLabel("");
      setAddress("");
    }
  }
  return (
    <Dialog open={open} title="Add destination" onClose={onClose}>
      <div className="space-y-4">
        <Notice tone="info">New destinations start unverified. A policy administrator must approve them before funds can be sent.</Notice>
        <Field label="Label">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {["blockchain_address", "supplier", "internal_wallet", "bank_recipient"].map((t) => (
                <option key={t} value={t}>
                  {titleCase(t)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Network">
            <Select value={network} onChange={(e) => setNetwork(e.target.value)}>
              {(networks.length ? networks : ["polygon"]).map((n) => (
                <option key={n}>{n}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Address or reference">
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label="Supplier">
          <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">None</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        {action.error && <Notice tone="error">{action.error}</Notice>}
        <div className="flex justify-end">
          <Button onClick={submit} disabled={!label || !address || action.pending}>
            Add destination
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
