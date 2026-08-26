import { describe, expect, it } from "vitest";
import { isValidSteamId64, liveIngestPayloadSchema } from "../src/live/schema.js";

describe("isValidSteamId64", () => {
  it("aceita um SteamID64 real", () => {
    expect(isValidSteamId64("76561198009634211")).toBe(true);
  });

  it("rejeita algo que não tem 17 dígitos", () => {
    expect(isValidSteamId64("123")).toBe(false);
    expect(isValidSteamId64("765611980096342119999")).toBe(false);
  });

  it("rejeita não-numérico e valores abaixo da base do SteamID64", () => {
    expect(isValidSteamId64("abcdefghijklmnopq")).toBe(false);
    expect(isValidSteamId64("00000000000000000")).toBe(false);
  });
});

const TIMESTAMP = "2026-08-25T22:00:00.000Z";

describe("liveIngestPayloadSchema", () => {
  it("aceita um lote real de eventos mistos", () => {
    const payload = {
      serverId: "104.234.65.244_27800",
      events: [
        {
          kind: "server_snapshot",
          hostname: "*MIX* L.E.N.D.A.S CSS #1",
          map: "de_dust2",
          players: 12,
          maxPlayers: 15,
          round: 5,
          ctScore: 3,
          tScore: 2,
          clock: 80,
          phase: "live",
          bombPlanted: false,
          timestamp: TIMESTAMP,
        },
        {
          kind: "round_end",
          round: 5,
          winner: "CT",
          reason: "elimination",
          ctScore: 4,
          tScore: 2,
          timestamp: TIMESTAMP,
        },
      ],
    };
    expect(liveIngestPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("rejeita SteamID64 inválido em player_connect", () => {
    const payload = {
      serverId: "srv",
      events: [
        { kind: "player_connect", steamId64: "123", steamId: "STEAM_1:0:1", nickname: "x", userId: 5, timestamp: TIMESTAMP },
      ],
    };
    expect(liveIngestPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it("rejeita reason de round_end fora do domínio esperado pelo frontend", () => {
    const payload = {
      serverId: "srv",
      events: [{ kind: "round_end", round: 1, winner: "CT", reason: "inventado", ctScore: 1, tScore: 0, timestamp: TIMESTAMP }],
    };
    expect(liveIngestPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it("rejeita kind desconhecido", () => {
    const payload = { serverId: "srv", events: [{ kind: "explosao_nuclear", timestamp: TIMESTAMP }] };
    expect(liveIngestPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it("rejeita lote vazio", () => {
    expect(liveIngestPayloadSchema.safeParse({ serverId: "srv", events: [] }).success).toBe(false);
  });

  it("aceita player_death com e sem atacante (suicídio)", () => {
    const withAttacker = {
      kind: "player_death",
      victimSteamId64: "76561198009634211",
      victimTeam: "T",
      attackerSteamId64: "76561197960287930",
      attackerTeam: "CT",
      weapon: "ak47",
      headshot: true,
      timestamp: TIMESTAMP,
    };
    const suicide = {
      kind: "player_death",
      victimSteamId64: "76561198009634211",
      victimTeam: "T",
      weapon: "world",
      headshot: false,
      timestamp: TIMESTAMP,
    };
    expect(liveIngestPayloadSchema.safeParse({ serverId: "srv", events: [withAttacker] }).success).toBe(true);
    expect(liveIngestPayloadSchema.safeParse({ serverId: "srv", events: [suicide] }).success).toBe(true);
  });
});
