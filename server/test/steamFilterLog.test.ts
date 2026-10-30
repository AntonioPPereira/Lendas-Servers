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

describe("linhas de saída (lendas_steamfilter 1.1.0)", () => {
  const linha = (corpo: string) =>
    `L 08/30/2026 - 19:05:12: [lendas_steamfilter.smx] ${corpo}`;

  it("reconhece a saída e guarda quanto tempo a pessoa ficou", () => {
    const ev = parseSteamFilterLogLine(
      linha("SAIU: Kangaçeiroz<12><STEAM_0:1:52341><CT> ficou 42 min."),
    );
    expect(ev).toEqual({
      at: "2026-08-30T19:05:12",
      kind: "leave",
      actor: "Kangaçeiroz",
      detail: "42 min",
    });
  });

  it("sessão de menos de um minuto não vira \"0 min\", que leria como bug", () => {
    const ev = parseSteamFilterLogLine(linha("SAIU: fulano<3><STEAM_0:0:1><> ficou 0 min."));
    expect(ev?.detail).toBe("menos de 1 min");
  });

  it("passando de uma hora, mostra h em vez de contar centenas de minutos", () => {
    expect(parseSteamFilterLogLine(linha("SAIU: a<1><STEAM_0:0:1><TERRORIST> ficou 134 min."))?.detail).toBe("2h14");
    expect(parseSteamFilterLogLine(linha("SAIU: a<1><STEAM_0:0:1><TERRORIST> ficou 120 min."))?.detail).toBe("2h");
    expect(parseSteamFilterLogLine(linha("SAIU: a<1><STEAM_0:0:1><TERRORIST> ficou 60 min."))?.detail).toBe("1h");
    expect(parseSteamFilterLogLine(linha("SAIU: a<1><STEAM_0:0:1><TERRORIST> ficou 59 min."))?.detail).toBe("59 min");
  });

  it("nick com < e espaço não confunde o parser", () => {
    const ev = parseSteamFilterLogLine(
      linha("SAIU: Tu_Mami (ºwº)<8><STEAM_0:1:374293539><CT> ficou 7 min."),
    );
    expect(ev?.actor).toBe("Tu_Mami (ºwº)");
    expect(ev?.kind).toBe("leave");
  });

  it("um servidor na versão antiga do plugin simplesmente não gera saída", () => {
    // 1.0.0 não escrevia nada no OnClientDisconnect; nada aqui deve inventar.
    expect(parseSteamFilterLogLine(linha("Dropped fulano from server"))).toBeNull();
  });
});
