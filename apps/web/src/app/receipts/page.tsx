"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, DataTable, JsonBlock, Notice, PageHeader, StatusChip, Textarea, formatDate, formatMoney, shortId } from "@maw/ui";
import { LoadState, useAction } from "@/components/common";
import { useApi } from "@/lib/use-api";
import type { ReceiptRow } from "@/lib/types";

interface Verification {
  valid: boolean;
  hashMatches: boolean;
  signatureValid: boolean;
  reason: string | null;
}

export default function ReceiptsPage() {
  const router = useRouter();
  const receipts = useApi<ReceiptRow[]>("/v1/receipts");
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState<Verification | null>(null);
  const action = useAction();

  async function verify() {
    setResult(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      action.setError("Receipt JSON is not valid");
      return;
    }
    const body = parsed as { payload?: unknown; payloadJson?: unknown; payloadHash: string; signature: string; keyId: string; algorithm: string };
    const response = await action.run<Verification>("/v1/receipts/verify", {
      method: "POST",
      body: { payload: body.payload ?? body.payloadJson, payloadHash: body.payloadHash, signature: body.signature, keyId: body.keyId, algorithm: body.algorithm }
    });
    if (response) setResult(response);
  }

  return (
    <>
      <PageHeader title="Receipts" description="Signed, canonical records of every settled transaction. Anyone holding a receipt can verify it against MAW without exposing key material." />
      <LoadState loading={receipts.loading} error={receipts.error} hasData={Boolean(receipts.data)}>
        <DataTable
          rows={receipts.data ?? []}
          rowKey={(r) => r.id}
          onRowClick={(r) => router.push(`/receipts/${r.id}`)}
          emptyTitle="No receipts yet"
          emptyDescription="A signed receipt is issued for every settled payment."
          columns={[
            { key: "i", header: "Receipt", render: (r) => <code className="text-xs">{shortId(r.id)}</code> },
            { key: "a", header: "Amount", align: "right", render: (r) => formatMoney(r.transaction.amount, r.transaction.asset) },
            { key: "p", header: "Provider", render: (r) => `${r.transaction.provider} · ${r.transaction.network}` },
            { key: "d", header: "Ledger", render: (r) => (r.transaction.demo ? <StatusChip status="draft" label="Demo" /> : <StatusChip status="settled" label="Provider" />) },
            { key: "k", header: "Signing key", render: (r) => `${r.algorithm} · ${shortId(r.keyId)}` },
            { key: "t", header: "Issued", render: (r) => formatDate(r.createdAt) }
          ]}
        />
      </LoadState>
      <Card title="Verify a receipt" className="mt-6">
        <p className="mb-3 text-sm text-slate-600">Paste a receipt (payload, payloadHash, signature, keyId, algorithm) to check its integrity and signature.</p>
        <Textarea rows={6} value={raw} onChange={(e) => setRaw(e.target.value)} spellCheck={false} placeholder='{"payload": {...}, "payloadHash": "...", "signature": "...", "keyId": "...", "algorithm": "Ed25519"}' />
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={verify} disabled={!raw || action.pending}>
            Verify
          </Button>
          {result && <StatusChip status={result.valid ? "success" : "failure"} label={result.valid ? "Valid" : "Invalid"} />}
        </div>
        {action.error && (
          <div className="mt-3">
            <Notice tone="error">{action.error}</Notice>
          </div>
        )}
        {result && !result.valid && (
          <div className="mt-3">
            <JsonBlock value={result} />
          </div>
        )}
      </Card>
    </>
  );
}
