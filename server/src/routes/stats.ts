import { Router } from "express";
import type { HLStatsService } from "../services/HLStatsService.js";
import type { PlayerStatsService } from "../services/PlayerStatsService.js";
import { buildLeaderboards } from "../lib/leaderboards.js";
import { buildServerStats } from "../lib/serverStats.js";

/**
 * `GET /api/stats` — números somados de TODO o histórico do servidor,
 * vindos das páginas `mode=weapons`, `mode=actions` e `mode=maps` do
 * HLstatsX.
 *
 * O recorte POR JOGADOR não sai daqui — o `mode=playerinfo` desta
 * instalação trava e a página de prêmios está vazia. Ele vem de
 * `GET /api/stats/leaderboards`, alimentado pelo plugin
 * `lendas_playerstats`, e conta só a partir de quando o plugin subiu.
 */
export function createStatsRouter(
  hlstats: HLStatsService,
  playerStats: PlayerStatsService,
): Router {
  const router = Router();

  router.get("/", async (_req, res, next) => {
    try {
      const raw = await hlstats.getServerStats();
      res.json(buildServerStats(raw));
    } catch (err) {
      next(err);
    }
  });

  /**
   * Pódios por arma e por ação. Separado de `/` de propósito: as duas
   * fontes são diferentes (HLstatsX x plugin) e cobrem períodos diferentes,
   * então juntar num payload só convidaria a somar o que não se soma.
   */
  router.get("/leaderboards", async (_req, res, next) => {
    try {
      const snapshot = await playerStats.getSnapshot();
      res.json(buildLeaderboards(snapshot));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
