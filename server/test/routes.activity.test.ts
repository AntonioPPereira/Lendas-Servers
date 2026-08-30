import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { HLStatsService } from "../src/services/HLStatsService.js";
import { SftpDemoService } from "../src/services/SftpDemoService.js";
import { SteamFilterLogService } from "../src/services/SteamFilterLogService.js";
import { SteamAvatarService } from "../src/services/SteamAvatarService.js";
import { SourceBansService } from "../src/services/SourceBansService.js";
import { BASE as SB_BASE, makeFakeSourceBansClient } from "./helpers/fakeSourceBansClient.js";
import { BASE as DEMO_BASE, SAMPLE_TREE, makeFakeClient } from "./helpers/fakeSftpClient.js";
import { BASE, SRV1_LOGS, makeFakeLogClient } from "./helpers/fakeSteamFilterLogClient.js";

const SFTP_CONN = { host: "x", port: 22, username: "u", password: "p", base: DEMO_BASE };
const HLSTATS_CFG = { baseUrl: "http://example.invalid/hlstats.php", game: "css", timeoutMs: 1000 };
const LOG_CONN = { host: "x", port: 22, username: "u", password: "p", base: BASE };

function buildApp(steamFilter: SteamFilterLogService) {
  const hlstats = new HLStatsService(HLSTATS_CFG, 60_000, 60_000);
  const demos = new SftpDemoService(SFTP_CONN, 60_000, () => makeFakeClient({ tree: SAMPLE_TREE }).client);
  const avatars = new SteamAvatarService("", 0);
  return createApp({ demos, hlstats, steamFilter, sourceBans: emptySourceBans(), avatars });
}

/** Bans não são o assunto destes testes: serviço vazio, sem arquivo exportado. */
function emptySourceBans() {
  return new SourceBansService(
    { host: "x", port: 22, username: "u", password: "p", base: SB_BASE },
    0,
    () => makeFakeSourceBansClient().client,
  );
}

describe("GET /api/activity", () => {
  it("mapeia bloqueado/aprovado reais do log pra 'blocked'/'join' com o motivo real", async () => {
    const log = [
      "L 08/25/2026 - 11:59:00: [lendas_steamfilter.smx] Bloqueado Perereca<4><[U:1:1]><> - conta com VAC/game ban",
      "L 08/25/2026 - 12:00:00: [lendas_steamfilter.smx] APROVADO: Coringa<5><[U:1:2]><> passou em todas as checagens.",
    ].join("\n");
    const { client } = makeFakeLogClient({
      dirs: { [SRV1_LOGS]: [{ type: "-", name: "L20260825.log" }] },
      files: { [`${SRV1_LOGS}/L20260825.log`]: log },
    });
    const steamFilter = new SteamFilterLogService(LOG_CONN, 60_000, 60, () => client);

    const res = await request(buildApp(steamFilter)).get("/api/activity").expect(200);

    expect(res.body).toEqual([
      { id: "lsflog-L20260825.log-1", kind: "join", at: "2026-08-25T12:00:00", actor: "Coringa" },
      {
        id: "lsflog-L20260825.log-0",
        kind: "blocked",
        at: "2026-08-25T11:59:00",
        actor: "Perereca",
        detail: "conta com VAC/game ban",
      },
    ]);
  });

  it("nunca emite kind 'leave' — o plugin não loga desconexão", async () => {
    const { client } = makeFakeLogClient({
      dirs: { [SRV1_LOGS]: [{ type: "-", name: "L20260825.log" }] },
      files: {
        [`${SRV1_LOGS}/L20260825.log`]:
          "L 08/25/2026 - 12:00:00: [lendas_steamfilter.smx] APROVADO: X<1><[U:1:1]><> passou em todas as checagens.",
      },
    });
    const steamFilter = new SteamFilterLogService(LOG_CONN, 60_000, 60, () => client);

    const res = await request(buildApp(steamFilter)).get("/api/activity").expect(200);
    expect(res.body.every((e: { kind: string }) => e.kind !== "leave")).toBe(true);
  });

  it("responde vazio (não erro) quando nenhum servidor ainda gerou log", async () => {
    const { client } = makeFakeLogClient({ dirs: {} });
    const steamFilter = new SteamFilterLogService(LOG_CONN, 60_000, 60, () => client);

    const res = await request(buildApp(steamFilter)).get("/api/activity").expect(200);
    expect(res.body).toEqual([]);
  });

  it("responde 503 'sftp_unavailable' quando o SFTP falha e não há cache", async () => {
    const { client } = makeFakeLogClient({ connectError: Object.assign(new Error("x"), { code: "ECONNREFUSED" }) });
    const steamFilter = new SteamFilterLogService(LOG_CONN, 60_000, 60, () => client);

    const res = await request(buildApp(steamFilter)).get("/api/activity").expect(503);
    expect(res.body.error).toBe("sftp_unavailable");
  });
});
