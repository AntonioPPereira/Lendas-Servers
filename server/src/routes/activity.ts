import { Router } from "express";
import type { ActivityLogEvent, SteamFilterLogService } from "../services/SteamFilterLogService.js";

/**
 * Mesmo shape de `ActivityEvent` do frontend (`painel/src/data/types.ts`),
 * direto do veredito real do plugin — nunca "leave", porque o
 * `lendas_steamfilter` não loga desconexão (auditado, não existe essa fonte).
 */
function toActivityDto(event: ActivityLogEvent) {
  return {
    id: event.id,
    kind: event.kind,
    at: event.at,
    actor: event.actor,
    ...(event.detail ? { detail: event.detail } : {}),
  };
}

export function createActivityRouter(steamFilter: SteamFilterLogService): Router {
  const router = Router();

  router.get("/", async (_req, res, next) => {
    try {
      const events = await steamFilter.getRecentEvents();
      res.json(events.map(toActivityDto));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
