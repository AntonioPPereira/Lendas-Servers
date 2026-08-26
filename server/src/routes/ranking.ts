import { Router } from "express";
import { z } from "zod";
import type { HLStatsService } from "../services/HLStatsService.js";
import type { SteamAvatarService } from "../services/SteamAvatarService.js";
import type { RankingBaseline } from "../services/RankingBaseline.js";
import type { NicknameDirectory } from "../live/nicknameDirectory.js";
import { paginate } from "../lib/paginate.js";
import { toPlayerDto } from "../lib/playerDto.js";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(64).optional(),
});

/**
 * /api/ranking e /api/players consomem exatamente a mesma fonte (a tabela
 * `mode=players` do HLstatsX) — não existe recorte por período ("hoje",
 * "semana") nem por temporada nessa fonte, então nenhum dos dois filtros
 * dá pra oferecer aqui (o frontend precisou perder essas abas).
 */
export function createRankingRouter(
  hlstats: HLStatsService,
  nicknames: NicknameDirectory,
  avatars: SteamAvatarService,
  baseline: RankingBaseline,
): Router {
  const router = Router();

  function avatarFor(nickname: string): string | undefined {
    const steamId64 = nicknames.lookup(nickname);
    return steamId64 ? avatars.peek(steamId64) : undefined;
  }

  router.get("/", async (req, res, next) => {
    try {
      const query = listQuerySchema.parse(req.query);
      const allRows = await hlstats.getRanking();

      // Antes de filtrar: a linha de base precisa do ranking inteiro, senão
      // grava um retrato parcial e todo mundo fora da busca vira "entrou agora".
      baseline.sync(allRows);

      let rows = allRows;
      if (query.q) {
        const needle = query.q.toLowerCase();
        rows = rows.filter(
          (row) => row.nickname.toLowerCase().includes(needle) || row.hlstatsPlayerId === query.q,
        );
      }

      const page = paginate(rows, query.page, query.pageSize);
      res.json({
        ...page,
        items: page.items.map((row) =>
          toPlayerDto(row, avatarFor(row.nickname), baseline.deltaFor(row)),
        ),
        /** Desde quando os deltas contam — o painel mostra isso junto, nunca uma variação sem origem. */
        comparedTo: baseline.capturedAt(),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
