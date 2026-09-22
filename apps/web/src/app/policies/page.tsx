"use client";

import { useState } from "react";
import { Button, Card, Dialog, EmptyState, Field, Input, JsonBlock, Notice, PageHeader, Select, StatusChip, Textarea, formatDate } from "@maw/ui";
import { ActionButton, LoadState, useAction, useCurrentRoles } from "@/components/common";
import { POLICY_TEMPLATE, describeRule } from "@/lib/policy-text";
import { useApi } from "@/lib/use-api";
import type { PolicyRow, WalletRow } from "@/lib/types";

export default function PoliciesPage() {
  const policies = useApi<PolicyRow[]>("/v1/policies");
  const [editing, setEditing] = useState<PolicyRow | "new" | null>(null);
  const [assigning, setAssigning] = useState<PolicyRow | null>(null);
  const [showJson, setShowJson] = useState<string | null>(null);
  const roles = useCurrentRoles();
  const action = useAction();
  const canEdit = roles.has("MAW.Admin", "MAW.PolicyAdmin");

  async function retire(policy: PolicyRow) {
    await action.run(`/v1/policies/${policy.id}/status`, { method: "POST", body: { status: policy.status === "active" ? "retired" : "active" } });
    policies.reload();
  }

  async function unassign(assignmentId: string) {
    await action.run(`/v1/policy-assignments/${assignmentId}`, { method: "DELETE" });
    policies.reload();
  }

  return (
    <>
      <PageHeader
        title="Spending Policies"
        description="Deterministic JSON policies interpreted by the MAW policy engine. Policy changes are versioned and audited."
        actions={canEdit && <Button onClick={() => setEditing("new")}>Create policy</Button>}
      />
      {action.error && <Notice tone="error">{action.error}</Notice>}
      <LoadState loading={policies.loading} error={policies.error} hasData={Boolean(policies.data)}>
        {policies.data?.length === 0 ? (
          <EmptyState title="No policies yet" description="Create a policy to define spending limits, allowlists and approval thresholds." />
        ) : (
          <div className="space-y-4">
            {policies.data?.map((p) => (
              <Card
                key={p.id}
                title={
                  <span className="flex items-center gap-2">
                    {p.name} <span className="text-xs font-normal text-slate-500">v{p.version}</span> <StatusChip status={p.status} />
                  </span>
                }
                action={
                  <div className="flex gap-1.5">
                    <ActionButton label={showJson === p.id ? "Hide JSON" : "View JSON"} onClick={() => setShowJson(showJson === p.id ? null : p.id)} variant="ghost" />
                    {canEdit && <ActionButton label="Edit" onClick={() => setEditing(p)} />}
                    {canEdit && p.status === "active" && <ActionButton label="Assign" onClick={() => setAssigning(p)} />}
                    {canEdit && <ActionButton label={p.status === "active" ? "Retire" : "Activate"} onClick={() => retire(p)} variant={p.status === "active" ? "danger" : "secondary"} />}
                  </div>
                }
              >
                {p.description && <p className="mb-3 text-sm text-slate-600">{p.description}</p>}
                <ul className="list-inside list-disc space-y-1 text-sm text-slate-800">
                  {p.rulesJson.rules.map((r, i) => (
                    <li key={i}>{describeRule(r, p.rulesJson.currency)}</li>
                  ))}
                </ul>
                <div className="mt-4 border-t border-slate-100 pt-3 text-sm">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Assigned wallets · updated {formatDate(p.createdAt)}</p>
                  {p.assignments.filter((a) => !a.effectiveTo).length === 0 ? (
                    <p className="text-slate-500">Not assigned to any wallet</p>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {p.assignments
                        .filter((a) => !a.effectiveTo)
                        .map((a) => (
                          <li key={a.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700">
                            {a.wallet.name}
                            {canEdit && (
                              <button className="ml-1 text-slate-500 hover:text-rose-600" aria-label={`Unassign ${a.wallet.name}`} onClick={() => unassign(a.id)}>
                                ✕
                              </button>
                            )}
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
                {showJson === p.id && (
                  <div className="mt-4">
                    <JsonBlock value={p.rulesJson} />
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </LoadState>
      <PolicyEditor policy={editing} onClose={() => setEditing(null)} onDone={() => policies.reload()} />
      <AssignDialog policy={assigning} onClose={() => setAssigning(null)} onDone={() => policies.reload()} />
    </>
  );
}

function PolicyEditor({ policy, onClose, onDone }: { policy: PolicyRow | "new" | null; onClose: () => void; onDone: () => void }) {
  const existing = policy && policy !== "new" ? policy : null;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [json, setJson] = useState("");
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const action = useAction();
  const key = policy === null ? null : existing ? existing.id : "new";
  if (key !== loadedFor) {
    setLoadedFor(key);
    setName(existing?.name ?? "");
    setDescription(existing?.description ?? "");
    setJson(JSON.stringify(existing?.rulesJson ?? POLICY_TEMPLATE, null, 2));
  }

  async function submit() {
    let document: unknown;
    try {
      document = JSON.parse(json);
    } catch {
      action.setError("Policy document is not valid JSON");
      return;
    }
    const result = existing
      ? await action.run(`/v1/policies/${existing.id}`, { method: "PUT", body: { name, description, document } })
      : await action.run("/v1/policies", { method: "POST", body: { name, description, document } });
    if (result) {
      onDone();
      onClose();
    }
  }

  return (
    <Dialog open={policy !== null} title={existing ? `Edit ${existing.name}` : "Create spending policy"} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Description">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Policy document" hint="Rule types: max_per_transaction, max_per_day/week/month, category_limit, supplier_limit, asset_allowlist, network_allowlist, destination_allowlist, destination_denylist, supplier_allowlist, require_approval_above, business_hours_only, max_transactions_per_period, subscription_limit, escrow_limit.">
          <Textarea rows={14} value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} />
        </Field>
        {action.error && <Notice tone="error">{action.error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name || action.pending}>
            {existing ? "Save new version" : "Create policy"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function AssignDialog({ policy, onClose, onDone }: { policy: PolicyRow | null; onClose: () => void; onDone: () => void }) {
  const wallets = useApi<WalletRow[]>(policy ? "/v1/wallets" : null);
  const [walletId, setWalletId] = useState("");
  const action = useAction();

  async function submit() {
    if (!policy) return;
    const result = await action.run("/v1/policy-assignments", { method: "POST", body: { policyId: policy.id, walletId } });
    if (result) {
      onDone();
      onClose();
    }
  }

  return (
    <Dialog open={policy !== null} title={`Assign ${policy?.name ?? ""}`} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Wallet">
          <Select value={walletId} onChange={(e) => setWalletId(e.target.value)}>
            <option value="">Select a wallet</option>
            {(wallets.data ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>
        {action.error && <Notice tone="error">{action.error}</Notice>}
        <div className="flex justify-end">
          <Button onClick={submit} disabled={!walletId || action.pending}>
            Assign policy
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
