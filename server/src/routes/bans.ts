import { Router } from "express";
import { z } from "zod";
import type { HLStatsService } from "../services/HLStatsService.js";
import type { SourceBansService } from "../services/SourceBansService.js";
import type { SteamAvatarService } from "../services/SteamAvatarService.js";
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

/**
 * Anexa a foto da Steam nos bans de UMA página.
 *
 * Diferente do ranking, aqui não há adivinhação: o SourceBans guarda o
 * SteamID de quem foi punido, então o vínculo entre linha e conta é o
 * próprio registro. Só precisamos converter e pedir a foto.
 *
 * Depois de paginar, de propósito: a página tem no máximo 100 linhas e o
 * `GetPlayerSummaries` aceita 100 IDs, então isso custa **uma** requisição à
 * Steam. Resolver a lista inteira (104 registros e crescendo) gastaria
 * chamadas em gente que ninguém vai ver.
 */
async function attachAvatars(itens: BanDto[], avatars: SteamAvatarService): Promise<void> {
  const ids = itens.map((b) => b.target.steamId64).filter((id) => id !== "");
  if (ids.length === 0) return;

  let urlPorId: Map<string, string>;
  try {
    urlPorId = await avatars.resolve(ids);
  } catch {
    // Steam fora do ar não derruba a lista de punições: a foto é enfeite, e
    // o painel já sabe desenhar o emblema gerado quando ela falta.
    return;
  }

  for (const ban of itens) {
    const url = urlPorId.get(ban.target.steamId64);
    // Perfil privado simplesmente não recebe foto — nunca um placeholder
    // remoto fingindo ser a imagem da pessoa.
    if (url) ban.target.avatarUrl = url;
  }
}

export function createBansRouter(
  sourceBans: SourceBansService,
  hlstats: HLStatsService,
  avatars: SteamAvatarService,
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
      const pagina = itens.slice(inicio, inicio + params.pageSize);
      await attachAvatars(pagina, avatars);

      res.json({
        items: pagina,
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
