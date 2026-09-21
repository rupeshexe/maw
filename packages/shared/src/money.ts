const SCALE = 1e8;

export const roundAmount = (value: number): number => Math.round(value * SCALE) / SCALE;

export const addAmounts = (a: number, b: number): number => roundAmount(a + b);

export const subtractAmounts = (a: number, b: number): number => roundAmount(a - b);

export const isPositiveAmount = (value: number): boolean =>
  Number.isFinite(value) && value > 0 && roundAmount(value) === value;

export const formatAmount = (value: number, currency: string): string =>
  `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${currency}`;
