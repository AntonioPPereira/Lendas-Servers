import { Router } from "express";
import { z } from "zod";
import type { HLStatsService } from "../services/HLStatsService.js";
import type { SourceBansService } from "../services/SourceBansService.js";
import { deriveServerId } from "../lib/serverId.js";
import { matchesQuery, toBanDto, type BanDto } from "../lib/sourceBans.js";

const querySchema = z.object({
  q: z.string().max(120).optional().default(""),
  state: z.enum(["all", "active", "expired", "permanent"]).optional().default("all"),
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(12),
});

/**
 * Nome amigável do servidor a partir de "ip:porta". Best-effort: se o
 * HLstatsX estiver fora do ar, a lista de bans continua respondendo — só
 * mostra "ip:porta" em vez de "SERVIDOR 01". Nunca deixa a página cair por
 * causa de um enfeite.
 */
async function buildServerResolver(hlstats: HLStatsService) {
  const mapa = new Map<string, { id: string; name: string }>();
  try {
    for (const row of await hlstats.getServers()) {
      mapa.set(`${row.host}:${row.port}`, {
        id: deriveServerId(row.name, row.host, row.port),
        name: row.name,
      });
    }
  } catch {
    // segue sem nomes bonitos
  }
  return (hostPort: string) => mapa.get(hostPort);
}

export function createBansRouter(
  sourceBans: SourceBansService,
  hlstats: HLStatsService,
): Router {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      const params = querySchema.parse(req.query);
      const snapshot = await sourceBans.getSnapshot();
      const resolver = await buildServerResolver(hlstats);
      const agora = Math.floor(Date.now() / 1000);

      let itens: BanDto[] = snapshot.rows.map((row) => toBanDto(row, agora, resolver));

      if (params.state !== "all") {
        itens = itens.filter((b) => b.state === params.state);
      }
      if (params.q.trim()) {
        itens = itens.filter((b) => matchesQuery(b, params.q));
      }

      // Mais recente primeiro — o plugin já ordena, mas não dependemos disso.
      itens.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      const total = itens.length;
      const inicio = (params.page - 1) * params.pageSize;

      res.json({
        items: itens.slice(inicio, inicio + params.pageSize),
        total,
        page: params.page,
        pageSize: params.pageSize,
      });
    } catch (err) {
      next(err);
    }
  });

  /** Contadores por estado — o painel usa pra rotular os filtros sem baixar tudo. */
  router.get("/summary", async (_req, res, next) => {
    try {
      const snapshot = await sourceBans.getSnapshot();
      const agora = Math.floor(Date.now() / 1000);
      const itens = snapshot.rows.map((row) => toBanDto(row, agora));

      res.json({
        generatedAt: snapshot.generatedAt,
        all: itens.length,
        active: itens.filter((b) => b.state === "active").length,
        expired: itens.filter((b) => b.state === "expired").length,
        permanent: itens.filter((b) => b.state === "permanent").length,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
