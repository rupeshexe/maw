import type { ReactNode } from "react";
import { cx } from "./format";
import { EmptyState } from "./primitives";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  align?: "left" | "right";
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  emptyTitle = "Nothing here yet",
  emptyDescription
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (rows.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cx("px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500", c.align === "right" ? "text-right" : "text-left", c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cx(onRowClick && "cursor-pointer hover:bg-indigo-50/40")}
            >
              {columns.map((c) => (
                <td key={c.key} className={cx("px-4 py-2.5 text-slate-800", c.align === "right" && "text-right tabular-nums", c.className)}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DefinitionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{item.label}</dt>
          <dd className="mt-0.5 break-all text-sm text-slate-900">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string; count?: number }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={cx("rounded-md px-3 py-1 text-sm font-medium", active === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 text-xs text-slate-500">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
