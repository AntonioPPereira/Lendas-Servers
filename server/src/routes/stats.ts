import { Router } from "express";
import type { HLStatsService } from "../services/HLStatsService.js";
import type { PlayerStatsService } from "../services/PlayerStatsService.js";
import { attachAvatars, buildLeaderboards, collectSteamIds } from "../lib/leaderboards.js";
import type { SteamAvatarService } from "../services/SteamAvatarService.js";
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
  avatars: SteamAvatarService,
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
      const boards = buildLeaderboards(await playerStats.getSnapshot());

      /**
       * O pódio já tem o SteamID64, então dá pra pedir a foto direto — sem
       * passar pelo cruzamento por nick. Uma requisição só cobre todos os
       * pódios da tela; falha de rede não derruba nada, só volta sem foto.
       */
      const urls = await avatars.resolve(collectSteamIds(boards)).catch(() => new Map<string, string>());
      res.json(attachAvatars(boards, urls));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
