import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildServerStats } from "../src/lib/serverStats.js";
import {
  parseActionsHtml,
  parseMapsHtml,
  parseWeaponsHtml,
} from "../src/lib/hlstatsParse.js";

function fixture(nome: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${nome}`, import.meta.url)), "utf-8");
}

/** Retrato real do HLstatsX desta rede, capturado em 2026-08-30. */
const REAL = {
  weapons: parseWeaponsHtml(fixture("hlstats-weapons.html")),
  actions: parseActionsHtml(fixture("hlstats-actions.html")),
  maps: parseMapsHtml(fixture("hlstats-maps.html")),
};

describe("buildServerStats — dados reais", () => {
  const stats = buildServerStats(REAL);

  it("soma o total de kills a partir das armas", () => {
    // Confere contra a soma independente da própria fixture.
    const esperado = REAL.weapons.reduce((s, w) => s + w.kills, 0);
    expect(stats.totalKills).toBe(esperado);
    expect(stats.totalKills).toBeGreaterThan(50_000);
  });

  it("calcula a taxa de headshot do servidor", () => {
    expect(stats.headshotRate).toBeGreaterThan(0);
    expect(stats.headshotRate).toBeLessThan(1);
  });

  it("ordena as armas da mais letal pra menos", () => {
    const kills = stats.weapons.map((w) => w.kills);
    expect([...kills].sort((a, b) => b - a)).toEqual(kills);
    expect(stats.weapons[0]!.code).toBe("deagle");
  });

  it("participação de cada arma soma ~100%", () => {
    const soma = stats.weapons.reduce((s, w) => s + w.shareOfKills, 0);
    expect(soma).toBeCloseTo(1, 5);
  });

  it("lê as ações de bomba reais", () => {
    expect(stats.bomb.planted).toBe(4_174);
    expect(stats.bomb.defused).toBe(1_003);
    expect(stats.bomb.pickedUp).toBe(18_008);
  });

  it("lê multi-kills e destaques reais", () => {
    expect(stats.multiKills.double).toBe(10_473);
    expect(stats.multiKills.triple).toBe(3_492);
    expect(stats.highlights.mvp).toBe(9_042);
  });

  it("lê o desfecho dos rounds pelo código real, não pelo nome", () => {
    // Os códigos do HLstatsX dizem quem VENCEU; o nome exibido diz quem foi
    // eliminado. Trocar os dois inverteria a leitura de equilíbrio.
    expect(stats.roundOutcomes.tWipedCts).toBe(4_093);
    expect(stats.roundOutcomes.ctWipedTs).toBe(3_605);
    expect(stats.roundOutcomes.tBombed).toBeGreaterThan(0);
    expect(stats.roundOutcomes.ctDefused).toBeGreaterThan(0);
  });

  it("multi-kills usam os códigos kill_streak_N reais", () => {
    expect(stats.multiKills.quadruple).toBeGreaterThan(0);
    expect(stats.multiKills.rampage).toBeGreaterThan(0);
  });

  it("ordena mapas por kills, com dust2 na frente", () => {
    expect(stats.maps[0]!.map).toBe("de_dust2");
    expect(stats.maps[0]!.kills).toBe(18_758);
  });
});

describe("buildServerStats — ausências viram null, nunca zero", () => {
  it("ação que não existe na fonte fica null (e não 0)", () => {
    const stats = buildServerStats({ weapons: [], actions: [], maps: [] });
    // Zero diria "ninguém nunca plantou". null diz "a fonte não informa".
    expect(stats.bomb.planted).toBeNull();
    expect(stats.multiKills.megaKill).toBeNull();
    expect(stats.highlights.mvp).toBeNull();
    expect(stats.roundOutcomes.tWipedCts).toBeNull();
  });

  it("sem arma nenhuma, a taxa de headshot é null em vez de NaN", () => {
    const stats = buildServerStats({ weapons: [], actions: [], maps: [] });
    expect(stats.totalKills).toBe(0);
    expect(stats.headshotRate).toBeNull();
  });

  it("acha pelo código real do HLstatsX, sem depender do nome", () => {
    const stats = buildServerStats({
      weapons: [],
      maps: [],
      // Nome propositalmente irreconhecível: só o código pode salvar aqui.
      actions: [{ code: "kill_streak_5", name: "xxxxx", count: 12 }],
    });
    expect(stats.multiKills.rampage).toBe(12);
  });

  it("acha a ação pelo nome quando o código da instalação é outro", () => {
    const stats = buildServerStats({
      weapons: [],
      maps: [],
      actions: [{ code: "codigo_exotico", name: "Plant the Bomb", count: 7 }],
    });
    expect(stats.bomb.planted).toBe(7);
  });
});

describe("buildServerStats — divisões", () => {
  it("não divide por zero quando não há kills", () => {
    const stats = buildServerStats({
      weapons: [{ code: "x", name: "X", kills: 0, headshots: 0, headshotRatio: null }],
      actions: [],
      maps: [],
    });
    expect(stats.weapons[0]!.shareOfKills).toBe(0);
    expect(Number.isNaN(stats.weapons[0]!.shareOfKills)).toBe(false);
  });
});
