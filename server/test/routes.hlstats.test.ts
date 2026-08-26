import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { HLStatsService } from "../src/services/HLStatsService.js";
import { SftpDemoService } from "../src/services/SftpDemoService.js";
import { SteamFilterLogService } from "../src/services/SteamFilterLogService.js";
import { SteamAvatarService } from "../src/services/SteamAvatarService.js";
import { BASE, SAMPLE_TREE, makeFakeClient } from "./helpers/fakeSftpClient.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, "fixtures");
const homeHtml = readFileSync(path.join(fixturesDir, "hlstats-home.html"), "utf-8");
const singlePagePlayersHtml = readFileSync(path.join(fixturesDir, "hlstats-players-page1.html"), "utf-8").replace(
  /Page: <b>1<\/b>.*?<\/span>/s,
  "",
);

const CFG = { baseUrl: "http://example.invalid/hlstats.php", game: "css", timeoutMs: 1000 };
const SFTP_CONN = { host: "x", port: 22, username: "u", password: "p", base: BASE };

function buildApp(routes: Record<string, string | Error | { status: number }>) {
  const fetchImpl = vi.fn(async (url: string) => {
    const match = Object.entries(routes).find(([key]) => url.includes(key));
    if (!match) throw new Error(`sem rota no fake fetch: ${url}`);
    const [, value] = match;
    if (value instanceof Error) throw value;
    if (typeof value === "string") return { ok: true, status: 200, text: async () => value };
    return { ok: false, status: value.status, text: async () => "" };
  });
  const hlstats = new HLStatsService(CFG, 60_000, 60_000, fetchImpl as never);
  const demos = new SftpDemoService(SFTP_CONN, 60_000, () => makeFakeClient({ tree: SAMPLE_TREE }).client);
  const steamFilter = new SteamFilterLogService(SFTP_CONN, 60_000, 60);
  const avatars = new SteamAvatarService("", 0);
  return createApp({ demos, hlstats, steamFilter, avatars });
}

describe("GET /api/servers", () => {
  it("lista os dois servidores reais, com ID derivado do nome — nunca inventa ping/uptime", async () => {
    const app = buildApp({ "hlstats.php?game=css": homeHtml });
    const res = await request(app).get("/api/servers").expect(200);

    expect(res.body).toHaveLength(2);
    const srv01 = res.body.find((s: { port: number }) => s.port === 27800);
    expect(srv01).toMatchObject({
      id: "lendas-01",
      host: "104.234.65.244",
      port: 27800,
      status: "online",
      map: "de_inferno",
      players: 12,
      maxPlayers: 15,
    });
    // Campos que a fonte não fornece nunca devem aparecer inventados.
    expect(srv01.ping).toBeUndefined();
    expect(srv01.uptime).toBeUndefined();
    expect(srv01.round).toBeUndefined();
  });

  it("GET /api/servers/:id resolve pelo slug derivado", async () => {
    const app = buildApp({ "hlstats.php?game=css": homeHtml });
    const res = await request(app).get("/api/servers/lendas-02").expect(200);
    expect(res.body.host).toBe("104.234.65.243");
    expect(res.body.port).toBe(27490);
  });

  it("404 pra slug que não existe", async () => {
    const app = buildApp({ "hlstats.php?game=css": homeHtml });
    await request(app).get("/api/servers/lendas-99").expect(404);
  });

  it("503 quando o HLstatsX está fora do ar, sem vazar detalhe de infraestrutura", async () => {
    const app = buildApp({ "hlstats.php?game=css": new Error("ECONNREFUSED") });
    const res = await request(app).get("/api/servers").expect(503);
    expect(res.body.error).toBe("upstream_unavailable");
    expect(JSON.stringify(res.body)).not.toContain("ECONNREFUSED");
  });
});

describe("GET /api/ranking", () => {
  it("lista real, paginada, sem período/temporada (a fonte não oferece isso)", async () => {
    const app = buildApp({ "mode=players": singlePagePlayersHtml });
    const res = await request(app).get("/api/ranking").expect(200);

    expect(res.body.total).toBe(50);
    expect(res.body.items[0]).toMatchObject({
      id: "117",
      rank: 1,
      nickname: "FLAIRZERA!",
      country: { code: "br", name: "Brazil" },
      skill: 28_749,
      kills: 4031,
      deaths: 2206,
      kd: 1.83,
    });
  });

  it("busca por nickname", async () => {
    const app = buildApp({ "mode=players": singlePagePlayersHtml });
    const res = await request(app).get("/api/ranking").query({ q: "tiro" }).expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].nickname).toBe("tiro");
  });

  it("pagina de verdade (pageSize menor que o total)", async () => {
    const app = buildApp({ "mode=players": singlePagePlayersHtml });
    const res = await request(app).get("/api/ranking").query({ page: 2, pageSize: 10 }).expect(200);
    expect(res.body.items).toHaveLength(10);
    expect(res.body.items[0].rank).toBe(11);
  });
});

describe("GET /api/players", () => {
  it("mesma fonte do ranking, mais os agregados pros cards de resumo", async () => {
    const app = buildApp({ "mode=players": singlePagePlayersHtml });
    const res = await request(app).get("/api/players").expect(200);

    expect(res.body.total).toBe(50);
    expect(typeof res.body.totalKills).toBe("number");
    expect(res.body.totalKills).toBeGreaterThan(0);
  });

  it("GET /api/players/:id retorna o jogador real", async () => {
    const app = buildApp({ "mode=players": singlePagePlayersHtml });
    const res = await request(app).get("/api/players/117").expect(200);
    expect(res.body.nickname).toBe("FLAIRZERA!");
  });

  it("404 pra ID que não existe no ranking, sem inventar um jogador", async () => {
    const app = buildApp({ "mode=players": singlePagePlayersHtml });
    const res = await request(app).get("/api/players/999999999").expect(404);
    expect(res.body.error).toBe("not_found");
  });
});
