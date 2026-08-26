import { useEffect } from "react";
import { api } from "@/api/client";
import type { ActivityEvent } from "@/data/types";
import { useResource, type Resource } from "./useResource";

/** Cadência de re-sondagem — casa com ACTIVITY_CACHE_TTL_MS do backend (10s). */
const POLL_MS = 10_000;

/**
 * Feed real de entradas/bloqueios via `lendas_steamfilter` (leia
 * server/README.md). Substitui o antigo feed simulado — não existe mais
 * geração de eventos falsos aqui, só a leitura do estado real do plugin.
 */
export function useRealActivity(): Resource<ActivityEvent[]> {
  const resource = useResource<ActivityEvent[]>(() => api.activity(), []);

  useEffect(() => {
    const timer = window.setInterval(() => resource.reload(), POLL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return resource;
}
