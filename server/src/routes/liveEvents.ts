import { Router } from "express";
import { ZodError } from "zod";
import { liveIngestPayloadSchema, type LiveIngestEvent } from "../live/schema.js";
import type { LiveMatchState } from "../live/state.js";
import type { LiveBroadcaster } from "../live/broadcaster.js";
import type { SteamAvatarService } from "../services/SteamAvatarService.js";
import { createLiveAuth } from "../middleware/liveAuth.js";

function steamIdsIn(events: LiveIngestEvent[]): string[] {
  const ids: string[] = [];
  for (const event of events) {
    if (event.kind === "player_snapshot") ids.push(...event.players.map((p) => p.steamId64));
    else if (event.kind === "player_connect") ids.push(event.steamId64);
  }
  return ids;
}

/**
 * `POST /api/live/events` — o novo plugin `lendas_live` manda lotes de
 * eventos aqui, autenticado por token fixo (`createLiveAuth`). Responde
 * assim que o estado em memória é atualizado; broadcast pro SSE e
 * resolução de avatar acontecem depois, sem o plugin esperar por nenhum
 * dos dois (nunca bloqueia o request de quem está mandando os eventos).
 */
export function createLiveEventsRouter(
  state: LiveMatchState,
  broadcaster: LiveBroadcaster,
  avatars: SteamAvatarService,
  apiToken: string,
): Router {
  const router = Router();
  let lastBroadcastPrimaryId: string | null = null;

  function broadcastPrimaryIfNeeded(affectedServerId: string): void {
    const primaryId = state.getPrimaryServerId();
    const shouldBroadcast = primaryId !== null && (primaryId === affectedServerId || primaryId !== lastBroadcastPrimaryId);
    if (!shouldBroadcast || !primaryId) return;

    lastBroadcastPrimaryId = primaryId;
    const snapshot = state.getSnapshot(primaryId);
    if (snapshot) broadcaster.broadcast({ type: "match", payload: snapshot });
  }

  router.post("/", createLiveAuth(apiToken), (req, res) => {
    let payload;
    try {
      payload = liveIngestPayloadSchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "invalid_payload", message: err.issues.map((i) => i.message).join("; ") });
        return;
      }
      throw err;
    }

    state.applyEvents(payload.serverId, payload.events);
    res.status(202).json({ accepted: payload.events.length });

    broadcastPrimaryIfNeeded(payload.serverId);

    const newIds = steamIdsIn(payload.events);
    if (newIds.length === 0) return;

    avatars
      .resolve(newIds)
      .then((resolved) => {
        if (resolved.size === 0) return;
        for (const [steamId64, url] of resolved) state.setAvatarUrl(steamId64, url);

        const primaryId = state.getPrimaryServerId();
        const snapshot = primaryId ? state.getSnapshot(primaryId) : null;
        if (snapshot) broadcaster.broadcast({ type: "match", payload: snapshot });
      })
      .catch((cause: unknown) => {
        console.error("[live] falha ao resolver avatares:", cause);
      });
  });

  return router;
}
