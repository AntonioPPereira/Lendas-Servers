import { Router } from "express";
import type { HLStatsService, HLStatsServerRow } from "../services/HLStatsService.js";
import { deriveServerId } from "../lib/serverId.js";
import { NotFoundError } from "../errors.js";

/**
 * Formato de resposta — só o que o HLstatsX realmente confirma. Sem ping,
 * sem uptime de processo, sem round/placar: nada disso existe nesta fonte.
 * `mapPlaytimeSeconds` é honesto sobre o que é (tempo no mapa atual, não
 * uptime do servidor).
 */
function toDto(row: HLStatsServerRow) {
  const id = deriveServerId(row.name, row.host, row.port);
  return {
    id,
    name: row.name,
    host: row.host,
    port: row.port,
    status: "online" as const, // se apareceu na listagem, respondeu ao HLstatsX agora
    map: row.map,
    players: row.players,
    maxPlayers: row.maxPlayers,
    mapPlaytimeSeconds: row.mapPlaytimeSeconds,
  };
}

export function createServersRouter(hlstats: HLStatsService): Router {
  const router = Router();

  router.get("/", async (_req, res, next) => {
    try {
      const rows = await hlstats.getServers();
      res.json(rows.map(toDto));
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const rows = await hlstats.getServers();
      const match = rows.find((row) => deriveServerId(row.name, row.host, row.port) === req.params.id);
      if (!match) throw new NotFoundError(`Servidor não encontrado: "${req.params.id}"`);
      res.json(toDto(match));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
