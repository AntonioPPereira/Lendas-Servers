import { Router } from "express";
import type { HLStatsService } from "../services/HLStatsService.js";
import { buildServerStats } from "../lib/serverStats.js";

/**
 * `GET /api/stats` — números somados de TODO o histórico do servidor,
 * vindos das páginas `mode=weapons`, `mode=actions` e `mode=maps` do
 * HLstatsX.
 *
 * O que esta rota deliberadamente NÃO tem: qualquer recorte por jogador
 * ("quem matou mais com a AK"). O `mode=playerinfo` desta instalação trava
 * pra jogador com avatar real (auditado, ver HLStatsService), então esse
 * dado não existe pra ser lido — e inventar um "top 1" seria mentira. Isso
 * depende de um plugin próprio acumulando os eventos.
 */
export function createStatsRouter(hlstats: HLStatsService): Router {
  const router = Router();

  router.get("/", async (_req, res, next) => {
    try {
      const raw = await hlstats.getServerStats();
      res.json(buildServerStats(raw));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
