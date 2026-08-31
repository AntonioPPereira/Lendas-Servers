import { Router } from "express";
import { z } from "zod";
import type { HLStatsService } from "../services/HLStatsService.js";
import type { SteamAvatarService } from "../services/SteamAvatarService.js";
import type { NicknameDirectory } from "../live/nicknameDirectory.js";
import type { PlayerDirectoryService } from "../services/PlayerDirectoryService.js";
import type { PlayerStatsService } from "../services/PlayerStatsService.js";
import { paginate } from "../lib/paginate.js";
import { toPlayerDto } from "../lib/playerDto.js";
import { resolveAvatarsByNickname } from "../lib/avatarResolver.js";
import { NotFoundError } from "../errors.js";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
  q: z.string().trim().max(64).optional(),
});

export function createPlayersRouter(
  hlstats: HLStatsService,
  nicknames: NicknameDirectory,
  avatars: SteamAvatarService,
  playerDirectory: PlayerDirectoryService,
  playerStats: PlayerStatsService,
): Router {
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
      const avatarPorNick = await resolveAvatarsByNickname(
        page.items.map((row) => row.nickname),
        nicknames,
        playerDirectory,
        avatars,
      );
      res.json({
        ...page,
        items: page.items.map((row) => toPlayerDto(row, avatarPorNick.get(row.nickname))),
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
      const avatarPorNick = await resolveAvatarsByNickname(
        [row.nickname],
        nicknames,
        playerDirectory,
        avatars,
      );
      res.json(toPlayerDto(row, avatarPorNick.get(row.nickname)));
    } catch (err) {
      next(err);
    }
  });

  /**
   * Abates por arma DESTE jogador, contados pelo `lendas_playerstats`.
   *
   * Fonte diferente do resto do perfil, e isso importa: o HLstatsX (de onde
   * vêm skill, kills e precisão) não entrega recorte por arma por jogador
   * nesta instalação — `mode=playerinfo` trava e a página de prêmios está
   * vazia. Quem conta arma é o plugin, e ele só conta desde que subiu. Por
   * isso `since` vai junto na resposta: sem essa data, o leitor compara os
   * abates por arma com o total do HLstatsX e conclui que falta coisa.
   *
   * O jogador é encontrado pelo SteamID quando o índice conhece o nick, e
   * só então pelo próprio nick. O SteamID é identidade de verdade; o nick é
   * o que sobra quando ninguém registrou a conta.
   */
  router.get("/:id/weapons", async (req, res, next) => {
    try {
      const row = await hlstats.getPlayer(req.params.id as string);
      if (!row) throw new NotFoundError(`Jogador não encontrado: "${req.params.id}"`);

      const snapshot = await playerStats.getSnapshot().catch(() => null);
      if (!snapshot) {
        // Plugin fora do ar não derruba o perfil: a tela mostra o estado de
        // indisponível, nunca uma lista vazia fingindo que ele não matou.
        res.json({ since: null, available: false, total: 0, weapons: [] });
        return;
      }

      const steamId64 = nicknames.lookup(row.nickname) ?? (await directoryLookup(row.nickname));
      const stats =
        (steamId64 ? snapshot.rows.find((r) => r.id === steamId64) : undefined) ??
        snapshot.rows.find((r) => r.name.toLowerCase() === row.nickname.toLowerCase());

      const weapons = Object.entries(stats?.weapons ?? {})
        .map(([weapon, kills]) => ({ weapon, kills }))
        // Mais usada primeiro; empate desempata pelo código, pra a ordem não
        // dançar entre dois carregamentos com os mesmos números.
        .sort((a, b) => b.kills - a.kills || a.weapon.localeCompare(b.weapon));

      res.json({
        since: snapshot.since,
        available: true,
        total: weapons.reduce((soma, w) => soma + w.kills, 0),
        weapons,
      });
    } catch (err) {
      next(err);
    }
  });

  /** Índice indisponível não é erro: cai no casamento por nick. */
  async function directoryLookup(nickname: string): Promise<string | undefined> {
    try {
      return (await playerDirectory.getDirectory()).get(nickname);
    } catch {
      return undefined;
    }
  }

  return router;
}
