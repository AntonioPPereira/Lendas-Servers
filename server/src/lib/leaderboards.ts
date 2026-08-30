import type { PlayerStatsRow, PlayerStatsSnapshot } from "../services/PlayerStatsService.js";

/**
 * Pódios por arma e por ação, a partir do que o plugin `lendas_playerstats`
 * contou no servidor de jogo.
 *
 * Estes números **não** são o histórico do servidor — são o que foi contado
 * desde que o plugin subiu. `since` viaja junto até a tela justamente pra
 * essa diferença ficar explícita; sem isso o leitor compararia com os
 * totais do HLstatsX e concluiria que algo está quebrado.
 */

export interface LeaderEntry {
  steamId64: string;
  nickname: string;
  value: number;
}

export interface WeaponLeaderboard {
  /** Código do HLstatsX ("ak47"), pro frontend reusar o mesmo rótulo curto. */
  weapon: string;
  /** Total de abates com essa arma somando todo mundo. */
  total: number;
  top: LeaderEntry[];
}

export interface Leaderboards {
  since: string | null;
  /** Quantos jogadores entraram na contagem — dá noção do tamanho da amostra. */
  playersCounted: number;
  weapons: WeaponLeaderboard[];
  topKillers: LeaderEntry[];
  topHeadshots: LeaderEntry[];
  topPlanters: LeaderEntry[];
  topDefusers: LeaderEntry[];
}

/**
 * Empate é resolvido pelo nick, em ordem alfabética. Sem isso a ordem
 * dependeria da ordem de leitura do arquivo e o pódio "trocaria sozinho"
 * entre dois recarregamentos, sem nada ter mudado.
 */
function ordenar(entradas: LeaderEntry[]): LeaderEntry[] {
  return entradas.sort(
    (a, b) => b.value - a.value || a.nickname.localeCompare(b.nickname, "pt-BR"),
  );
}

function podio(
  rows: readonly PlayerStatsRow[],
  valorDe: (row: PlayerStatsRow) => number,
  limite: number,
): LeaderEntry[] {
  const entradas: LeaderEntry[] = [];
  for (const row of rows) {
    const value = valorDe(row);
    // Zero não entra no pódio: "nunca plantou" não é uma posição.
    if (value > 0) entradas.push({ steamId64: row.id, nickname: row.name, value });
  }
  return ordenar(entradas).slice(0, limite);
}

export interface BuildOptions {
  /** Quantos nomes por pódio. */
  topN?: number;
  /**
   * Arma com pouquíssimo uso vira pódio de uma kill só, que não diz nada —
   * por isso só entram armas com um mínimo de abates no total.
   */
  minKillsPorArma?: number;
}

export function buildLeaderboards(
  snapshot: PlayerStatsSnapshot,
  options: BuildOptions = {},
): Leaderboards {
  const topN = options.topN ?? 5;
  const minKills = options.minKillsPorArma ?? 10;
  const rows = snapshot.rows;

  // Junta os totais por arma antes de montar cada pódio.
  const totaisPorArma = new Map<string, number>();
  for (const row of rows) {
    for (const [arma, n] of Object.entries(row.weapons)) {
      totaisPorArma.set(arma, (totaisPorArma.get(arma) ?? 0) + n);
    }
  }

  const weapons: WeaponLeaderboard[] = [];
  for (const [weapon, total] of totaisPorArma) {
    if (total < minKills) continue;
    weapons.push({
      weapon,
      total,
      top: podio(rows, (r) => r.weapons[weapon] ?? 0, topN),
    });
  }
  weapons.sort((a, b) => b.total - a.total || a.weapon.localeCompare(b.weapon));

  return {
    since: snapshot.since,
    playersCounted: rows.length,
    weapons,
    topKillers: podio(rows, (r) => r.kills, topN),
    topHeadshots: podio(rows, (r) => r.hs, topN),
    topPlanters: podio(rows, (r) => r.plants, topN),
    topDefusers: podio(rows, (r) => r.defuses, topN),
  };
}
