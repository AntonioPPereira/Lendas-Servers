import { api } from "@/api/client";
import type { ActivityEvent } from "@/data/types";
import { createSharedResource, useSharedResource } from "./sharedResource";
import type { Resource } from "./useResource";

/** Cadência de re-sondagem — casa com ACTIVITY_CACHE_TTL_MS do backend (10s). */
const POLL_MS = 10_000;

/**
 * Compartilhado: a Visão geral e a página de Atividade mostram o mesmo feed,
 * e cada sondagem abre uma conexão SFTP de verdade no servidor de jogo — não
 * dá pra duplicar isso por componente. Ver createSharedResource.
 */
const activityResource = createSharedResource<ActivityEvent[]>(() => api.activity(), POLL_MS);

/**
 * Feed real de entradas/bloqueios via `lendas_steamfilter` (leia
 * server/README.md). Substitui o antigo feed simulado — não existe mais
 * geração de eventos falsos aqui, só a leitura do estado real do plugin.
 */
export function useRealActivity(): Resource<ActivityEvent[]> {
  return useSharedResource(activityResource);
}
