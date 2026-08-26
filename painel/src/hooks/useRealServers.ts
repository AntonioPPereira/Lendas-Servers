import { useEffect } from "react";
import { api } from "@/api/client";
import type { RealServer } from "@/data/types";
import { useResource, type Resource } from "./useResource";

/** Re-sondagem periódica: status de servidor muda a cada partida, não faz
 *  sentido carregar uma vez e nunca mais atualizar enquanto o app fica aberto. */
const POLL_MS = 15_000;

/** Servidores reais (via HLstatsX), com atualização periódica. Usado na
 *  barra do topo e na sidebar — os únicos lugares que mostram status de
 *  servidor fora da própria página de Servidores. */
export function useRealServers(): Resource<RealServer[]> {
  const resource = useResource<RealServer[]>(() => api.servers(), []);

  useEffect(() => {
    const timer = window.setInterval(() => resource.reload(), POLL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return resource;
}

/** `deriveServerId()` no backend (`server/src/lib/serverId.ts`) — "SERVIDOR 01"
 *  no nome de exibição sempre vira este id. Mantido em sincronia manualmente,
 *  igual todo o resto do contrato entre painel/ e server/. */
const PREFERRED_SERVER_ID = "lendas-01";

/** Servidor 01 sempre que ele estiver online — pedido explícito, é o servidor
 *  em foco. Só cai pro critério de mais gente jogando agora entre os demais
 *  se ele não aparecer na listagem (fora do ar). */
export function pickPrimaryServer(servers: RealServer[]): RealServer | null {
  if (servers.length === 0) return null;
  const preferred = servers.find((server) => server.id === PREFERRED_SERVER_ID);
  if (preferred) return preferred;
  return [...servers].sort((a, b) => b.players - a.players)[0]!;
}
