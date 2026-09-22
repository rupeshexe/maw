"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, DataTable, Dialog, Field, Input, Notice, PageHeader, Select, StatusChip, formatDate, formatMoney } from "@maw/ui";
import { LoadState, useAction, useCurrentRoles } from "@/components/common";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import type { PrincipalRow, WalletRow } from "@/lib/types";

export default function WalletsPage() {
  const router = useRouter();
  const wallets = useApi<WalletRow[]>("/v1/wallets");
  const [open, setOpen] = useState(false);
  const roles = useCurrentRoles();

  return (
    <>
      <PageHeader
        title="Agent Wallets"
        description="Wallets assigned to agents, service identities and users. Every payment from a wallet is evaluated against its policies."
        actions={roles.has("MAW.Admin", "MAW.WalletOperator") && <Button onClick={() => setOpen(true)}>Create wallet</Button>}
      />
      <LoadState loading={wallets.loading} error={wallets.error} hasData={Boolean(wallets.data)}>
        <DataTable
          rows={wallets.data ?? []}
          rowKey={(w) => w.id}
          onRowClick={(w) => router.push(`/wallets/${w.id}`)}
          emptyTitle="No wallets yet"
          emptyDescription="Create a wallet for an agent, then assign a spending policy to it."
          columns={[
            { key: "n", header: "Wallet", render: (w) => <span className="font-medium">{w.name}</span> },
            { key: "o", header: "Principal", render: (w) => `${w.principal.displayName} (${w.principal.principalType})` },
            { key: "p", header: "Provider", render: (w) => `${w.provider} · ${w.network}` },
            { key: "b", header: "Available", align: "right", render: (w) => formatMoney(w.balances.find((b) => b.asset === w.defaultAsset)?.available ?? 0, w.defaultAsset) },
            { key: "pol", header: "Policies", render: (w) => w.assignments.filter((a) => !a.effectiveTo).map((a) => a.policy.name).join(", ") || <span className="text-amber-700">None assigned</span> },
            { key: "s", header: "Status", render: (w) => <StatusChip status={w.status} /> },
            { key: "c", header: "Created", render: (w) => formatDate(w.createdAt) }
          ]}
        />
      </LoadState>
      <CreateWalletDialog open={open} onClose={() => setOpen(false)} onDone={() => wallets.reload()} />
    </>
  );
}

function CreateWalletDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { runtime } = useAuth();
  const principals = useApi<PrincipalRow[]>(open ? "/v1/principals" : null);
  const [name, setName] = useState("");
  const [principalId, setPrincipalId] = useState("");
  const [provider, setProvider] = useState("");
  const [asset, setAsset] = useState("USDC");
  const [network, setNetwork] = useState("polygon");
  const action = useAction();
  const providers = runtime?.providers ?? [];
  const selected = providers.find((p) => p.provider === (provider || providers[0]?.provider));
  const assetOptions = selected?.assets ?? [];
  const networkOptions = assetOptions.find((a) => a.asset === asset)?.networks ?? [];

  async function submit() {
    const created = await action.run("/v1/wallets", {
      method: "POST",
      body: { name, principalId, defaultAsset: asset, network, provider: selected?.provider ?? provider }
    });
    if (created) {
      onDone();
      onClose();
      setName("");
    }
  }

  return (
    <Dialog open={open} title="Create agent wallet" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Procurement agent wallet" />
        </Field>
        <Field label="Principal" hint="The agent, service identity or user that owns this wallet.">
          <Select value={principalId} onChange={(e) => setPrincipalId(e.target.value)}>
            <option value="">Select a principal</option>
            {(principals.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName} ({p.principalType})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Payment provider">
          <Select value={selected?.provider ?? ""} onChange={(e) => setProvider(e.target.value)}>
            {providers.map((p) => (
              <option key={p.provider} value={p.provider}>
                {p.provider}
                {p.demo ? " (demo)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Default asset">
            <Select value={asset} onChange={(e) => setAsset(e.target.value)}>
              {assetOptions.map((a) => (
                <option key={a.asset}>{a.asset}</option>
              ))}
            </Select>
          </Field>
          <Field label="Network">
            <Select value={network} onChange={(e) => setNetwork(e.target.value)}>
              {networkOptions.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </Select>
          </Field>
        </div>
        {action.error && <Notice tone="error">{action.error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name || !principalId || action.pending}>
            Create wallet
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
