import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { HLStatsService } from "../src/services/HLStatsService.js";
import { SftpDemoService } from "../src/services/SftpDemoService.js";
import { SteamFilterLogService } from "../src/services/SteamFilterLogService.js";
import { SteamAvatarService } from "../src/services/SteamAvatarService.js";
import { BASE, SAMPLE_TREE, makeFakeClient } from "./helpers/fakeSftpClient.js";

const CONN = { host: "x", port: 22, username: "u", password: "p", base: BASE };
const HLSTATS_CFG = { baseUrl: "http://example.invalid/hlstats.php", game: "css", timeoutMs: 1000 };
const TOKEN = "s3gredo-de-teste";

const T = "2026-08-25T22:00:00.000Z";
const ID_A = "76561198009634211";

function buildApp(opts: { token?: string; fetchImpl?: typeof fetch } = {}) {
  const hlstats = new HLStatsService(HLSTATS_CFG, 60_000, 60_000);
  const demos = new SftpDemoService(CONN, 60_000, () => makeFakeClient({ tree: SAMPLE_TREE }).client);
  const steamFilter = new SteamFilterLogService(CONN, 60_000, 60);
  const avatars = new SteamAvatarService(opts.fetchImpl ? "KEY" : "", 3_600_000, opts.fetchImpl as never);
  return createApp({ demos, hlstats, steamFilter, avatars }, { liveApiToken: opts.token ?? TOKEN, liveStaleMs: 30_000 });
}

const servers: http.Server[] = [];
afterEach(() => {
  while (servers.length) servers.pop()!.close();
});

/** supertest não é confiável pra streams longos — sobe um server real efêmero e lê com http puro. */
function listen(app: ReturnType<typeof buildApp>): Promise<{ port: number }> {
  const server = http.createServer(app);
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ port: (server.address() as AddressInfo).port }));
  });
}

/** Lê os primeiros `waitForBytes` bytes (ou até `timeoutMs`) de `GET /api/live/stream` e fecha a conexão. */
function readSseChunk(port: number, timeoutMs = 500): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/api/live/stream" }, (res) => {
      let buffer = "";
      res.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf-8");
      });
      setTimeout(() => {
        req.destroy();
        resolve(buffer);
      }, timeoutMs);
    });
    req.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code !== "ECONNRESET") reject(err);
    });
  });
}

describe("POST /api/live/events — autenticação", () => {
  it("503 quando LIVE_API_TOKEN não está configurado", async () => {
    const app = buildApp({ token: "" });
    const res = await request(app)
      .post("/api/live/events")
      .send({ serverId: "srv1", events: [{ kind: "bomb_planted", timestamp: T }] });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("live_ingest_not_configured");
  });

  it("401 sem header Authorization", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/live/events")
      .send({ serverId: "srv1", events: [{ kind: "bomb_planted", timestamp: T }] });
    expect(res.status).toBe(401);
  });

  it("401 com token errado", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/live/events")
      .set("Authorization", "Bearer token-errado")
      .send({ serverId: "srv1", events: [{ kind: "bomb_planted", timestamp: T }] });
    expect(res.status).toBe(401);
  });

  it("aceita com o token certo", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/live/events")
      .set("Authorization", `Bearer ${TOKEN}`)
      .send({ serverId: "srv1", events: [{ kind: "bomb_planted", timestamp: T }] });
    expect(res.status).toBe(202);
  });
});

describe("POST /api/live/events — validação", () => {
  it("400 pra payload que não bate o schema", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/live/events")
      .set("Authorization", `Bearer ${TOKEN}`)
      .send({ serverId: "srv1", events: [{ kind: "coisa_invalida" }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_payload");
  });

  it("400 pra SteamID64 malformado — nunca aplicado ao estado", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/live/events")
      .set("Authorization", `Bearer ${TOKEN}`)
      .send({
        serverId: "srv1",
        events: [{ kind: "player_connect", steamId64: "não-é-steamid", steamId: "s", nickname: "x", userId: 1, timestamp: T }],
      });
    expect(res.status).toBe(400);
  });
});

describe("live: ingestão -> estado -> stream", () => {
  it("um snapshot aceito aparece no primeiro frame de quem conecta no stream depois", async () => {
    const app = buildApp();
    const { port } = await listen(app);

    await request(app)
      .post("/api/live/events")
      .set("Authorization", `Bearer ${TOKEN}`)
      .send({
        serverId: "srv1",
        events: [
          {
            kind: "server_snapshot",
            hostname: "Servidor 01",
            map: "de_dust2",
            players: 5,
            maxPlayers: 15,
            ctScore: 2,
            tScore: 1,
            timestamp: T,
          },
        ],
      })
      .expect(202);

    const chunk = await readSseChunk(port);
    const match = chunk.match(/data: (.+)\n\n/);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]!);
    expect(parsed).toMatchObject({ type: "match", payload: { serverId: "srv1", map: "de_dust2", ctScore: 2, tScore: 1 } });
  });

  it("dispara resolução de avatar pro SteamID64 recebido, sem bloquear a resposta do POST", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ response: { players: [{ steamid: ID_A, avatarfull: "https://avatars.example/a.jpg" }] } }),
    }));
    const app = buildApp({ fetchImpl: fetchImpl as never });

    await request(app)
      .post("/api/live/events")
      .set("Authorization", `Bearer ${TOKEN}`)
      .send({
        serverId: "srv1",
        events: [{ kind: "player_connect", steamId64: ID_A, steamId: "STEAM_1:0:1", nickname: "Coringa", userId: 1, timestamp: T }],
      })
      .expect(202);

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());
  });
});

describe("GET /api/live/stream", () => {
  it("sem nenhum servidor reportando ainda, manda só o comentário de abertura (sem frame de match)", async () => {
    const app = buildApp();
    const { port } = await listen(app);

    const chunk = await readSseChunk(port);
    expect(chunk).toContain(":ok");
    expect(chunk).not.toContain('"type":"match"');
  });
});
