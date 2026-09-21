export type ErrorCode =
  | "validation_error"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "idempotency_mismatch"
  | "policy_denied"
  | "invalid_state"
  | "insufficient_funds"
  | "provider_unsupported"
  | "provider_error"
  | "misconfigured";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  validation_error: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  idempotency_mismatch: 422,
  policy_denied: 403,
  invalid_state: 409,
  insufficient_funds: 402,
  provider_unsupported: 422,
  provider_error: 502,
  misconfigured: 503
};

export class MawError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "MawError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, details: this.details ?? null } };
  }
}

export const isMawError = (value: unknown): value is MawError => value instanceof MawError;
