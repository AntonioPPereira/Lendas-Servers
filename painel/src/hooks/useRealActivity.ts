import { api } from "@/api/client";
import type { ActivityEvent } from "@/data/types";
import { STALE } from "@/lib/queryClient";
import { useResource, type Resource } from "./useResource";

/** Cadência de re-sondagem — casa com ACTIVITY_CACHE_TTL_MS do backend (10s). */
const POLL_MS = 10_000;

/** Mesma chave na Visão geral e na página de Atividade: é o mesmo feed, e
 *  cada busca abre uma conexão SFTP de verdade no servidor de jogo. */
export const ACTIVITY_KEY = ["activity"] as const;

/**
 * Feed real de entradas/bloqueios via `lendas_steamfilter` (leia
 * server/README.md). Substitui o antigo feed simulado — não existe mais
 * geração de eventos falsos aqui, só a leitura do estado real do plugin.
 */
export function useRealActivity(): Resource<ActivityEvent[]> {
  return useResource<ActivityEvent[]>(ACTIVITY_KEY, () => api.activity(), {
    staleTime: STALE.activity,
    refetchInterval: POLL_MS,
  });
}
