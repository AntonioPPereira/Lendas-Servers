import { Router } from "express";
import type { LiveMatchState } from "../live/state.js";
import type { LiveBroadcaster } from "../live/broadcaster.js";

/**
 * `GET /api/live/stream` — SSE puro (sem dependência nova: `res.write` já
 * basta), consumido pelo `SseTransport` que já existe no frontend
 * (`painel/src/realtime/transport.ts`) sem nenhuma mudança nele.
 *
 * Manda o snapshot atual assim que conecta (o `EventSource` não vê frames
 * anteriores à conexão) e depois só repassa o que `LiveBroadcaster` emitir.
 * Cada conexão tem seu próprio heartbeat — o número de espectadores
 * simultâneos é pequeno o bastante pra isso nunca ser um custo real, e evita
 * expor o `LiveBroadcaster`/gerenciar um timer fora do ciclo de vida da rota.
 */
export function createLiveStreamRouter(state: LiveMatchState, broadcaster: LiveBroadcaster, heartbeatMs: number): Router {
  const router = Router();

  router.get("/", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    res.write(":ok\n\n");

    const snapshot = state.getPrimarySnapshot();
    if (snapshot) {
      res.write(`data: ${JSON.stringify({ type: "match", payload: snapshot })}\n\n`);
    }

    const unsubscribe = broadcaster.subscribe(res);
    const heartbeat = setInterval(() => {
      try {
        res.write(": heartbeat\n\n");
      } catch {
        clearInterval(heartbeat);
      }
    }, heartbeatMs);

    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  return router;
}
