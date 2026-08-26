import { useCallback, useEffect, useRef, useState } from "react";

export type ResourceStatus = "loading" | "success" | "error";

export interface Resource<T> {
  data: T | null;
  status: ResourceStatus;
  error: Error | null;
  /** True while refetching with data already on screen. */
  refreshing: boolean;
  reload: () => void;
}

/**
 * Minimal async resource exposing the four states the UI must always be able
 * to render: loading, success, empty (decided by the caller) and error.
 */
export function useResource<T>(loader: () => Promise<T>, deps: unknown[]): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<ResourceStatus>("loading");
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");

    loaderRef
      .current()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
        setStatus("success");
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause : new Error(String(cause)));
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return {
    data,
    status,
    error,
    refreshing: status === "loading" && data !== null,
    reload,
  };
}
