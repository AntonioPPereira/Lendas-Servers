import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { HLStatsService } from "../src/services/HLStatsService.js";
import { HLStatsParseError, HLStatsUnavailableError } from "../src/errors.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, "fixtures");
const homeHtml = readFileSync(path.join(fixturesDir, "hlstats-home.html"), "utf-8");
const playersHtml = readFileSync(path.join(fixturesDir, "hlstats-players-page1.html"), "utf-8");

const CFG = { baseUrl: "http://example.invalid/hlstats.php", game: "css", timeoutMs: 1000 };

function okResponse(text: string) {
  return { ok: true, status: 200, text: async () => text };
}

/** Fake fetch: roteia por URL, sem rede nenhuma. */
function makeFakeFetch(routes: Record<string, string | Error | { status: number }>) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (url: string) => {
    calls.push(url);
    const match = Object.entries(routes).find(([key]) => url.includes(key));
    if (!match) throw new Error(`URL sem rota no fake fetch: ${url}`);
    const [, value] = match;
    if (value instanceof Error) throw value;
    if (typeof value === "string") return okResponse(value);
    return { ok: false, status: value.status, text: async () => "" };
  });
  return { fetchImpl, calls };
}

describe("HLStatsService.getServers", () => {
  it("retorna os servidores parseados da página real", async () => {
    const { fetchImpl } = makeFakeFetch({ "hlstats.php?game=css": homeHtml });
    const service = new HLStatsService(CFG, 60_000, 60_000, fetchImpl as never);

    const servers = await service.getServers();
    expect(servers).toHaveLength(2);
    expect(servers.map((s) => s.port).sort()).toEqual([27490, 27800]);
  });

  it("usa cache dentro do TTL: uma segunda chamada não refaz a requisição", async () => {
    const { fetchImpl } = makeFakeFetch({ "hlstats.php?game=css": homeHtml });
    const service = new HLStatsService(CFG, 60_000, 60_000, fetchImpl as never);

    await service.getServers();
    await service.getServers();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("cai pro cache velho se o HLstatsX ficar indisponível depois", async () => {
    let attempt = 0;
    const fetchImpl = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) return okResponse(homeHtml);
      throw new Error("network down");
    });
    const service = new HLStatsService(CFG, 0, 60_000, fetchImpl as never);

    const first = await service.getServers();
    const second = await service.getServers();
    expect(second).toEqual(first);
  });

  it("HTTP não-2xx vira HLStatsUnavailableError", async () => {
    const { fetchImpl } = makeFakeFetch({ "hlstats.php?game=css": { status: 503 } });
    const service = new HLStatsService(CFG, 60_000, 60_000, fetchImpl as never);
    await expect(service.getServers()).rejects.toBeInstanceOf(HLStatsUnavailableError);
  });

  it("erro de rede vira HLStatsUnavailableError", async () => {
    const { fetchImpl } = makeFakeFetch({ "hlstats.php?game=css": new Error("ECONNREFUSED") });
    const service = new HLStatsService(CFG, 60_000, 60_000, fetchImpl as never);
    await expect(service.getServers()).rejects.toBeInstanceOf(HLStatsUnavailableError);
  });

  it("HTML sem a tabela esperada vira HLStatsParseError", async () => {
    const { fetchImpl } = makeFakeFetch({ "hlstats.php?game=css": "<html>manutenção</html>" });
    const service = new HLStatsService(CFG, 60_000, 60_000, fetchImpl as never);
    await expect(service.getServers()).rejects.toBeInstanceOf(HLStatsParseError);
  });
});

describe("HLStatsService.getRanking", () => {
  it("busca só 1 página quando não há paginação", async () => {
    const single = playersHtml.replace(/Page: <b>1<\/b>.*?<\/span>/s, "");
    const { fetchImpl, calls } = makeFakeFetch({ "mode=players": single });
    const service = new HLStatsService(CFG, 60_000, 60_000, fetchImpl as never);

    const rows = await service.getRanking();
    expect(rows).toHaveLength(50);
    expect(calls).toHaveLength(1);
  });

  it("busca todas as páginas do rodapé de paginação e junta os resultados", async () => {
    const { fetchImpl, calls } = makeFakeFetch({
      "page=2": playersHtml, // reaproveita o mesmo fixture só pra provar que a 2ª página é buscada
      "mode=players&game=css": playersHtml, // primeira página (sem &page=)
    });
    const service = new HLStatsService(CFG, 60_000, 60_000, fetchImpl as never);

    const rows = await service.getRanking();
    // 6 páginas no fixture real × 50 linhas cada (mesmo fixture reaproveitado em todas)
    expect(rows).toHaveLength(50 * 6);
    expect(calls).toHaveLength(6);
    expect(calls[1]).toContain("page=2");
    expect(calls[5]).toContain("page=6");
  });
});

describe("HLStatsService.getPlayer", () => {
  it("acha um jogador real pelo ID sem disparar requisição extra (reaproveita o cache do ranking)", async () => {
    const single = playersHtml.replace(/Page: <b>1<\/b>.*?<\/span>/s, "");
    const { fetchImpl, calls } = makeFakeFetch({ "mode=players": single });
    const service = new HLStatsService(CFG, 60_000, 60_000, fetchImpl as never);

    const player = await service.getPlayer("117");
    expect(player?.nickname).toBe("FLAIRZERA!");

    await service.getPlayer("10"); // segunda busca, mesmo cache
    expect(calls).toHaveLength(1);
  });

  it("retorna null pra ID que não existe no ranking", async () => {
    const single = playersHtml.replace(/Page: <b>1<\/b>.*?<\/span>/s, "");
    const { fetchImpl } = makeFakeFetch({ "mode=players": single });
    const service = new HLStatsService(CFG, 60_000, 60_000, fetchImpl as never);

    expect(await service.getPlayer("999999999")).toBeNull();
  });
});
