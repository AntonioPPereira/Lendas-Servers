import type { HLStatsRankingRow } from "../services/HLStatsService.js";

/**
 * Formato de resposta compartilhado por /api/ranking e /api/players — é o
 * mesmo dado (linha do ranking do HLstatsX), só que expostos em rotas
 * diferentes porque são dois consumidores diferentes no frontend.
 *
 * `id` é o ID NUMÉRICO INTERNO do HLstatsX — não é SteamID nem SteamID64.
 * Esta instalação não expõe SteamID de forma confiável (a página de perfil
 * individual do HLstatsX trava antes de renderizar esse dado pra qualquer
 * jogador real — ver HLStatsService). Enquanto isso não mudar, `id` é o
 * único identificador estável que existe pra um jogador real.
 */
/**
 * `avatarUrl` vem de fora (nunca desta linha do HLstatsX — ver comentário
 * acima): é o SteamID64 mais recente visto ao vivo com este mesmo nickname
 * (`NicknameDirectory`), resolvido pra foto pela Steam Web API (`SteamAvatarService`).
 * Ausente sempre que ninguém com esse nickname exato apareceu ao vivo ainda.
 */
export function toPlayerDto(
  row: HLStatsRankingRow,
  avatarUrl?: string,
  delta?: { rankDelta: number | null; skillDelta: number | null },
) {
  return {
    id: row.hlstatsPlayerId,
    rank: row.rank,
    nickname: row.nickname,
    country: row.countryCode || row.countryName ? { code: row.countryCode, name: row.countryName } : null,
    skill: row.skill,
    kills: row.kills,
    deaths: row.deaths,
    kd: row.kd,
    headshots: row.headshots,
    hsRate: row.hsRate,
    accuracy: row.accuracy,
    connectionTimeMinutes: row.connectionTimeMinutes,
    avatarUrl,
    // Variação desde a linha de base horária (RankingBaseline). Ausente nas
    // rotas que não comparam; `null` dentro dela quando o jogador ainda não
    // estava no retrato anterior.
    rankDelta: delta?.rankDelta ?? null,
    skillDelta: delta?.skillDelta ?? null,
  };
}

export type PlayerDto = ReturnType<typeof toPlayerDto>;
