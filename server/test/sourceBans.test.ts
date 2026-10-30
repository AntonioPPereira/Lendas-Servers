import { describe, expect, it } from "vitest";
import {
  deriveBanKind,
  deriveBanState,
  matchesQuery,
  steamIdToSteamId64,
  toBanDto,
  type SourceBansRow,
} from "../src/lib/sourceBans.js";

const AGORA = 1_788_000_000;

function row(over: Partial<SourceBansRow> = {}): SourceBansRow {
  return {
    kind: "ban",
    bid: 1,
    authid: "STEAM_0:1:52341",
    name: "jogador",
    created: AGORA - 3600,
    ends: AGORA + 3600,
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

describe("steamIdToSteamId64", () => {
  it("converte a forma STEAM_0:Y:Z pro id de 64 bits", () => {
    // 76561197960265728 + 52341*2 + 1
    expect(steamIdToSteamId64("STEAM_0:1:52341")).toBe("76561197960370411");
    expect(steamIdToSteamId64("STEAM_0:0:0")).toBe("76561197960265728");
  });

  it("aguenta ids grandes sem perder precisão (o motivo de usar BigInt)", () => {
    const id = steamIdToSteamId64("STEAM_0:1:937126612");
    expect(id).toBe("76561199834518953");
    // Number perderia o final; a string tem que bater dígito a dígito.
    expect(id).toHaveLength(17);
  });

  it("devolve null quando não há SteamID de verdade (ban por IP, id pendente)", () => {
    expect(steamIdToSteamId64("")).toBeNull();
    expect(steamIdToSteamId64("STEAM_ID_PENDING")).toBeNull();
    expect(steamIdToSteamId64("nao é um id")).toBeNull();
  });
});

describe("deriveBanState", () => {
  it("punição levantada por admin vira 'expired' mesmo sendo permanente", () => {
    // O caso que justifica checar removeType ANTES de length === 0.
    expect(deriveBanState(row({ length: 0, ends: 0, removeType: "U" }), AGORA)).toBe("expired");
  });

  it("length 0 é permanente", () => {
    expect(deriveBanState(row({ length: 0, ends: 0 }), AGORA)).toBe("permanent");
  });

  it("prazo já vencido é 'expired', prazo no futuro é 'active'", () => {
    expect(deriveBanState(row({ ends: AGORA - 1 }), AGORA)).toBe("expired");
    expect(deriveBanState(row({ ends: AGORA + 1 }), AGORA)).toBe("active");
  });
});

describe("deriveBanKind", () => {
  it("mapeia os tipos de comunicação do SourceBans", () => {
    expect(deriveBanKind(row())).toBe("ban");
    expect(deriveBanKind(row({ kind: "comm", commType: 1 }))).toBe("mute");
    expect(deriveBanKind(row({ kind: "comm", commType: 2 }))).toBe("gag");
  });

  it("tipo desconhecido de comm nunca vira 'ban'", () => {
    expect(deriveBanKind(row({ kind: "comm", commType: 99 }))).toBe("silence");
  });
});

describe("toBanDto", () => {
  it("traduz um ban real pro shape do painel", () => {
    const dto = toBanDto(row(), AGORA);
    expect(dto.id).toBe("b1");
    expect(dto.target.steamId64).toBe("76561197960370411");
    expect(dto.target.country).toBe("br");
    expect(dto.state).toBe("active");
    expect(dto.expiresAt).toBe(new Date((AGORA + 3600) * 1000).toISOString());
    expect(dto.evidence).toBeNull();
  });

  it("permanente não ganha data de expiração inventada", () => {
    expect(toBanDto(row({ length: 0, ends: 0 }), AGORA).expiresAt).toBeNull();
  });

  it("ids de ban e de mute não colidem, mesmo com o mesmo bid", () => {
    expect(toBanDto(row({ bid: 7 }), AGORA).id).toBe("b7");
    expect(toBanDto(row({ bid: 7, kind: "comm" }), AGORA).id).toBe("c7");
  });

  it("ban aplicado pelo console mostra 'Console', não um nome vazio", () => {
    expect(toBanDto(row({ admin: "" }), AGORA).admin).toBe("Console");
  });

  it("usa o nome amigável quando o servidor é conhecido", () => {
    const dto = toBanDto(row(), AGORA, (hostPort) =>
      hostPort === "104.234.65.244:27800" ? { id: "lendas-01", name: "SERVIDOR 01" } : undefined,
    );
    expect(dto.serverId).toBe("lendas-01");
    expect(dto.serverName).toBe("SERVIDOR 01");
  });

  it("servidor desconhecido ainda aparece, com ip:porta em vez de sumir", () => {
    const dto = toBanDto(row({ server: "1.2.3.4:27015" }), AGORA, () => undefined);
    expect(dto.serverName).toBe("1.2.3.4:27015");
    expect(dto.serverId).toBe("1-2-3-4-27015");
  });

  it("ban por IP (sem SteamID) não inventa id nem quebra", () => {
    const dto = toBanDto(row({ authid: "", name: "" }), AGORA);
    expect(dto.target.steamId64).toBe("");
    expect(dto.target.nickname).toBe("(sem nick)");
  });
});

describe("matchesQuery", () => {
  const dto = toBanDto(row(), AGORA);

  it("acha por nick, motivo, admin e pelas duas formas de SteamID", () => {
    expect(matchesQuery(dto, "jogad")).toBe(true);
    expect(matchesQuery(dto, "aimbot")).toBe(true);
    expect(matchesQuery(dto, "kangaceiroz")).toBe(true);
    expect(matchesQuery(dto, "STEAM_0:1:52341")).toBe(true);
    expect(matchesQuery(dto, "76561197960370411")).toBe(true);
  });

  it("busca vazia não filtra nada", () => {
    expect(matchesQuery(dto, "   ")).toBe(true);
  });

  it("não casa o que não existe", () => {
    expect(matchesQuery(dto, "wallhack")).toBe(false);
  });
});
