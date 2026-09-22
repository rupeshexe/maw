export const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(" ");

export const formatMoney = (value: number | string | null | undefined, asset?: string): string => {
  const n = Number(value ?? 0);
  const text = n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  return asset ? `${text} ${asset}` : text;
};

export const formatDate = (value: string | Date | null | undefined): string => {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
};

export const titleCase = (value: string): string => value.replace(/[_.]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const shortId = (value: string | null | undefined): string => (value ? (value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value) : "-");
