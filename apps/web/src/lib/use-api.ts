"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./auth";

export function useApi<T>(path: string | null) {
  const { request, me, ready } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path || !ready || !me) return;
    let cancelled = false;
    setLoading(true);
    request<T>(path)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setData(null);
          setError(e instanceof Error ? e.message : "Request failed");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, request, me, ready, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

export const newIdempotencyKey = (prefix: string): string => `${prefix}-${crypto.randomUUID()}`;
