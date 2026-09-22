import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cx, titleCase } from "./format";

const CHIP_TONES: Record<string, string> = {
  settled: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  allow: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  funded: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  released: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  matched: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  pass: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  denied: "bg-rose-50 text-rose-700 ring-rose-600/20",
  deny: "bg-rose-50 text-rose-700 ring-rose-600/20",
  failed: "bg-rose-50 text-rose-700 ring-rose-600/20",
  failure: "bg-rose-50 text-rose-700 ring-rose-600/20",
  rejected: "bg-rose-50 text-rose-700 ring-rose-600/20",
  blocked: "bg-rose-50 text-rose-700 ring-rose-600/20",
  disputed: "bg-rose-50 text-rose-700 ring-rose-600/20",
  amount_mismatch: "bg-rose-50 text-rose-700 ring-rose-600/20",
  approval_required: "bg-amber-50 text-amber-800 ring-amber-600/20",
  pending: "bg-amber-50 text-amber-800 ring-amber-600/20",
  pending_verification: "bg-amber-50 text-amber-800 ring-amber-600/20",
  funding_pending: "bg-amber-50 text-amber-800 ring-amber-600/20",
  release_pending: "bg-amber-50 text-amber-800 ring-amber-600/20",
  paused: "bg-amber-50 text-amber-800 ring-amber-600/20",
  suspended: "bg-amber-50 text-amber-800 ring-amber-600/20",
  unmatched: "bg-amber-50 text-amber-800 ring-amber-600/20",
  denied_pending: "bg-amber-50 text-amber-800 ring-amber-600/20",
  executing: "bg-blue-50 text-blue-700 ring-blue-600/20",
  submitted: "bg-blue-50 text-blue-700 ring-blue-600/20",
  linked: "bg-blue-50 text-blue-700 ring-blue-600/20",
  open: "bg-blue-50 text-blue-700 ring-blue-600/20",
  draft: "bg-slate-100 text-slate-700 ring-slate-500/20",
  cancelled: "bg-slate-100 text-slate-700 ring-slate-500/20",
  refunded: "bg-slate-100 text-slate-700 ring-slate-500/20",
  expired: "bg-slate-100 text-slate-700 ring-slate-500/20",
  retired: "bg-slate-100 text-slate-700 ring-slate-500/20",
  completed: "bg-slate-100 text-slate-700 ring-slate-500/20"
};

export function StatusChip({ status, label }: { status: string; label?: string }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", CHIP_TONES[status] ?? "bg-indigo-50 text-indigo-700 ring-indigo-600/20")}>
      {label ?? titleCase(status)}
    </span>
  );
}

export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function ProgressBar({ used, limit, label, detail }: { used: number; limit: number; label: string; detail?: string }) {
  const ratio = limit > 0 ? Math.min(used / limit, 1) : 0;
  const tone = ratio >= 1 ? "bg-rose-500" : ratio >= 0.8 ? "bg-amber-500" : "bg-indigo-600";
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-slate-800">{label}</span>
        <span className="text-xs tabular-nums text-slate-600">{detail ?? `${used.toLocaleString()} / ${limit.toLocaleString()}`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used} aria-label={label}>
        <div className={cx("h-full rounded-full transition-all", tone)} style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center">
      <div className="mb-3 h-10 w-10 rounded-full bg-indigo-100" aria-hidden />
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-slate-600">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export function Button({ variant = "primary", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const tones: Record<ButtonVariant, string> = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:outline-indigo-600",
    secondary: "bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:outline-slate-500",
    danger: "bg-rose-600 text-white hover:bg-rose-700 focus-visible:outline-rose-600",
    ghost: "text-slate-700 hover:bg-slate-100 focus-visible:outline-slate-500"
  };
  return <button {...props} className={cx("inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50", tones[variant], className)} />;
}

const fieldClass = "block w-full rounded-lg border-0 px-3 py-1.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} className={cx(fieldClass, props.className)} />;
export const Select = (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} className={cx(fieldClass, props.className)} />;
export const Textarea = (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} className={cx(fieldClass, "font-mono", props.className)} />;

export function Dialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-10" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-xl rounded-xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
            ✕
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warning" | "error" | "success"; children: ReactNode }) {
  const tones = {
    info: "border-blue-200 bg-blue-50 text-blue-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-rose-200 bg-rose-50 text-rose-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900"
  };
  return <div className={cx("rounded-lg border px-4 py-3 text-sm", tones[tone])}>{children}</div>;
}

export function JsonBlock({ value }: { value: unknown }) {
  return <pre className="max-h-96 overflow-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">{JSON.stringify(value, null, 2)}</pre>;
}
