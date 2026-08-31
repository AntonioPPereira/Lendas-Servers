import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { MatchesService } from "../src/services/MatchesService.js";
import { HLStatsService } from "../src/services/HLStatsService.js";
import { SftpDemoService } from "../src/services/SftpDemoService.js";
import { SteamFilterLogService } from "../src/services/SteamFilterLogService.js";
import { SteamAvatarService } from "../src/services/SteamAvatarService.js";
import { SourceBansService } from "../src/services/SourceBansService.js";
import { PlayerDirectoryService } from "../src/services/PlayerDirectoryService.js";
import { PlayerStatsService } from "../src/services/PlayerStatsService.js";
import { BASE as SB_BASE, makeFakeSourceBansClient } from "./helpers/fakeSourceBansClient.js";
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
const LIVE_TOKEN = "s3gredo-de-teste";

function buildApp(
  routes: Record<string, string | Error | { status: number }>,
  opts: { avatarFetchImpl?: typeof fetch; liveApiToken?: string } = {},
) {
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
  const avatars = new SteamAvatarService(opts.avatarFetchImpl ? "KEY" : "", 3_600_000, opts.avatarFetchImpl as never);
  return createApp(
    { demos, hlstats, steamFilter, sourceBans: emptySourceBans(), playerDirectory: emptyPlayerDirectory(), playerStats: emptyPlayerStats(), avatars, matches: emptyMatches() },
    { liveApiToken: opts.liveApiToken ?? LIVE_TOKEN },
  );
}

/** Bans não são o assunto destes testes: serviço vazio, sem arquivo exportado. */
function emptySourceBans() {
  return new SourceBansService(
    { host: "x", port: 22, username: "u", password: "p", base: SB_BASE },
    0,
    () => makeFakeSourceBansClient().client,
  );
}

/** Índice nick->SteamID64 vazio: avatar não é o assunto destes testes. */
function emptyPlayerDirectory() {
  return new PlayerDirectoryService(
    { host: "x", port: 22, username: "u", password: "p", base: SB_BASE },
    0,
    () => makeFakeSourceBansClient().client,
  );
}

/** Contagem por jogador vazia: pódios não são o assunto destes testes. */
function emptyPlayerStats() {
  return new PlayerStatsService(
    { host: "x", port: 22, username: "u", password: "p", base: SB_BASE },
    0,
    () => makeFakeSourceBansClient().client,
  );
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

describe("avatar real cruzado com o live (nickname -> SteamID64 -> Steam Web API)", () => {
  const LIVE_STEAM_ID = "76561198009634211";
  const T = "2026-08-26T22:00:00.000Z";

  function fakeAvatarFetch() {
    return vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        response: { players: [{ steamid: LIVE_STEAM_ID, avatarfull: "https://avatars.example/tiro.jpg" }] },
      }),
    }));
  }

  it("nickname do HLstatsX que já apareceu ao vivo ganha o avatar real no ranking e em /api/players", async () => {
    const app = buildApp({ "mode=players": singlePagePlayersHtml }, { avatarFetchImpl: fakeAvatarFetch() as never });

    await request(app)
      .post("/api/live/events")
      .set("Authorization", `Bearer ${LIVE_TOKEN}`)
      .send({
        serverId: "srv1",
        events: [
          { kind: "player_connect", steamId64: LIVE_STEAM_ID, steamId: "STEAM_1:0:1", nickname: "tiro", userId: 1, timestamp: T },
        ],
      })
      .expect(202);

    await vi.waitFor(async () => {
      const res = await request(app).get("/api/ranking").query({ q: "tiro" }).expect(200);
      expect(res.body.items[0].avatarUrl).toBe("https://avatars.example/tiro.jpg");
    });

    const players = await request(app).get("/api/players").query({ q: "tiro" }).expect(200);
    expect(players.body.items[0].avatarUrl).toBe("https://avatars.example/tiro.jpg");
  });

  it("nickname que nunca apareceu ao vivo não ganha avatar inventado", async () => {
    const app = buildApp({ "mode=players": singlePagePlayersHtml }, { avatarFetchImpl: fakeAvatarFetch() as never });

    const res = await request(app).get("/api/ranking").query({ q: "tiro" }).expect(200);
    expect(res.body.items[0].avatarUrl).toBeUndefined();
  });
});

describe("ordem da lista de servidores", () => {
  it("Servidor 01 vem antes do 02, mesmo o HLstatsX listando ao contrário", async () => {
    const app = buildApp({ "hlstats.php?game=css": homeHtml });
    const res = await request(app).get("/api/servers").expect(200);
    expect(res.body.map((s: { id: string }) => s.id)).toEqual(["lendas-01", "lendas-02"]);
  });
});

/** Sem arquivo de partidas: estas rotas não são o assunto destes testes. */
function emptyMatches() {
  return new MatchesService(
    { host: "x", port: 22, username: "u", password: "p", base: "/" },
    0,
    () => ({
      connect: async () => undefined,
      list: async () => [],
      get: async () => Buffer.from(""),
      end: async () => undefined,
    }),
  );
}
