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

/** O servidor com mais gente jogando agora — o mais relevante pra mostrar
 *  num espaço compacto quando há mais de um servidor real. */
export function pickPrimaryServer(servers: RealServer[]): RealServer | null {
  if (servers.length === 0) return null;
  return [...servers].sort((a, b) => b.players - a.players)[0]!;
}
