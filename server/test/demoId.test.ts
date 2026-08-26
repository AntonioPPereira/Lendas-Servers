import { describe, expect, it } from "vitest";
import {
  buildDemoId,
  demoIdFromFilename,
  isDemoFilename,
  isYearMonthDir,
  parseDemoId,
  parseServerDirName,
  resolveDemoPath,
  type ServerRoot,
} from "../src/lib/demoId.js";

const ROOTS: ServerRoot[] = [
  { ip: "104.234.65.244", port: "27800", root: "/104.234.65.244_27800/cstrike/demos" },
  { ip: "104.234.65.243", port: "27490", root: "/104.234.65.243_27490/cstrike/demos" },
];

describe("parseDemoId", () => {
  it.each([
    ["27800-20260801-1643-de_tuscan", "27800", "de_tuscan", "2026-08-01", "16:43"],
    ["27800-20260801-1646-de_dust2", "27800", "de_dust2", "2026-08-01", "16:46"],
    ["27490-20260801-1726-de_cache_csgo_source", "27490", "de_cache_csgo_source", "2026-08-01", "17:26"],
    ["27490-20260801-1752-de_mirage_csgo_v2", "27490", "de_mirage_csgo_v2", "2026-08-01", "17:52"],
    ["27800-20260801-1812-de_inferno", "27800", "de_inferno", "2026-08-01", "18:12"],
  ])("parseia %s corretamente", (id, port, map, date, time) => {
    const parsed = parseDemoId(id);
    expect(parsed).not.toBeNull();
    expect(parsed?.port).toBe(port);
    expect(parsed?.map).toBe(map);
    expect(parsed?.date).toBe(date);
    expect(parsed?.time).toBe(time);
    expect(parsed?.yearMonth).toBe("2026-08");
    expect(parsed?.filename).toBe(`${date.replace(/-/g, "")}-${time.replace(":", "")}-${map}.dem`);
  });

  it("rejeita formato solto (faltando partes)", () => {
    expect(parseDemoId("20260801-1646-de_dust2")).toBeNull(); // sem prefixo de porta
    expect(parseDemoId("27800-de_dust2")).toBeNull();
    expect(parseDemoId("de_dust2")).toBeNull();
    expect(parseDemoId("")).toBeNull();
  });

  it("rejeita mês/dia/hora/minuto fora do calendário", () => {
    expect(parseDemoId("27800-20261301-1646-de_dust2")).toBeNull(); // mês 13
    expect(parseDemoId("27800-20260832-1646-de_dust2")).toBeNull(); // dia 32
    expect(parseDemoId("27800-20260801-2460-de_dust2")).toBeNull(); // hora 24
    expect(parseDemoId("27800-20260801-1660-de_dust2")).toBeNull(); // minuto 60
  });

  it("rejeita path traversal e caracteres fora do whitelist", () => {
    expect(parseDemoId("../../../../etc/passwd")).toBeNull();
    expect(parseDemoId("27800-20260801-1646-../../../etc/passwd")).toBeNull();
    expect(parseDemoId("27800-20260801-1646-de_dust2/../../etc")).toBeNull();
    expect(parseDemoId("/etc/passwd")).toBeNull();
    expect(parseDemoId("27800-20260801-1646-de dust2")).toBeNull(); // espaço
  });

  it("rejeita tentativa de contrabandear outra extensão", () => {
    // "." não está no charset permitido do trecho de mapa — isso por si só
    // já barra qualquer ".dem.exe", ".jpg" etc.
    expect(parseDemoId("27800-20260801-1646-de_dust2.exe")).toBeNull();
    expect(parseDemoId("27800-20260801-1646-de_dust2.dem")).toBeNull(); // ID não inclui extensão
  });

  it("buildDemoId monta o mesmo formato que parseDemoId espera", () => {
    const id = buildDemoId("27800", "20260801-1646-de_dust2.dem");
    expect(id).toBe("27800-20260801-1646-de_dust2");
    expect(parseDemoId(id)?.port).toBe("27800");
  });
});

describe("parseServerDirName", () => {
  it("reconhece o padrão IP_PORTA e ignora o resto", () => {
    expect(parseServerDirName("104.234.65.244_27800")).toEqual({
      ip: "104.234.65.244",
      port: "27800",
    });
    expect(parseServerDirName("lost+found")).toBeNull();
    expect(parseServerDirName("cstrike")).toBeNull();
    expect(parseServerDirName("..")).toBeNull();
  });
});

describe("isYearMonthDir / isDemoFilename", () => {
  it("aceita só o formato esperado", () => {
    expect(isYearMonthDir("2026-08")).toBe(true);
    expect(isYearMonthDir("2026-8")).toBe(false);
    expect(isYearMonthDir("..")).toBe(false);
    expect(isYearMonthDir("scripts")).toBe(false);

    expect(isDemoFilename("20260801-1646-de_dust2.dem")).toBe(true);
    expect(isDemoFilename("20260801-1646-de_dust2.dem.txt")).toBe(false);
    expect(isDemoFilename("readme.txt")).toBe(false);
    expect(isDemoFilename("..dem")).toBe(false);
  });

  it("demoIdFromFilename remove só a extensão .dem", () => {
    expect(demoIdFromFilename("20260801-1646-de_dust2.dem")).toBe("20260801-1646-de_dust2");
  });
});

describe("resolveDemoPath", () => {
  it("resolve pro caminho POSIX correto, achando a raiz do servidor certo pela porta do ID", () => {
    const resolved = resolveDemoPath(ROOTS, "27800-20260801-1646-de_dust2");
    expect(resolved).not.toBeNull();
    expect(resolved?.path).toBe("/104.234.65.244_27800/cstrike/demos/2026-08/20260801-1646-de_dust2.dem");
    expect(resolved?.root.ip).toBe("104.234.65.244");

    const resolvedOther = resolveDemoPath(ROOTS, "27490-20260801-1900-de_mirage_csgo_v2");
    expect(resolvedOther?.path).toBe(
      "/104.234.65.243_27490/cstrike/demos/2026-08/20260801-1900-de_mirage_csgo_v2.dem",
    );
  });

  it("retorna null se a porta do ID não corresponder a nenhum servidor conhecido", () => {
    expect(resolveDemoPath(ROOTS, "99999-20260801-1646-de_dust2")).toBeNull();
  });

  it("nunca deixa o caminho resolvido escapar da raiz, para qualquer ID malformado", () => {
    const attempts = [
      "../../../../etc/passwd",
      "27800-20260801-1646-..",
      "/etc/passwd",
      "27800-20260801-1646-de_dust2/../../../etc/passwd",
    ];
    for (const attempt of attempts) {
      expect(resolveDemoPath(ROOTS, attempt)).toBeNull();
    }
  });
});
