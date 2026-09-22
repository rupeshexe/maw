"use client";

import { useEffect, useState } from "react";
import { Button, Dialog, Field, Input, Notice, Select, StatusChip } from "@maw/ui";
import { useApi, newIdempotencyKey } from "@/lib/use-api";
import type { DestinationRow, PaymentPreview, PaymentRow, WalletRow } from "@/lib/types";
import { ReasonList, useAction } from "./common";

export function NewPaymentDialog({ open, onClose, onDone, walletId }: { open: boolean; onClose: () => void; onDone: () => void; walletId?: string }) {
  const wallets = useApi<WalletRow[]>(open ? "/v1/wallets" : null);
  const destinations = useApi<DestinationRow[]>(open ? "/v1/destinations" : null);
  const [wallet, setWallet] = useState(walletId ?? "");
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [purpose, setPurpose] = useState("");
  const [preview, setPreview] = useState<PaymentPreview | null>(null);
  const [result, setResult] = useState<PaymentRow | null>(null);
  const [key, setKey] = useState(() => newIdempotencyKey("ui-pay"));
  const action = useAction();

  useEffect(() => {
    if (open) {
      setKey(newIdempotencyKey("ui-pay"));
      setPreview(null);
      setResult(null);
    }
  }, [open]);

  useEffect(() => {
    if (!wallet && wallets.data?.length) setWallet(walletId ?? wallets.data[0].id);
  }, [wallets.data, wallet, walletId]);

  const body = () => ({ walletId: wallet, destinationId: destination, amount: Number(amount), category: category || undefined, purpose: purpose || undefined });
  const valid = wallet && destination && Number(amount) > 0;

  async function runPreview() {
    setResult(null);
    setPreview(await action.run<PaymentPreview>("/v1/policy-evaluations/preview", { method: "POST", body: body() }));
  }

  async function submit() {
    setPreview(null);
    const created = await action.run<PaymentRow>("/v1/payment-intents", { method: "POST", body: body(), idempotencyKey: key });
    if (created) {
      setResult(created);
      onDone();
    }
  }

  return (
    <Dialog open={open} title="Request a payment" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Wallet">
          <Select value={wallet} onChange={(e) => setWallet(e.target.value)} disabled={Boolean(walletId)}>
            {(wallets.data ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.defaultAsset})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Destination" hint="Only managed destinations can be paid.">
          <Select value={destination} onChange={(e) => setDestination(e.target.value)}>
            <option value="">Select a destination</option>
            {(destinations.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.label} — {d.status.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount">
            <Input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Category">
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="cloud" />
          </Field>
        </div>
        <Field label="Purpose">
          <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Monthly hosting invoice" />
        </Field>
        {action.error && <Notice tone="error">{action.error}</Notice>}
        {preview && (
          <Notice tone={preview.decision === "allow" ? "success" : preview.decision === "deny" ? "error" : "warning"}>
            <p className="mb-2 font-medium">{preview.summary}</p>
            <ReasonList reasons={preview.reasons} />
          </Notice>
        )}
        {result && (
          <Notice tone={result.status === "denied" || result.status === "failed" ? "error" : result.status === "approval_required" ? "warning" : "success"}>
            <div className="mb-2 flex items-center gap-2">
              <StatusChip status={result.status} />
              <span className="font-medium">{result.summary}</span>
            </div>
            <ReasonList reasons={result.reasons} />
          </Notice>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={runPreview} disabled={!valid || action.pending}>
            Check policy
          </Button>
          <Button onClick={submit} disabled={!valid || action.pending || Boolean(result)}>
            Submit payment
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
