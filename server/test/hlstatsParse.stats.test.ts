import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  parseActionsHtml,
  parseMapsHtml,
  parseWeaponsHtml,
} from "../src/lib/hlstatsParse.js";

/** HTML real capturado do HLstatsX desta rede em 2026-08-30. */
function fixture(nome: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${nome}`, import.meta.url)), "utf-8");
}

const WEAPONS = fixture("hlstats-weapons.html");
const ACTIONS = fixture("hlstats-actions.html");
const MAPS = fixture("hlstats-maps.html");

describe("parseWeaponsHtml", () => {
  const rows = parseWeaponsHtml(WEAPONS);

  it("lê todas as armas da página real", () => {
    expect(rows.length).toBeGreaterThanOrEqual(25);
  });

  it("traz o número real da arma mais usada", () => {
    const deagle = rows.find((r) => r.code === "deagle");
    expect(deagle).toBeDefined();
    expect(deagle!.kills).toBe(16_869);
    expect(deagle!.headshots).toBe(10_265);
    expect(deagle!.headshotRatio).toBeCloseTo(0.61, 2);
  });

  it("usa o nome legível do ícone, não o código interno", () => {
    expect(rows.find((r) => r.code === "ak47")!.name).toBe("Kalashnikov AK-47");
  });

  it("não perde arma nenhuma pelo caminho", () => {
    for (const code of ["awp", "m4a1", "knife", "hegrenade"]) {
      expect(rows.some((r) => r.code === code)).toBe(true);
    }
  });

  it("HTML vazio não quebra — devolve lista vazia", () => {
    expect(parseWeaponsHtml("<html><body></body></html>")).toEqual([]);
  });
});

describe("parseActionsHtml", () => {
  const rows = parseActionsHtml(ACTIONS);

  it("lê as ações com o total real", () => {
    const hs = rows.find((r) => r.code === "headshot");
    expect(hs?.count).toBe(28_263);
  });

  it("descarta o sufixo 'times' e devolve número", () => {
    const plant = rows.find((r) => r.name === "Plant the Bomb");
    expect(plant?.count).toBe(4_174);
    expect(Number.isInteger(plant?.count)).toBe(true);
  });

  it("preserva o nome de exibição da ação", () => {
    expect(rows.find((r) => r.code === "Got_The_Bomb")?.name).toBe("Pick up the Bomb");
  });

  it("HTML vazio não quebra", () => {
    expect(parseActionsHtml("<html></html>")).toEqual([]);
  });
});

describe("parseMapsHtml", () => {
  const rows = parseMapsHtml(MAPS);

  it("lê os mapas com kills e headshots reais", () => {
    const dust2 = rows.find((r) => r.map === "de_dust2");
    expect(dust2!.kills).toBe(18_758);
    expect(dust2!.headshots).toBe(9_070);
  });

  it("mantém o nome do mapa como o servidor usa, com sufixo e tudo", () => {
    // O painel normaliza isso na hora de exibir; o parser não inventa nada.
    expect(rows.some((r) => r.map === "de_mirage_csgo_v2")).toBe(true);
  });

  it("HTML vazio não quebra", () => {
    expect(parseMapsHtml("")).toEqual([]);
  });
});
