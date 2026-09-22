"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Button, Card, DefinitionList, JsonBlock, Notice, PageHeader, StatusChip, formatDate } from "@maw/ui";
import { LoadState, useAction } from "@/components/common";
import { useApi } from "@/lib/use-api";

interface Receipt {
  id: string;
  payloadJson: { amount: string; asset: string; network: string; provider: string; demo: boolean; settledAt: string; destinationReference: string; policyVersion: string; externalReference: string | null };
  payloadHash: string;
  signature: string;
  keyId: string;
  algorithm: string;
  createdAt: string;
  paymentIntentId: string;
}

interface Verification {
  valid: boolean;
  hashMatches: boolean;
  signatureValid: boolean;
  reason: string | null;
}

export default function ReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const receipt = useApi<Receipt>(`/v1/receipts/${id}`);
  const [verification, setVerification] = useState<Verification | null>(null);
  const action = useAction();
  const r = receipt.data;

  async function verify() {
    setVerification(await action.run<Verification>(`/v1/receipts/${id}/verify`, { method: "GET" }));
  }

  function download() {
    if (!r) return;
    const blob = new Blob([JSON.stringify({ payload: r.payloadJson, payloadHash: r.payloadHash, signature: r.signature, keyId: r.keyId, algorithm: r.algorithm }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `maw-receipt-${r.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <LoadState loading={receipt.loading} error={receipt.error} hasData={Boolean(r)}>
      {r && (
        <>
          <PageHeader
            title={`Receipt ${r.id}`}
            description={`${r.payloadJson.amount} ${r.payloadJson.asset} on ${r.payloadJson.network} via ${r.payloadJson.provider}`}
            actions={
              <>
                {r.payloadJson.demo && <StatusChip status="draft" label="Demo ledger" />}
                <Button variant="secondary" onClick={download}>
                  Download JSON
                </Button>
                <Button onClick={verify} disabled={action.pending}>
                  Verify signature
                </Button>
              </>
            }
          />
          {action.error && <Notice tone="error">{action.error}</Notice>}
          {verification && (
            <div className="mb-6">
              <Notice tone={verification.valid ? "success" : "error"}>
                {verification.valid ? "Signature and payload hash verified." : `Verification failed: ${verification.reason}`}
              </Notice>
            </div>
          )}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Summary">
              <DefinitionList
                items={[
                  { label: "Issued", value: formatDate(r.createdAt) },
                  { label: "Settled", value: formatDate(r.payloadJson.settledAt) },
                  { label: "Destination", value: r.payloadJson.destinationReference },
                  { label: "External reference", value: r.payloadJson.externalReference ?? "-" },
                  { label: "Policy version", value: r.payloadJson.policyVersion },
                  { label: "Payment", value: <Link href={`/payments/${r.paymentIntentId}`}>{r.paymentIntentId}</Link> },
                  { label: "Algorithm", value: r.algorithm },
                  { label: "Key ID", value: r.keyId }
                ]}
              />
            </Card>
            <Card title="Integrity">
              <DefinitionList
                items={[
                  { label: "Payload hash (SHA-256)", value: <code className="text-xs">{r.payloadHash}</code> },
                  { label: "Signature", value: <code className="text-xs">{r.signature}</code> }
                ]}
              />
            </Card>
          </div>
          <Card title="Canonical payload" className="mt-6">
            <JsonBlock value={r.payloadJson} />
          </Card>
        </>
      )}
    </LoadState>
  );
}
