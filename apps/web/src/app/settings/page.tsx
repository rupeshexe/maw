"use client";

import { Card, DataTable, DefinitionList, Notice, PageHeader, StatusChip } from "@maw/ui";
import { LoadState } from "@/components/common";
import { useApi } from "@/lib/use-api";

interface Integrations {
  mode: string;
  identity: { mode: string; entraTenantConfigured: boolean; entraClientConfigured: boolean };
  receiptSigning: { keyId: string; algorithm: string; publicKeyPem: string | null };
  keyVault: { configured: boolean };
  providers: { id: string; reachable: boolean; capabilities: { demo: boolean; supportsConversion: boolean; supportsCancel: boolean; supportsWebhooks: boolean; custody: boolean; assets: { asset: string; networks: string[] }[] } | null }[];
  scheduler: { intervalSeconds: number };
}

const yes = (v: boolean) => <StatusChip status={v ? "active" : "draft"} label={v ? "Yes" : "No"} />;

export default function SettingsPage() {
  const info = useApi<Integrations>("/v1/integrations");

  return (
    <>
      <PageHeader title="Settings & Integrations" description="Read-only view of how this deployment authenticates users, signs receipts and reaches payment providers. Secrets are never displayed." />
      <LoadState loading={info.loading} error={info.error} hasData={Boolean(info.data)}>
        {info.data && (
          <div className="space-y-6">
            {info.data.mode === "demo" ? (
              <Notice tone="warning">Demo mode is active. Transfers use the deterministic demo ledger and never reach an external payment rail.</Notice>
            ) : (
              <Notice tone="info">Live mode is active. Transfers are submitted to configured providers only.</Notice>
            )}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="Identity">
                <DefinitionList
                  items={[
                    { label: "Authentication", value: info.data.identity.mode === "entra" ? "Microsoft Entra ID" : "Demo identities" },
                    { label: "Entra tenant configured", value: yes(info.data.identity.entraTenantConfigured) },
                    { label: "Entra application configured", value: yes(info.data.identity.entraClientConfigured) }
                  ]}
                />
              </Card>
              <Card title="Receipt signing">
                <DefinitionList
                  items={[
                    { label: "Algorithm", value: info.data.receiptSigning.algorithm },
                    { label: "Key ID", value: info.data.receiptSigning.keyId },
                    { label: "Azure Key Vault", value: yes(info.data.keyVault.configured) },
                    { label: "Scheduler interval", value: `${info.data.scheduler.intervalSeconds}s` }
                  ]}
                />
                {info.data.receiptSigning.publicKeyPem && <pre className="mt-4 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{info.data.receiptSigning.publicKeyPem}</pre>}
              </Card>
            </div>
            <Card title="Payment providers">
              <DataTable
                rows={info.data.providers}
                rowKey={(p) => p.id}
                emptyTitle="No providers configured"
                columns={[
                  { key: "p", header: "Provider", render: (p) => <span className="font-medium">{p.id}</span> },
                  { key: "r", header: "Reachable", render: (p) => yes(p.reachable) },
                  { key: "d", header: "Mode", render: (p) => (p.capabilities?.demo ? <StatusChip status="draft" label="Demo" /> : <StatusChip status="settled" label="Live" />) },
                  { key: "c", header: "Conversion", render: (p) => yes(Boolean(p.capabilities?.supportsConversion)) },
                  { key: "w", header: "Webhooks", render: (p) => yes(Boolean(p.capabilities?.supportsWebhooks)) },
                  { key: "a", header: "Assets", render: (p) => p.capabilities?.assets.map((a) => `${a.asset} (${a.networks.join(", ")})`).join("; ") ?? "-" }
                ]}
              />
            </Card>
          </div>
        )}
      </LoadState>
    </>
  );
}
