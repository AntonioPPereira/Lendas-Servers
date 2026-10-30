import { Router } from "express";
import { z } from "zod";
import type { ActivityLogEvent, SteamFilterLogService } from "../services/SteamFilterLogService.js";

/**
 * Mesmo shape de `ActivityEvent` do frontend (`painel/src/data/types.ts`),
 * direto do veredito real do plugin — incluindo "leave" desde a versão
 * 1.1.0 do `lendas_steamfilter`, que passou a registrar a desconexão de
 * quem tinha sido aprovado. Servidor rodando uma versão anterior
 * simplesmente não produz essas linhas, e o feed segue só com entradas.
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

const querySchema = z.object({
  /** Nick exato. Serve o perfil do jogador, que lista só as passagens dele. */
  actor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export function createActivityRouter(steamFilter: SteamFilterLogService): Router {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      const { actor, limit } = querySchema.parse(req.query);
      const events = await steamFilter.getRecentEvents({ actor, limit });
      res.json(events.map(toActivityDto));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
