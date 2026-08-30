import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { HLStatsService } from "../src/services/HLStatsService.js";
import { SftpDemoService } from "../src/services/SftpDemoService.js";
import { SteamFilterLogService } from "../src/services/SteamFilterLogService.js";
import { SteamAvatarService } from "../src/services/SteamAvatarService.js";
import { SourceBansService } from "../src/services/SourceBansService.js";
import { BASE as DEMO_BASE, SAMPLE_TREE, makeFakeClient } from "./helpers/fakeSftpClient.js";
import { BASE as LOG_BASE, makeFakeLogClient } from "./helpers/fakeSteamFilterLogClient.js";
import {
  BASE as SB_BASE,
  SERVER_DIRS,
  makeExport,
  makeFakeSourceBansClient,
} from "./helpers/fakeSourceBansClient.js";

const AGORA_S = Math.floor(Date.now() / 1000);

/** Uma linha no formato exato que o plugin `lendas_bans` escreve. */
function row(over: Record<string, unknown> = {}) {
  return {
    kind: "ban",
    bid: 1,
    authid: "STEAM_0:1:52341",
    name: "jogador",
    created: AGORA_S - 3600,
    ends: AGORA_S + 3600,
    length: 7200,
    reason: "Aimbot",
    country: "BR",
    removeType: "",
    admin: "Kangaceiroz",
    server: "104.234.65.244:27800",
    commType: 0,
    ipMasked: "189.45.x.x",
    ...over,
  };
}

function buildApp(files: Record<string, string>) {
  const hlstats = new HLStatsService(
    { baseUrl: "http://example.invalid/hlstats.php", game: "css", timeoutMs: 500 },
    60_000,
    60_000,
  );
  const demos = new SftpDemoService(
    { host: "x", port: 22, username: "u", password: "p", base: DEMO_BASE },
    60_000,
    () => makeFakeClient({ tree: SAMPLE_TREE }).client,
  );
  const steamFilter = new SteamFilterLogService(
    { host: "x", port: 22, username: "u", password: "p", base: LOG_BASE },
    60_000,
    50,
    () => makeFakeLogClient({}).client,
  );
  const sourceBans = new SourceBansService(
    { host: "x", port: 22, username: "u", password: "p", base: SB_BASE },
    0,
    () => makeFakeSourceBansClient({ files }).client,
  );
  const avatars = new SteamAvatarService("", 0);
  return createApp({ demos, hlstats, steamFilter, sourceBans, avatars });
}

describe("GET /api/bans", () => {
  it("devolve os bans reais exportados pelo plugin, já traduzidos", async () => {
    const app = buildApp({ [SERVER_DIRS[0]!]: makeExport([row()]) });

    const res = await request(app).get("/api/bans");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    const ban = res.body.items[0];
    expect(ban.id).toBe("b1");
    expect(ban.target.steamId64).toBe("76561197960370411");
    expect(ban.state).toBe("active");
    expect(ban.ipMasked).toBe("189.45.x.x");
  });

  it("um servidor sem o plugin instalado não quebra a rota", async () => {
    // Só o Servidor 01 tem o arquivo; o 02 nem existe pro SFTP falso.
    const app = buildApp({ [SERVER_DIRS[0]!]: makeExport([row(), row({ bid: 2 })]) });
    const res = await request(app).get("/api/bans");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });

  it("nenhum export em lugar nenhum devolve lista vazia, não erro", async () => {
    const res = await request(buildApp({})).get("/api/bans");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ items: [], total: 0 });
  });

  it("JSON corrompido não derruba a rota", async () => {
    const res = await request(buildApp({ [SERVER_DIRS[0]!]: "{ isto nao e json" })).get("/api/bans");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it("filtra por estado", async () => {
    const app = buildApp({
      [SERVER_DIRS[0]!]: makeExport([
        row({ bid: 1 }),
        row({ bid: 2, length: 0, ends: 0 }),
        row({ bid: 3, ends: AGORA_S - 10 }),
      ]),
    });

    const perm = await request(app).get("/api/bans?state=permanent");
    expect(perm.body.total).toBe(1);
    expect(perm.body.items[0].id).toBe("b2");

    const exp = await request(app).get("/api/bans?state=expired");
    expect(exp.body.total).toBe(1);
    expect(exp.body.items[0].id).toBe("b3");
  });

  it("busca por nick e por SteamID", async () => {
    const app = buildApp({
      [SERVER_DIRS[0]!]: makeExport([row({ bid: 1, name: "Fulano" }), row({ bid: 2, name: "Sicrano" })]),
    });

    const porNick = await request(app).get("/api/bans?q=sicr");
    expect(porNick.body.total).toBe(1);
    expect(porNick.body.items[0].target.nickname).toBe("Sicrano");

    const porId = await request(app).get("/api/bans?q=76561197960370411");
    expect(porId.body.total).toBe(2);
  });

  it("pagina sem perder o total", async () => {
    const muitos = Array.from({ length: 30 }, (_, i) => row({ bid: i + 1, created: AGORA_S - i }));
    const app = buildApp({ [SERVER_DIRS[0]!]: makeExport(muitos) });

    const p1 = await request(app).get("/api/bans?page=1&pageSize=12");
    expect(p1.body.items).toHaveLength(12);
    expect(p1.body.total).toBe(30);

    const p3 = await request(app).get("/api/bans?page=3&pageSize=12");
    expect(p3.body.items).toHaveLength(6);
  });

  it("ordena do mais recente pro mais antigo", async () => {
    const app = buildApp({
      [SERVER_DIRS[0]!]: makeExport([
        row({ bid: 1, created: AGORA_S - 9000 }),
        row({ bid: 2, created: AGORA_S - 10 }),
      ]),
    });
    const res = await request(app).get("/api/bans");
    expect(res.body.items.map((b: { id: string }) => b.id)).toEqual(["b2", "b1"]);
  });

  it("rejeita estado inválido em vez de ignorar em silêncio", async () => {
    const res = await request(buildApp({})).get("/api/bans?state=qualquer");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/bans/summary", () => {
  it("conta por estado e informa quando o export foi gerado", async () => {
    const app = buildApp({
      [SERVER_DIRS[0]!]: makeExport(
        [row({ bid: 1 }), row({ bid: 2, length: 0, ends: 0 }), row({ bid: 3, removeType: "U" })],
        1_788_000_000,
      ),
    });

    const res = await request(app).get("/api/bans/summary");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ all: 3, active: 1, permanent: 1, expired: 1 });
    expect(res.body.generatedAt).toBe(new Date(1_788_000_000 * 1000).toISOString());
  });
});
