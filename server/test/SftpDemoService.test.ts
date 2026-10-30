import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { SftpDemoService } from "../src/services/SftpDemoService.js";
import { DemoNotFoundError, InvalidDemoIdError, SftpAuthError, SftpUnavailableError } from "../src/errors.js";
import { BASE, SAMPLE_IDS_BY_RECENCY, SAMPLE_TREE, makeFakeClient } from "./helpers/fakeSftpClient.js";

const CONN = { host: "104.234.65.248", port: 8822, username: "u", password: "p", base: BASE };

describe("SftpDemoService.listDemos", () => {
  it("descobre os dois servidores sozinho e lista só o período pedido / arquivos .dem, mais recente primeiro", async () => {
    const { client } = makeFakeClient({ tree: SAMPLE_TREE });
    const service = new SftpDemoService(CONN, 60_000, () => client);

    const demos = await service.listDemos("2026-08");

    // Só as 3 de agosto — a de julho (inferno) fica de fora sem pedir esse período.
    expect(demos.map((d) => d.id)).toEqual(SAMPLE_IDS_BY_RECENCY.filter((id) => !id.includes("de_inferno")));
    expect(demos[0]?.server).toBe("104.234.65.243:27490"); // o mais recente é do 2º servidor
    expect(demos[1]?.server).toBe("104.234.65.244:27800");
    expect(demos[1]?.sizeBytes).toBe(13);
    expect(demos[1]?.map).toBe("de_dust2");
    expect(demos[1]?.date).toBe("2026-08-01");
    expect(demos[1]?.time).toBe("16:46");
  });

  it("um período diferente traz só o que está naquela pasta", async () => {
    const { client } = makeFakeClient({ tree: SAMPLE_TREE });
    const service = new SftpDemoService(CONN, 60_000, () => client);

    const demos = await service.listDemos("2026-07");
    expect(demos.map((d) => d.id)).toEqual(["27800-20260715-2010-de_inferno"]);
  });

  it("período sem nenhuma demo em nenhum servidor volta lista vazia, não erro", async () => {
    const { client } = makeFakeClient({ tree: SAMPLE_TREE });
    const service = new SftpDemoService(CONN, 60_000, () => client);

    const demos = await service.listDemos("2020-01");
    expect(demos).toEqual([]);
  });

  it("usa cache dentro do TTL: uma segunda chamada pro MESMO período não reconecta", async () => {
    const factory = vi.fn(() => makeFakeClient({ tree: SAMPLE_TREE }).client);
    const service = new SftpDemoService(CONN, 60_000, factory);

    await service.listDemos("2026-08");
    await service.listDemos("2026-08");

    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("cada período tem seu próprio cache — pedir outro período sempre reconecta", async () => {
    const factory = vi.fn(() => makeFakeClient({ tree: SAMPLE_TREE }).client);
    const service = new SftpDemoService(CONN, 60_000, factory);

    await service.listDemos("2026-08");
    await service.listDemos("2026-07");

    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("cai pra lista velha em cache se o SFTP ficar indisponível depois", async () => {
    let attempt = 0;
    const factory = () => {
      attempt += 1;
      if (attempt === 1) return makeFakeClient({ tree: SAMPLE_TREE }).client;
      return makeFakeClient({
        tree: {},
        connectError: Object.assign(new Error("boom"), { code: "ECONNREFUSED" }),
      }).client;
    };
    // TTL 0: a segunda chamada sempre tenta um refresh de verdade.
    const service = new SftpDemoService(CONN, 0, factory);

    const first = await service.listDemos("2026-08");
    expect(first.length).toBe(3);

    const second = await service.listDemos("2026-08");
    expect(second).toEqual(first); // caiu pro stale em vez de lançar
  });
});

describe("SftpDemoService.listPeriods", () => {
  it("lista os meses únicos entre todos os servidores, mais recente primeiro", async () => {
    const { client } = makeFakeClient({ tree: SAMPLE_TREE });
    const service = new SftpDemoService(CONN, 60_000, () => client);

    expect(await service.listPeriods()).toEqual(["2026-08", "2026-07"]);
  });

  it("usa cache dentro do TTL: uma segunda chamada não reconecta", async () => {
    const factory = vi.fn(() => makeFakeClient({ tree: SAMPLE_TREE }).client);
    const service = new SftpDemoService(CONN, 60_000, factory);

    await service.listPeriods();
    await service.listPeriods();

    expect(factory).toHaveBeenCalledTimes(1);
  });
});

describe("SftpDemoService.getDemo", () => {
  it("retorna null pra ID válido mas arquivo inexistente", async () => {
    const { client } = makeFakeClient({ tree: SAMPLE_TREE });
    const service = new SftpDemoService(CONN, 60_000, () => client);

    const demo = await service.getDemo("27800-20261231-2359-de_never_existed");
    expect(demo).toBeNull();
  });

  it("retorna null pra ID bem formado cuja porta não corresponde a nenhum servidor", async () => {
    const { client } = makeFakeClient({ tree: SAMPLE_TREE });
    const service = new SftpDemoService(CONN, 60_000, () => client);

    const demo = await service.getDemo("99999-20260801-1646-de_dust2");
    expect(demo).toBeNull();
  });

  it("lança InvalidDemoIdError SEM sequer tentar conectar, para tentativas de path traversal", async () => {
    const { client, connectCalls } = makeFakeClient({ tree: SAMPLE_TREE });
    const service = new SftpDemoService(CONN, 60_000, () => client);

    await expect(service.getDemo("../../../../etc/passwd")).rejects.toBeInstanceOf(InvalidDemoIdError);
    await expect(
      service.getDemo("27800-20260801-1646-de_dust2/../../../etc/passwd"),
    ).rejects.toBeInstanceOf(InvalidDemoIdError);
    expect(connectCalls()).toBe(0);
  });
});

describe("SftpDemoService.streamDemo", () => {
  it("transmite o conteúdo real do arquivo sem carregar tudo em memória de uma vez", async () => {
    const { client } = makeFakeClient({ tree: SAMPLE_TREE });
    const service = new SftpDemoService(CONN, 60_000, () => client);
    const dest = new PassThrough();

    const chunks: Buffer[] = [];
    dest.on("data", (chunk) => chunks.push(chunk));
    const finished = new Promise<void>((resolve) => dest.on("finish", resolve));

    const result = await service.streamDemo("27800-20260801-1646-de_dust2", dest);
    await finished;

    expect(result.filename).toBe("20260801-1646-de_dust2.dem");
    expect(result.sizeBytes).toBe(13);
    expect(Buffer.concat(chunks).toString()).toBe("conteudo-fake");
  });

  it("transmite do segundo servidor também (a porta no ID escolhe a raiz certa)", async () => {
    const { client } = makeFakeClient({ tree: SAMPLE_TREE });
    const service = new SftpDemoService(CONN, 60_000, () => client);

    const result = await service.streamDemo("27490-20260801-1900-de_mirage_csgo_v2", new PassThrough());
    expect(result.filename).toBe("20260801-1900-de_mirage_csgo_v2.dem");
    expect(result.sizeBytes).toBe(20_000_000);
  });

  it("lança DemoNotFoundError para ID bem formado cujo arquivo não existe", async () => {
    const { client } = makeFakeClient({ tree: SAMPLE_TREE });
    const service = new SftpDemoService(CONN, 60_000, () => client);

    await expect(
      service.streamDemo("27800-20261231-2359-de_never_existed", new PassThrough()),
    ).rejects.toBeInstanceOf(DemoNotFoundError);
  });
});

describe("classificação de erros de conexão", () => {
  it("credenciais erradas viram SftpAuthError", async () => {
    const { client } = makeFakeClient({
      tree: SAMPLE_TREE,
      connectError: new Error("All configured authentication methods failed"),
    });
    const service = new SftpDemoService(CONN, 60_000, () => client);

    await expect(service.listDemos("2026-08")).rejects.toBeInstanceOf(SftpAuthError);
  });

  it("host inalcançável vira SftpUnavailableError", async () => {
    const { client } = makeFakeClient({
      tree: SAMPLE_TREE,
      connectError: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
    });
    const service = new SftpDemoService(CONN, 60_000, () => client);

    await expect(service.listDemos("2026-08")).rejects.toBeInstanceOf(SftpUnavailableError);
  });
});
