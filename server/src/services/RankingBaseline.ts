import type { HLStatsRankingRow } from "./HLStatsService.js";

export interface RankingDelta {
  /** Posições ganhas desde a linha de base. Positivo = subiu. `null` = sem comparação possível. */
  rankDelta: number | null;
  /** Skill ganho desde a linha de base. `null` = sem comparação possível. */
  skillDelta: number | null;
}

const NO_DELTA: RankingDelta = { rankDelta: null, skillDelta: null };

/**
 * Linha de base do ranking, pra mostrar "o que mudou" sem que o HLstatsX
 * ofereça histórico nenhum — ele só expõe a foto do momento.
 *
 * Congela um retrato (posição + skill de cada jogador) e o renova a cada
 * `intervalMs`. Todo delta é sempre "desde este retrato", e `capturedAt` sai
 * junto na resposta pro painel poder dizer desde quando está comparando —
 * nunca uma variação de origem vaga.
 *
 * Mora só em memória, como o resto do estado deste backend: um deploy zera a
 * linha de base e a primeira janela seguinte volta a marcar zero até o
 * próximo ciclo. É a limitação honesta de não haver banco aqui — melhor que
 * inventar um histórico que não existe.
 */
export class RankingBaseline {
  private snapshot = new Map<string, { rank: number; skill: number }>();
  private capturedAtMs = 0;

  constructor(
    private readonly intervalMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Recongela o retrato se a janela venceu. Recebe SEMPRE o ranking
   * completo — passar uma lista já filtrada por busca gravaria uma linha de
   * base parcial, e todo mundo de fora dela viraria "jogador novo".
   */
  sync(allRows: readonly HLStatsRankingRow[]): void {
    if (allRows.length === 0) return;

    const now = this.now();
    const expired = now - this.capturedAtMs >= this.intervalMs;
    if (this.snapshot.size > 0 && !expired) return;

    const next = new Map<string, { rank: number; skill: number }>();
    for (const row of allRows) next.set(row.hlstatsPlayerId, { rank: row.rank, skill: row.skill });
    this.snapshot = next;
    this.capturedAtMs = now;
  }

  /** ISO do retrato atual, ou `null` enquanto nenhum foi tirado. */
  capturedAt(): string | null {
    return this.capturedAtMs === 0 ? null : new Date(this.capturedAtMs).toISOString();
  }

  /**
   * `null` nos dois campos quando o jogador não estava no retrato — entrou
   * no ranking depois. "Subiu do nada" não é um ganho de posição real, e
   * inventar um número aí seria pior que não mostrar nada.
   */
  deltaFor(row: HLStatsRankingRow): RankingDelta {
    const before = this.snapshot.get(row.hlstatsPlayerId);
    if (!before) return NO_DELTA;
    return {
      // Posição menor é melhor, então a subida é base - atual.
      rankDelta: before.rank - row.rank,
      skillDelta: row.skill - before.skill,
    };
  }
}
