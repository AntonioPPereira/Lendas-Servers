import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isDailyLogFilename, parseSteamFilterLogLine } from "../src/lib/steamFilterLog.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(
  path.join(here, "fixtures", "lendas_steamfilter-L20260825.log"),
  "utf-8",
);

describe("parseSteamFilterLogLine", () => {
  it("extrai um bloqueio real, com o motivo exato do plugin", () => {
    const line =
      "L 08/25/2026 - 00:02:43: [lendas_steamfilter.smx] Bloqueado MXDELTA<96><[U:1:1841605867]><> - 0h de CS:S (minimo 20h)";
    expect(parseSteamFilterLogLine(line)).toEqual({
      at: "2026-08-25T00:02:43",
      kind: "blocked",
      actor: "MXDELTA",
      detail: "0h de CS:S (minimo 20h)",
    });
  });

  it("extrai uma aprovação real", () => {
    const line =
      "L 08/24/2026 - 08:14:01: [lendas_steamfilter.smx] APROVADO: vol-0<100><[U:1:483403219]><> passou em todas as checagens.";
    expect(parseSteamFilterLogLine(line)).toEqual({
      at: "2026-08-24T08:14:01",
      kind: "join",
      actor: "vol-0",
    });
  });

  it("trata erro_api como aprovado — o plugin fecha com APROVADO mesmo após falha de API (fail-open)", () => {
    const line =
      "L 08/24/2026 - 11:37:32: [lendas_steamfilter.smx] APROVADO: MaOzInHa<101><[U:1:1894430476]><> passou em todas as checagens.";
    expect(parseSteamFilterLogLine(line)?.kind).toBe("join");
  });

  it("ignora linhas de diagnóstico ([bans], [perfil], [horas], [shared], ERRO API)", () => {
    const noise = [
      "L 08/25/2026 - 00:02:42: [lendas_steamfilter.smx] [bans] MXDELTA<96><[U:1:1841605867]><> -> VAC:0 gamebans:0 dias_desde_ban:0",
      "L 08/24/2026 - 08:14:00: [lendas_steamfilter.smx] ERRO API: GetPlayerBans falhou para vol-0<100><[U:1:483403219]><> - LIBERADO sem checar.",
    ];
    for (const line of noise) {
      expect(parseSteamFilterLogLine(line)).toBeNull();
    }
  });

  it("ignora linhas de outros plugins ou em branco", () => {
    expect(parseSteamFilterLogLine("")).toBeNull();
    expect(parseSteamFilterLogLine("L 08/25/2026 - 00:00:00: [outro_plugin.smx] algo aconteceu")).toBeNull();
  });

  it("processa o fixture real de produção e acha só os vereditos terminais", () => {
    const events = fixture
      .split("\n")
      .map(parseSteamFilterLogLine)
      .filter((e): e is NonNullable<typeof e> => e !== null);

    expect(events).toHaveLength(4);
    expect(events.map((e) => e.kind)).toEqual(["blocked", "blocked", "join", "join"]);
    expect(events[0]).toMatchObject({ actor: "MXDELTA", detail: "0h de CS:S (minimo 20h)" });
  });
});

describe("isDailyLogFilename", () => {
  it("aceita o padrão real do SourceMod", () => {
    expect(isDailyLogFilename("L20260825.log")).toBe(true);
  });

  it("rejeita outros arquivos que aparecem na mesma pasta", () => {
    expect(isDailyLogFilename("errors_20260825.log")).toBe(false);
    expect(isDailyLogFilename("sourcemod_fatal.log")).toBe(false);
  });
});
