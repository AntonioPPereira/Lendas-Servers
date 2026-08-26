import { describe, expect, it } from "vitest";
import { SteamFilterLogService } from "../src/services/SteamFilterLogService.js";
import { SftpAuthError, SftpUnavailableError } from "../src/errors.js";
import { BASE, SRV1_LOGS, SRV2_LOGS, makeFakeLogClient } from "./helpers/fakeSteamFilterLogClient.js";

const CONN = { host: "104.234.65.248", port: 8822, username: "u", password: "p", base: BASE };

const REAL_LOG = [
  "L 08/25/2026 - 00:02:43: [lendas_steamfilter.smx] Bloqueado MXDELTA<96><[U:1:1841605867]><> - 0h de CS:S (minimo 20h)",
  "L 08/25/2026 - 00:10:00: [lendas_steamfilter.smx] Bloqueado VALAK<98><[U:1:197084473]><> - horas de CS:S nao verificaveis",
  "L 08/24/2026 - 08:14:01: [lendas_steamfilter.smx] APROVADO: vol-0<100><[U:1:483403219]><> passou em todas as checagens.",
].join("\n");

describe("SteamFilterLogService.getRecentEvents", () => {
  it("descobre as duas pastas de servidor e lê o log do dia mais recente de cada uma", async () => {
    const { client } = makeFakeLogClient({
      dirs: {
        [SRV1_LOGS]: [{ type: "-", name: "L20260825.log" }],
        [SRV2_LOGS]: [{ type: "-", name: "L20260825.log" }],
      },
      files: {
        [`${SRV1_LOGS}/L20260825.log`]: REAL_LOG,
        [`${SRV2_LOGS}/L20260825.log`]: "",
      },
    });
    const service = new SteamFilterLogService(CONN, 60_000, 60, () => client);

    const events = await service.getRecentEvents();
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.kind)).toEqual(["blocked", "blocked", "join"]);
    expect(events[0]).toMatchObject({ actor: "VALAK", detail: "horas de CS:S nao verificaveis" });
  });

  it("ignora pastas que não batem o padrão IP_PORTA e diretórios de log ainda inexistentes", async () => {
    const { client } = makeFakeLogClient({
      dirs: {
        [BASE]: [
          { type: "d", name: "104.234.65.244_27800" },
          { type: "d", name: "lost+found" }, // não bate IP_PORTA
        ],
        // 104.234.65.244_27800 nunca teve o plugin rodando: pasta de logs não existe
      },
    });
    const service = new SteamFilterLogService(CONN, 60_000, 60, () => client);

    await expect(service.getRecentEvents()).resolves.toEqual([]);
  });

  it("lê hoje e ontem (RECENT_DAY_FILES=2), ignora logs mais antigos e arquivos que não são o padrão diário", async () => {
    const { client } = makeFakeLogClient({
      dirs: {
        [SRV1_LOGS]: [
          { type: "-", name: "L20260825.log" },
          { type: "-", name: "L20260824.log" },
          { type: "-", name: "L20260801.log" }, // mais antigo — não deve ser lido
          { type: "-", name: "errors_20260825.log" }, // outro tipo de log — ignorado
          { type: "d", name: "subpasta" }, // diretório — ignorado
        ],
      },
      files: {
        [`${SRV1_LOGS}/L20260825.log`]:
          "L 08/25/2026 - 00:00:00: [lendas_steamfilter.smx] APROVADO: A<1><[U:1:1]><> passou em todas as checagens.",
        [`${SRV1_LOGS}/L20260824.log`]:
          "L 08/24/2026 - 00:00:00: [lendas_steamfilter.smx] APROVADO: B<2><[U:1:2]><> passou em todas as checagens.",
        [`${SRV1_LOGS}/L20260801.log`]:
          "L 08/01/2026 - 00:00:00: [lendas_steamfilter.smx] APROVADO: C<3><[U:1:3]><> passou em todas as checagens.",
      },
    });
    const service = new SteamFilterLogService(CONN, 60_000, 60, () => client);

    const events = await service.getRecentEvents();
    expect(events.map((e) => e.actor)).toEqual(["A", "B"]);
  });

  it("respeita o limite configurado", async () => {
    const { client } = makeFakeLogClient({
      dirs: { [SRV1_LOGS]: [{ type: "-", name: "L20260825.log" }] },
      files: { [`${SRV1_LOGS}/L20260825.log`]: REAL_LOG },
    });
    const service = new SteamFilterLogService(CONN, 60_000, 1, () => client);

    expect(await service.getRecentEvents()).toHaveLength(1);
  });

  it("usa cache dentro do TTL: uma segunda chamada não reconecta", async () => {
    const { client, connectCalls } = makeFakeLogClient({
      dirs: { [SRV1_LOGS]: [{ type: "-", name: "L20260825.log" }] },
      files: { [`${SRV1_LOGS}/L20260825.log`]: REAL_LOG },
    });
    const service = new SteamFilterLogService(CONN, 60_000, 60, () => client);

    await service.getRecentEvents();
    await service.getRecentEvents();
    expect(connectCalls()).toBe(1);
  });

  it("cai pro cache velho se o SFTP ficar indisponível depois", async () => {
    let attempt = 0;
    const service = new SteamFilterLogService(CONN, 0, 60, () => {
      attempt += 1;
      if (attempt === 1) {
        return makeFakeLogClient({
          dirs: { [SRV1_LOGS]: [{ type: "-", name: "L20260825.log" }] },
          files: { [`${SRV1_LOGS}/L20260825.log`]: REAL_LOG },
        }).client;
      }
      return makeFakeLogClient({ connectError: new Error("ECONNREFUSED") }).client;
    });

    const first = await service.getRecentEvents();
    const second = await service.getRecentEvents();
    expect(second).toEqual(first);
  });

  it("falha de autenticação sem cache anterior vira SftpAuthError", async () => {
    const { client } = makeFakeLogClient({ connectError: new Error("All configured authentication methods failed") });
    const service = new SteamFilterLogService(CONN, 60_000, 60, () => client);
    await expect(service.getRecentEvents()).rejects.toBeInstanceOf(SftpAuthError);
  });

  it("SFTP inalcançável sem cache anterior vira SftpUnavailableError", async () => {
    const err = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    const { client } = makeFakeLogClient({ connectError: err });
    const service = new SteamFilterLogService(CONN, 60_000, 60, () => client);
    await expect(service.getRecentEvents()).rejects.toBeInstanceOf(SftpUnavailableError);
  });
});
