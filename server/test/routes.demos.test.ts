import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { SftpDemoService } from "../src/services/SftpDemoService.js";
import { HLStatsService } from "../src/services/HLStatsService.js";
import { SteamFilterLogService } from "../src/services/SteamFilterLogService.js";
import { SteamAvatarService } from "../src/services/SteamAvatarService.js";
import { SourceBansService } from "../src/services/SourceBansService.js";
import { PlayerDirectoryService } from "../src/services/PlayerDirectoryService.js";
import { PlayerStatsService } from "../src/services/PlayerStatsService.js";
import { BASE as SB_BASE, makeFakeSourceBansClient } from "./helpers/fakeSourceBansClient.js";
import { BASE, SAMPLE_IDS_BY_RECENCY, SAMPLE_TREE, makeFakeClient } from "./helpers/fakeSftpClient.js";

const CONN = { host: "104.234.65.248", port: 8822, username: "u", password: "p", base: BASE };

// Estas rotas nunca chamam hlstats/steamFilter/avatars — instâncias reais,
// sem I/O até o primeiro uso, então é seguro usar aqui sem mockar nada.
const hlstats = new HLStatsService(
  { baseUrl: "http://example.invalid/hlstats.php", game: "css", timeoutMs: 1000 },
  60_000,
  60_000,
);
const steamFilter = new SteamFilterLogService(CONN, 60_000, 60);
const avatars = new SteamAvatarService("", 0);

function buildApp(opts: Parameters<typeof makeFakeClient>[0] = { tree: SAMPLE_TREE }) {
  const { client, connectCalls } = makeFakeClient(opts);
  const service = new SftpDemoService(CONN, 60_000, () => client);
  return { app: createApp({ demos: service, hlstats, steamFilter, sourceBans: emptySourceBans(), playerDirectory: emptyPlayerDirectory(), playerStats: emptyPlayerStats(), avatars }), connectCalls };
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

describe("GET /api/demos", () => {
  it("responde a listagem paginada no formato acordado com o frontend, escopada por período", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/api/demos").query({ period: "2026-08" }).expect(200);

    // 2026-08 tem 3 das 4 demos da fixture — a de 2026-07 (inferno) fica de fora sem pedir esse período.
    expect(res.body.total).toBe(3);
    expect(res.body.period).toBe("2026-08");
    expect(res.body.items.map((d: { id: string }) => d.id)).toEqual([
      "27490-20260801-1900-de_mirage_csgo_v2",
      "27800-20260801-1646-de_dust2",
      "27800-20260801-1643-de_tuscan",
    ]);
    expect(res.body.items[1]).toEqual({
      id: "27800-20260801-1646-de_dust2",
      filename: "20260801-1646-de_dust2.dem",
      map: "de_dust2",
      date: "2026-08-01",
      time: "16:46",
      recordedAt: "2026-08-01T16:46:00",
      size: 13,
      server: "104.234.65.244:27800",
    });
  });

  it("sem period, cai no mês corrente — nunca varre o histórico inteiro", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T12:00:00Z"));
    try {
      const { app } = buildApp();
      const res = await request(app).get("/api/demos").expect(200);

      expect(res.body.period).toBe("2026-07");
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].id).toBe("27800-20260715-2010-de_inferno");
    } finally {
      vi.useRealTimers();
    }
  });

  it("filtra por mapa, por servidor e por busca textual, dentro do período pedido", async () => {
    const { app } = buildApp();

    const byMap = await request(app)
      .get("/api/demos")
      .query({ period: "2026-08", map: "de_tuscan" })
      .expect(200);
    expect(byMap.body.items).toHaveLength(1);
    expect(byMap.body.items[0].map).toBe("de_tuscan");

    const byServer = await request(app)
      .get("/api/demos")
      .query({ period: "2026-08", server: "104.234.65.243:27490" })
      .expect(200);
    expect(byServer.body.items).toHaveLength(1);
    expect(byServer.body.items[0].id).toBe("27490-20260801-1900-de_mirage_csgo_v2");

    const byQuery = await request(app)
      .get("/api/demos")
      .query({ period: "2026-07", q: "inferno" })
      .expect(200);
    expect(byQuery.body.items).toHaveLength(1);
    expect(byQuery.body.items[0].id).toBe("27800-20260715-2010-de_inferno");
  });

  it("400 pra period em formato inválido", async () => {
    const { app } = buildApp();
    await request(app).get("/api/demos").query({ period: "agosto-2026" }).expect(400);
  });
});

describe("GET /api/demos/periods", () => {
  it("lista os períodos existentes entre todos os servidores, mais recente primeiro, sem descer nos arquivos", async () => {
    const { app, connectCalls } = buildApp();
    const res = await request(app).get("/api/demos/periods").expect(200);

    expect(res.body.items).toEqual(["2026-08", "2026-07"]);
    expect(typeof res.body.current).toBe("string");
    // Só uma conexão: descobre as raízes e lista o topo de cada uma, nunca entra nos meses.
    expect(connectCalls()).toBe(1);
  });
});

describe("GET /api/demos/:id", () => {
  it("404 pra ID bem formado mas inexistente", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/api/demos/27800-20261231-2359-de_never_existed").expect(404);
    expect(res.body.error).toBe("not_found");
  });

  it("404 pra ID bem formado cuja porta não corresponde a nenhum servidor conhecido", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/api/demos/99999-20260801-1646-de_dust2").expect(404);
    expect(res.body.error).toBe("not_found");
  });

  it("400 e nunca conecta no SFTP para tentativa de path traversal", async () => {
    const { app, connectCalls } = buildApp();

    const res = await request(app)
      .get("/api/demos/" + encodeURIComponent("../../../../etc/passwd"))
      .expect(400);

    expect(res.body.error).toBe("invalid_id");
    expect(connectCalls()).toBe(0);
  });

  it("400 para tentativa de contrabandear outra extensão", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/api/demos/27800-20260801-1646-de_dust2.exe").expect(400);
    expect(res.body.error).toBe("invalid_id");
  });
});

describe("GET /api/demos/:id/download", () => {
  it("transmite o arquivo com os headers corretos", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .get("/api/demos/27800-20260801-1646-de_dust2/download")
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(res.headers["content-type"]).toBe("application/octet-stream");
    expect(res.headers["content-disposition"]).toBe(
      'attachment; filename="20260801-1646-de_dust2.dem"',
    );
    expect(res.headers["content-length"]).toBe("13");
    expect((res.body as Buffer).toString()).toBe("conteudo-fake");
  });

  it("404 pra ID inexistente, sem vazar caminho interno na resposta", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .get("/api/demos/27800-20261231-2359-de_never_existed/download")
      .expect(404);
    expect(JSON.stringify(res.body)).not.toContain("104.234.65.244_27800");
  });

  it("400 pra path traversal no id do download", async () => {
    const { app } = buildApp();
    await request(app)
      .get("/api/demos/" + encodeURIComponent("../../../../etc/passwd") + "/download")
      .expect(400);
  });
});

describe("resiliência a SFTP indisponível", () => {
  it("503 com mensagem genérica, sem vazar host/credenciais", async () => {
    const { app } = buildApp({
      tree: {},
      connectError: Object.assign(new Error("connect ECONNREFUSED 104.234.65.248:8822"), {
        code: "ECONNREFUSED",
      }),
    });

    const res = await request(app).get("/api/demos").expect(503);
    expect(res.body.error).toBe("sftp_unavailable");
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("104.234.65.248");
    expect(body).not.toContain("8822");
  });

  it("502 quando a autenticação falha, sem vazar a mensagem crua do ssh2", async () => {
    const { app } = buildApp({
      tree: {},
      connectError: new Error("All configured authentication methods failed"),
    });

    const res = await request(app).get("/api/demos").expect(502);
    expect(res.body.error).toBe("sftp_auth_failed");
  });
});
