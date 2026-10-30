import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseRankingHtml, parseRankingPageCount, parseServersHtml } from "../src/lib/hlstatsParse.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, "fixtures");

/**
 * Fixtures capturadas ao vivo de mixlendas-rank.clanservers.com.br em
 * 2026-08-25 (via curl, User-Agent de navegador). Os valores esperados
 * abaixo foram conferidos manualmente contra o HTML bruto antes de virar
 * asserção — não são um "espelho" do parser, são o que a página realmente
 * mostrava naquele momento.
 */
const homeHtml = readFileSync(path.join(fixturesDir, "hlstats-home.html"), "utf-8");
const playersHtml = readFileSync(path.join(fixturesDir, "hlstats-players-page1.html"), "utf-8");

describe("parseServersHtml (fixture real)", () => {
  const servers = parseServersHtml(homeHtml);

  it("encontra os dois servidores reais", () => {
    expect(servers).toHaveLength(2);
  });

  it("servidor 02 (104.234.65.243:27490)", () => {
    const s = servers.find((s) => s.port === 27490);
    expect(s).toBeDefined();
    expect(s?.host).toBe("104.234.65.243");
    expect(s?.name).toContain("SERVIDOR 02");
    expect(s?.map).toBe("de_dust2");
    expect(s?.players).toBe(1);
    expect(s?.maxPlayers).toBe(13);
    expect(s?.hlstatsServerId).toBe("14");
    expect(s?.mapPlaytimeSeconds).toBe(2 * 3600 + 10 * 60 + 2); // 02:10:02
  });

  it("servidor 01 (104.234.65.244:27800)", () => {
    const s = servers.find((s) => s.port === 27800);
    expect(s).toBeDefined();
    expect(s?.host).toBe("104.234.65.244");
    expect(s?.name).toContain("SERVIDOR 01");
    expect(s?.map).toBe("de_inferno");
    expect(s?.players).toBe(12);
    expect(s?.maxPlayers).toBe(15);
    expect(s?.hlstatsServerId).toBe("13");
  });

  it("nunca inventa um campo — retorna [] pra HTML sem a tabela esperada", () => {
    expect(parseServersHtml("<html><body>manutenção</body></html>")).toEqual([]);
  });
});

describe("parseRankingHtml (fixture real)", () => {
  const rows = parseRankingHtml(playersHtml);

  it("encontra as 50 linhas da página", () => {
    expect(rows).toHaveLength(50);
  });

  it("primeiro colocado bate com o HTML bruto (FLAIRZERA!)", () => {
    const first = rows[0]!;
    expect(first.hlstatsPlayerId).toBe("117");
    expect(first.rank).toBe(1);
    expect(first.nickname).toBe("FLAIRZERA!");
    expect(first.countryCode).toBe("br");
    expect(first.countryName).toBe("Brazil");
    expect(first.skill).toBe(28_749); // não confundir com o "2184 Points" do tooltip
    expect(first.kills).toBe(4031);
    expect(first.deaths).toBe(2206);
    expect(first.kd).toBe(1.83);
    expect(first.headshots).toBe(1854);
    expect(first.hsRate).toBe(0.46);
    expect(first.accuracy).toBe(29.8);
    expect(first.connectionTimeMinutes).toBe(3 * 24 * 60 + 10); // 3d 00:10:03h
  });

  it("todo ID de jogador é único e numérico", () => {
    const ids = rows.map((r) => r.hlstatsPlayerId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(/^\d+$/.test(id)).toBe(true);
  });

  it("nunca inventa um campo — retorna [] pra HTML sem a tabela esperada", () => {
    expect(parseRankingHtml("<html><body>vazio</body></html>")).toEqual([]);
  });
});

describe("parseRankingPageCount", () => {
  it("lê 6 páginas do rodapé real", () => {
    expect(parseRankingPageCount(playersHtml)).toBe(6);
  });

  it("assume 1 página quando não há paginação", () => {
    expect(parseRankingPageCount("<html></html>")).toBe(1);
  });
});
