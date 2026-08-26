import { Router } from "express";
import { z } from "zod";
import type { HLStatsService } from "../services/HLStatsService.js";
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
export function createRankingRouter(hlstats: HLStatsService): Router {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      const query = listQuerySchema.parse(req.query);
      let rows = await hlstats.getRanking();

      if (query.q) {
        const needle = query.q.toLowerCase();
        rows = rows.filter(
          (row) => row.nickname.toLowerCase().includes(needle) || row.hlstatsPlayerId === query.q,
        );
      }

      const page = paginate(rows, query.page, query.pageSize);
      res.json({ ...page, items: page.items.map(toPlayerDto) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
