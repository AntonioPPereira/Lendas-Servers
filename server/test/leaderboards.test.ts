import { describe, expect, it } from "vitest";
import { buildLeaderboards } from "../src/lib/leaderboards.js";
import type { PlayerStatsRow } from "../src/services/PlayerStatsService.js";

function jogador(over: Partial<PlayerStatsRow> & { id: string; name: string }): PlayerStatsRow {
  return { kills: 0, hs: 0, plants: 0, defuses: 0, weapons: {}, ...over };
}

const SINCE = "2026-08-30T12:00:00.000Z";

describe("buildLeaderboards", () => {
  const rows = [
    jogador({ id: "76561198000000001", name: "Ana", kills: 30, hs: 10, plants: 4, defuses: 1, weapons: { ak47: 20, awp: 10 } }),
    jogador({ id: "76561198000000002", name: "Bruno", kills: 25, hs: 15, plants: 1, defuses: 6, weapons: { ak47: 5, awp: 20 } }),
    jogador({ id: "76561198000000003", name: "Caio", kills: 4, hs: 1, weapons: { knife: 4 } }),
  ];

  const lb = buildLeaderboards({ since: SINCE, rows });

  it("faz um pódio por arma, com quem mais matou com ela na frente", () => {
    const ak = lb.weapons.find((w) => w.weapon === "ak47")!;
    expect(ak.total).toBe(25);
    expect(ak.top[0]).toMatchObject({ nickname: "Ana", value: 20 });
    expect(ak.top[1]).toMatchObject({ nickname: "Bruno", value: 5 });

    const awp = lb.weapons.find((w) => w.weapon === "awp")!;
    expect(awp.top[0]).toMatchObject({ nickname: "Bruno", value: 20 });
  });

  it("ordena as armas pelo total de abates", () => {
    expect(lb.weapons[0]!.weapon).toBe("awp"); // 30 contra 25 da ak47
  });

  it("descarta arma com uso irrelevante, que viraria pódio de sorte", () => {
    // knife tem 4 abates; o mínimo padrão é 10.
    expect(lb.weapons.some((w) => w.weapon === "knife")).toBe(false);
  });

  it("respeita um mínimo customizado", () => {
    const solto = buildLeaderboards({ since: SINCE, rows }, { minKillsPorArma: 1 });
    expect(solto.weapons.some((w) => w.weapon === "knife")).toBe(true);
  });

  it("monta os pódios de ação", () => {
    expect(lb.topKillers[0]).toMatchObject({ nickname: "Ana", value: 30 });
    expect(lb.topHeadshots[0]).toMatchObject({ nickname: "Bruno", value: 15 });
    expect(lb.topPlanters[0]).toMatchObject({ nickname: "Ana", value: 4 });
    expect(lb.topDefusers[0]).toMatchObject({ nickname: "Bruno", value: 6 });
  });

  it("quem tem zero não ocupa posição no pódio", () => {
    // Caio não plantou nenhuma vez — não pode aparecer como "último colocado".
    expect(lb.topPlanters.some((e) => e.nickname === "Caio")).toBe(false);
    expect(lb.topDefusers).toHaveLength(2);
  });

  it("carrega o 'desde quando' até a saída", () => {
    expect(lb.since).toBe(SINCE);
    expect(lb.playersCounted).toBe(3);
  });

  it("empate tem ordem estável, não depende da ordem de leitura", () => {
    const empatados = [
      jogador({ id: "76561198000000009", name: "Zeca", kills: 5, weapons: { ak47: 5 } }),
      jogador({ id: "76561198000000008", name: "Alice", kills: 5, weapons: { ak47: 5 } }),
    ];
    const a = buildLeaderboards({ since: null, rows: empatados }, { minKillsPorArma: 1 });
    const b = buildLeaderboards({ since: null, rows: [...empatados].reverse() }, { minKillsPorArma: 1 });
    expect(a.topKillers.map((e) => e.nickname)).toEqual(["Alice", "Zeca"]);
    expect(b.topKillers.map((e) => e.nickname)).toEqual(a.topKillers.map((e) => e.nickname));
  });

  it("limita o tamanho do pódio", () => {
    const muitos = Array.from({ length: 20 }, (_, i) =>
      jogador({ id: `765611980000000${String(i).padStart(2, "0")}`, name: `P${i}`, kills: i + 1, weapons: { ak47: i + 1 } }),
    );
    const top3 = buildLeaderboards({ since: null, rows: muitos }, { topN: 3 });
    expect(top3.topKillers).toHaveLength(3);
    expect(top3.weapons[0]!.top).toHaveLength(3);
  });

  it("sem ninguém contado ainda, devolve estrutura vazia em vez de quebrar", () => {
    const vazio = buildLeaderboards({ since: null, rows: [] });
    expect(vazio).toMatchObject({ since: null, playersCounted: 0, weapons: [], topKillers: [] });
  });
});
