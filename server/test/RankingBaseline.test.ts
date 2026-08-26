import { describe, expect, it } from "vitest";
import { RankingBaseline } from "../src/services/RankingBaseline.js";
import type { HLStatsRankingRow } from "../src/services/HLStatsService.js";

function row(id: string, rank: number, skill: number): HLStatsRankingRow {
  return {
    hlstatsPlayerId: id,
    rank,
    nickname: "p" + id,
    countryCode: null,
    countryName: null,
    skill,
    kills: 0,
    deaths: 0,
    kd: null,
    headshots: 0,
    hsRate: null,
    accuracy: null,
    connectionTimeMinutes: null,
  } as HLStatsRankingRow;
}

/** Relógio controlado — nada de esperar uma hora de verdade num teste. */
function fakeClock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("RankingBaseline", () => {
  const HORA = 3_600_000;

  it("sem retrato ainda, capturedAt é null e não inventa comparação", () => {
    const b = new RankingBaseline(HORA);
    expect(b.capturedAt()).toBeNull();
    expect(b.deltaFor(row("1", 1, 100))).toEqual({ rankDelta: null, skillDelta: null });
  });

  it("logo após congelar a base, tudo é zero — nada mudou desde agora", () => {
    const clock = fakeClock();
    const b = new RankingBaseline(HORA, clock.now);
    b.sync([row("1", 1, 100), row("2", 2, 90)]);

    expect(b.capturedAt()).toBe(new Date(clock.now()).toISOString());
    expect(b.deltaFor(row("1", 1, 100))).toEqual({ rankDelta: 0, skillDelta: 0 });
  });

  it("subir de posição dá delta positivo, cair dá negativo", () => {
    const b = new RankingBaseline(HORA, fakeClock().now);
    b.sync([row("1", 1, 100), row("2", 5, 60)]);

    expect(b.deltaFor(row("2", 2, 75))).toEqual({ rankDelta: 3, skillDelta: 15 });
    expect(b.deltaFor(row("1", 4, 92))).toEqual({ rankDelta: -3, skillDelta: -8 });
  });

  it("jogador que não estava no retrato não ganha número inventado", () => {
    const b = new RankingBaseline(HORA, fakeClock().now);
    b.sync([row("1", 1, 100)]);
    expect(b.deltaFor(row("99", 7, 40))).toEqual({ rankDelta: null, skillDelta: null });
  });

  it("dentro da janela o retrato não se move, mesmo com sync a cada requisição", () => {
    const clock = fakeClock();
    const b = new RankingBaseline(HORA, clock.now);
    b.sync([row("1", 5, 50)]);
    const first = b.capturedAt();

    clock.advance(HORA - 1);
    b.sync([row("1", 1, 90)]);

    expect(b.capturedAt()).toBe(first);
    expect(b.deltaFor(row("1", 1, 90))).toEqual({ rankDelta: 4, skillDelta: 40 });
  });

  it("vencida a janela, recongela e os deltas voltam a zero", () => {
    const clock = fakeClock();
    const b = new RankingBaseline(HORA, clock.now);
    b.sync([row("1", 5, 50)]);

    clock.advance(HORA);
    b.sync([row("1", 1, 90)]);

    expect(b.capturedAt()).toBe(new Date(clock.now()).toISOString());
    expect(b.deltaFor(row("1", 1, 90))).toEqual({ rankDelta: 0, skillDelta: 0 });
  });

  it("lista vazia (HLstatsX fora do ar) nunca apaga o retrato bom", () => {
    const clock = fakeClock();
    const b = new RankingBaseline(HORA, clock.now);
    b.sync([row("1", 5, 50)]);
    const first = b.capturedAt();

    clock.advance(HORA * 2);
    b.sync([]);

    expect(b.capturedAt()).toBe(first);
    expect(b.deltaFor(row("1", 3, 70))).toEqual({ rankDelta: 2, skillDelta: 20 });
  });
});
