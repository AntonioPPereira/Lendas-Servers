import { Router } from "express";
import { z } from "zod";
import type { HLStatsService } from "../services/HLStatsService.js";
import { paginate } from "../lib/paginate.js";
import { toPlayerDto } from "../lib/playerDto.js";
import { NotFoundError } from "../errors.js";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
  q: z.string().trim().max(64).optional(),
});

export function createPlayersRouter(hlstats: HLStatsService): Router {
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
      res.json({
        ...page,
        items: page.items.map(toPlayerDto),
        // Agregado sobre a lista inteira já cacheada (todas as páginas do
        // HLstatsX), não só a página atual — os cards de resumo da tela de
        // Jogadores usam isso, e não custa nada calcular já que está tudo
        // em memória.
        totalKills: rows.reduce((sum, row) => sum + row.kills, 0),
        totalHeadshots: rows.reduce((sum, row) => sum + row.headshots, 0),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const row = await hlstats.getPlayer(req.params.id as string);
      if (!row) throw new NotFoundError(`Jogador não encontrado: "${req.params.id}"`);
      res.json(toPlayerDto(row));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
