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
export function toPlayerDto(row: HLStatsRankingRow) {
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
  };
}

export type PlayerDto = ReturnType<typeof toPlayerDto>;
