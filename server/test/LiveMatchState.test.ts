import { describe, expect, it, vi } from "vitest";
import { LiveMatchState } from "../src/live/state.js";
import type { LiveIngestEvent } from "../src/live/schema.js";

const T = "2026-08-25T22:00:00.000Z";
const ID_A = "76561198009634211";
const ID_B = "76561197960287930";

function snapshotEvent(overrides: Partial<Extract<LiveIngestEvent, { kind: "server_snapshot" }>> = {}): LiveIngestEvent {
  return {
    kind: "server_snapshot",
    hostname: "Servidor 01",
    map: "de_dust2",
    players: 2,
    maxPlayers: 15,
    timestamp: T,
    ...overrides,
  };
}

describe("LiveMatchState", () => {
  it("não tem primário nenhum antes do primeiro evento", () => {
    const state = new LiveMatchState(30_000);
    expect(state.getPrimaryServerId()).toBeNull();
    expect(state.getPrimarySnapshot()).toBeNull();
  });

  it("aplica server_snapshot e player_snapshot e devolve o LiveMatch completo", () => {
    const state = new LiveMatchState(30_000);
    state.applyEvents("srv1", [
      snapshotEvent({ round: 5, ctScore: 3, tScore: 2, clock: 80, phase: "live", bombPlanted: false }),
      {
        kind: "player_snapshot",
        timestamp: T,
        players: [
          {
            steamId64: ID_A,
            steamId: "STEAM_1:0:1",
            nickname: "Coringa",
            userId: 10,
            team: "CT",
            alive: true,
            health: 100,
            armor: 100,
            money: 4000,
            kills: 3,
            deaths: 1,
            assists: 0,
            score: 6,
            ping: 30,
            weapon: "ak47",
            mvps: 1,
            connectedSeconds: 300,
          },
        ],
      },
    ]);

    const snapshot = state.getPrimarySnapshot();
    expect(snapshot).toMatchObject({ serverId: "srv1", map: "de_dust2", round: 5, ctScore: 3, tScore: 2 });
    expect(snapshot?.players).toHaveLength(1);
    expect(snapshot?.players[0]).toMatchObject({ steamId64: ID_A, nickname: "Coringa", kills: 3 });
  });

  it("escolhe como primário o servidor com mais jogadores conectados", () => {
    const state = new LiveMatchState(30_000);
    state.applyEvents("srv-cheio", [snapshotEvent({ players: 20, hostname: "Cheio" })]);
    state.applyEvents("srv-vazio", [snapshotEvent({ players: 2, hostname: "Vazio" })]);

    expect(state.getPrimaryServerId()).toBe("srv-cheio");

    // servidor vazio ganha gente e ultrapassa — primário muda dinamicamente
    state.applyEvents("srv-vazio", [snapshotEvent({ players: 25, hostname: "Vazio" })]);
    expect(state.getPrimaryServerId()).toBe("srv-vazio");
  });

  it("com preferredServerId definido, prioriza esse servidor mesmo com menos gente conectada", () => {
    const state = new LiveMatchState(30_000, "srv-preferido");
    state.applyEvents("srv-cheio", [snapshotEvent({ players: 20, hostname: "Cheio" })]);
    state.applyEvents("srv-preferido", [snapshotEvent({ players: 1, hostname: "Preferido" })]);

    expect(state.getPrimaryServerId()).toBe("srv-preferido");
  });

  it("com preferredServerId definido mas ainda sem snapshot, cai pro critério de mais gente conectada", () => {
    const state = new LiveMatchState(30_000, "srv-preferido");
    state.applyEvents("srv-cheio", [snapshotEvent({ players: 20, hostname: "Cheio" })]);

    expect(state.getPrimaryServerId()).toBe("srv-cheio");
  });

  it("map_start zera placar, rounds e elenco", () => {
    const state = new LiveMatchState(30_000);
    state.applyEvents("srv1", [snapshotEvent({ ctScore: 10, tScore: 9 })]);
    state.applyEvents("srv1", [{ kind: "map_start", map: "de_inferno", timestamp: T }]);

    const snapshot = state.getSnapshot("srv1");
    expect(snapshot).toMatchObject({ map: "de_inferno", ctScore: 0, tScore: 0, rounds: [] });
  });

  it("round_end acumula histórico de rounds e atualiza o placar", () => {
    const state = new LiveMatchState(30_000);
    state.applyEvents("srv1", [
      snapshotEvent(),
      { kind: "round_start", round: 1, timestamp: T },
      { kind: "round_end", round: 1, winner: "CT", reason: "elimination", ctScore: 1, tScore: 0, timestamp: T },
    ]);

    const snapshot = state.getSnapshot("srv1")!;
    expect(snapshot.ctScore).toBe(1);
    expect(snapshot.rounds).toEqual([{ round: 1, winner: "CT", reason: "elimination" }]);
  });

  it("player_connect cria uma entrada mínima; player_disconnect remove", () => {
    const state = new LiveMatchState(30_000);
    state.applyEvents("srv1", [
      snapshotEvent(),
      { kind: "player_connect", steamId64: ID_A, steamId: "STEAM_1:0:1", nickname: "Novo", userId: 1, timestamp: T },
    ]);
    expect(state.getSnapshot("srv1")?.players.map((p) => p.nickname)).toEqual(["Novo"]);

    state.applyEvents("srv1", [{ kind: "player_disconnect", steamId64: ID_A, userId: 1, timestamp: T }]);
    expect(state.getSnapshot("srv1")?.players).toHaveLength(0);
  });

  it("player_snapshot remove quem não está mais no elenco enviado, mesmo sem disconnect explícito", () => {
    const state = new LiveMatchState(30_000);
    const player = (id: string, nick: string) => ({
      steamId64: id,
      steamId: "STEAM_1:0:1",
      nickname: nick,
      userId: 1,
      team: "CT" as const,
      alive: true,
      health: 100,
      armor: 0,
      money: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      score: 0,
      ping: 10,
      weapon: "",
      mvps: 0,
      connectedSeconds: 0,
    });

    state.applyEvents("srv1", [{ kind: "player_snapshot", timestamp: T, players: [player(ID_A, "A"), player(ID_B, "B")] }]);
    expect(state.getSnapshot("srv1")?.players).toHaveLength(2);

    state.applyEvents("srv1", [{ kind: "player_snapshot", timestamp: T, players: [player(ID_A, "A")] }]);
    expect(state.getSnapshot("srv1")?.players.map((p) => p.steamId64)).toEqual([ID_A]);
  });

  it("player_death marca a vítima como morta imediatamente, sem esperar o próximo snapshot", () => {
    const state = new LiveMatchState(30_000);
    state.applyEvents("srv1", [
      {
        kind: "player_snapshot",
        timestamp: T,
        players: [
          {
            steamId64: ID_A,
            steamId: "s",
            nickname: "A",
            userId: 1,
            team: "T",
            alive: true,
            health: 100,
            armor: 0,
            money: 0,
            kills: 0,
            deaths: 0,
            assists: 0,
            score: 0,
            ping: 10,
            weapon: "",
            mvps: 0,
            connectedSeconds: 0,
          },
        ],
      },
      { kind: "player_death", victimSteamId64: ID_A, victimTeam: "T", weapon: "ak47", headshot: true, timestamp: T },
    ]);

    const victim = state.getSnapshot("srv1")?.players[0];
    expect(victim).toMatchObject({ alive: false, health: 0 });
  });

  it("bomb_planted/defused/exploded atualizam o estado da bomba", () => {
    const state = new LiveMatchState(30_000);
    state.applyEvents("srv1", [snapshotEvent(), { kind: "bomb_planted", timestamp: T }]);
    expect(state.getSnapshot("srv1")).toMatchObject({ bombPlanted: true, phase: "bomb" });

    state.applyEvents("srv1", [{ kind: "bomb_defused", timestamp: T }]);
    expect(state.getSnapshot("srv1")?.bombPlanted).toBe(false);
  });

  it("remove um servidor sem snapshot novo depois do staleMs", () => {
    vi.useFakeTimers();
    try {
      const state = new LiveMatchState(1_000);
      state.applyEvents("srv1", [snapshotEvent()]);
      expect(state.getPrimaryServerId()).toBe("srv1");

      vi.advanceTimersByTime(1_500);
      expect(state.getPrimaryServerId()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("setAvatarUrl aplica o avatar resolvido ao jogador certo", () => {
    const state = new LiveMatchState(30_000);
    state.applyEvents("srv1", [
      { kind: "player_connect", steamId64: ID_A, steamId: "s", nickname: "A", userId: 1, timestamp: T },
    ]);
    state.setAvatarUrl(ID_A, "https://avatars.example/a.jpg");

    expect(state.getSnapshot("srv1")?.players[0]).toMatchObject({ avatarUrl: "https://avatars.example/a.jpg" });
  });

  it("allKnownSteamIds soma jogadores de todos os servidores", () => {
    const state = new LiveMatchState(30_000);
    state.applyEvents("srv1", [
      { kind: "player_connect", steamId64: ID_A, steamId: "s", nickname: "A", userId: 1, timestamp: T },
    ]);
    state.applyEvents("srv2", [
      { kind: "player_connect", steamId64: ID_B, steamId: "s", nickname: "B", userId: 2, timestamp: T },
    ]);
    expect(new Set(state.allKnownSteamIds())).toEqual(new Set([ID_A, ID_B]));
  });
});
