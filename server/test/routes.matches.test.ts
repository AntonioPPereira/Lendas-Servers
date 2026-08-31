import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { HLStatsService } from "../src/services/HLStatsService.js";
import { SftpDemoService } from "../src/services/SftpDemoService.js";
import { SteamFilterLogService } from "../src/services/SteamFilterLogService.js";
import { SteamAvatarService } from "../src/services/SteamAvatarService.js";
import { SourceBansService } from "../src/services/SourceBansService.js";
import { PlayerDirectoryService } from "../src/services/PlayerDirectoryService.js";
import { PlayerStatsService } from "../src/services/PlayerStatsService.js";
import { MatchesService } from "../src/services/MatchesService.js";
import { BASE as DEMO_BASE, makeFakeClient } from "./helpers/fakeSftpClient.js";

const CONN = { host: "x", port: 22, username: "u", password: "p", base: DEMO_BASE };
const SERVER_DIR = "104.234.65.244_27800";

/** Uma partida no formato exato que o plugin `lendas_matches` escreve. */
function partida(over: Record<string, unknown> = {}) {
  return {
    id: "20260831-1930-de_dust2",
    map: "de_dust2",
    startedAt: 1_788_000_000,
    endedAt: 1_788_003_600,
    ctScore: 16,
    tScore: 12,
    rounds: [
      { n: 1, winner: "CT", reason: "elimination", ct: 1, t: 0 },
      { n: 2, winner: "T", reason: "bomb", ct: 1, t: 1 },
    ],
    players: [
      { steamId64: "76561198041676817", name: "tiro", team: "CT", kills: 25, deaths: 14 },
      { steamId64: "76561198092698710", name: "sliNK", team: "T", kills: 30, deaths: 18 },
    ],
    ...over,
  };
}

/**
 * Árvore de demos com um arquivo cujo nome CASA com o id da partida acima
 * (20260831-1930-de_dust2) e outro que não casa com partida nenhuma.
 */
const DEMOS_DIR = `/${SERVER_DIR}/cstrike/demos`;

const DEMO_TREE: Record<string, Array<{ type: string; name: string; size: number }>> = {
  [DEMO_BASE]: [{ type: "d", name: SERVER_DIR, size: 0 }],
  [DEMOS_DIR]: [{ type: "d", name: "2026-08", size: 0 }],
  [`${DEMOS_DIR}/2026-08`]: [
    { type: "-", name: "20260831-1930-de_dust2.dem", size: 5_000_000 },
    { type: "-", name: "20260801-1200-de_inferno.dem", size: 3_000_000 },
  ],
};

function buildApp(matchesJson: string | null, tree = DEMO_TREE) {
  const demos = new SftpDemoService(CONN, 0, () => makeFakeClient({ tree }).client);
  const matches = new MatchesService(CONN, 0, () => ({
    connect: async () => undefined,
    list: async (p: string) =>
      p === DEMO_BASE ? [{ type: "d", name: SERVER_DIR }] : [],
    get: async () => {
      if (matchesJson === null) throw new Error("ENOENT");
      return Buffer.from(matchesJson, "utf-8");
    },
    end: async () => undefined,
  }));

  return createApp({
    demos,
    matches,
    hlstats: new HLStatsService({ baseUrl: "http://x.invalid", game: "css", timeoutMs: 200 }, 60_000, 60_000),
    steamFilter: new SteamFilterLogService(CONN, 60_000, 60, () => makeFakeClient({ tree: {} }).client as never),
    sourceBans: new SourceBansService(CONN, 0, () => makeFakeClient({ tree: {} }).client as never),
    playerDirectory: new PlayerDirectoryService(CONN, 0, () => makeFakeClient({ tree: {} }).client as never),
    playerStats: new PlayerStatsService(CONN, 0, () => makeFakeClient({ tree: {} }).client as never),
    avatars: new SteamAvatarService("", 0),
  });
}

const comPartida = JSON.stringify({ version: 1, generatedAt: 1, matches: [partida()] });

describe("GET /api/matches", () => {
  it("a partida vem com placar e a gravação casada pelo id", async () => {
    const res = await request(buildApp(comPartida)).get("/api/matches?period=2026-08");

    expect(res.status).toBe(200);
    const item = res.body.items.find((i: { kind: string }) => i.kind === "match");
    expect(item.id).toBe("27800-20260831-1930-de_dust2");
    expect(item.ctScore).toBe(16);
    expect(item.tScore).toBe(12);
    expect(item.roundCount).toBe(2);
    // O vínculo é só o id: nenhum dos dois lados guarda referência ao outro.
    expect(item.demo.filename).toBe("20260831-1930-de_dust2.dem");
  });

  it("gravação sem partida entra na lista sem placar inventado", async () => {
    const res = await request(buildApp(comPartida)).get("/api/matches?period=2026-08");

    const orfa = res.body.items.find((i: { id: string }) => i.id.endsWith("20260801-1200-de_inferno"));
    expect(orfa.kind).toBe("demo");
    // Nunca 0 fingindo empate — o placar simplesmente não existe.
    expect(orfa.ctScore).toBeNull();
    expect(orfa.tScore).toBeNull();
    expect(orfa.roundCount).toBeNull();
    expect(orfa.demo.filename).toBe("20260801-1200-de_inferno.dem");
  });

  it("sem o plugin instalado, as 587 gravações antigas continuam aparecendo", async () => {
    const res = await request(buildApp(null)).get("/api/matches?period=2026-08");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.every((i: { kind: string }) => i.kind === "demo")).toBe(true);
    expect(res.body.withScore).toBe(0);
  });

  it("mais recente primeiro, misturando partida e gravação órfã", async () => {
    const res = await request(buildApp(comPartida)).get("/api/matches?period=2026-08");
    const datas = res.body.items.map((i: { startedAt: string }) => i.startedAt);
    expect([...datas].sort().reverse()).toEqual(datas);
  });

  it("filtra por mapa", async () => {
    const res = await request(buildApp(comPartida)).get("/api/matches?period=2026-08&map=de_inferno");
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].map).toBe("de_inferno");
  });

  it("partida sem round é descartada: é warmup ou troca de mapa, não partida", async () => {
    const json = JSON.stringify({ matches: [partida({ rounds: [] })] });
    const res = await request(buildApp(json)).get("/api/matches?period=2026-08");
    expect(res.body.withScore).toBe(0);
  });

  it("partida malformada não derruba a rota nem entra pela metade", async () => {
    const json = JSON.stringify({ matches: [partida(), { id: "lixo" }, null] });
    const res = await request(buildApp(json)).get("/api/matches?period=2026-08");
    expect(res.status).toBe(200);
    expect(res.body.withScore).toBe(1);
  });

  it("JSON corrompido não derruba a rota", async () => {
    const res = await request(buildApp("{{{ não é json")).get("/api/matches?period=2026-08");
    expect(res.status).toBe(200);
    expect(res.body.withScore).toBe(0);
  });
});

describe("GET /api/matches/:id", () => {
  it("traz rounds e o scoreboard ordenado por abates", async () => {
    const res = await request(buildApp(comPartida)).get("/api/matches/27800-20260831-1930-de_dust2");

    expect(res.status).toBe(200);
    expect(res.body.rounds).toHaveLength(2);
    expect(res.body.rounds[1]).toMatchObject({ winner: "T", reason: "bomb" });
    expect(res.body.players.map((p: { name: string }) => p.name)).toEqual(["sliNK", "tiro"]);
  });

  it("id inexistente vira 404, não lista vazia", async () => {
    const res = await request(buildApp(comPartida)).get("/api/matches/27800-20260101-0000-de_nuke");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/matches/maps", () => {
  it("lista os mapas que existem no acervo, não uma lista fixa", async () => {
    const res = await request(buildApp(comPartida)).get("/api/matches/maps");
    expect(res.body.items).toEqual(["de_dust2", "de_inferno"]);
  });
});
