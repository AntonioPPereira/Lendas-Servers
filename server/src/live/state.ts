import type { LiveIngestEvent } from "./schema.js";

export type Team = "CT" | "T" | "SPEC";
export type MatchPhase = "warmup" | "freezetime" | "live" | "bomb" | "halftime" | "ended";
export type RoundEndReason = "bomb" | "defuse" | "elimination" | "time" | "hostage";

export interface RoundResult {
  round: number;
  winner: "CT" | "T";
  reason: RoundEndReason;
}

/** Mesmo shape do `LivePlayer` do frontend (`painel/src/data/types.ts`) — mantido em sincronia manualmente. */
export interface LivePlayerSnapshot {
  steamId64: string;
  steamId: string;
  nickname: string;
  avatarSeed: string;
  avatarUrl?: string;
  team: Team;
  kills: number;
  deaths: number;
  assists: number;
  score: number;
  ping: number;
  alive: boolean;
  health: number;
  money: number;
  mvps: number;
  connectedFor: number;
}

/** Mesmo shape do `LiveMatch` do frontend, mais o `serverId` de qual servidor é este. */
export interface LiveMatchSnapshot {
  serverId: string;
  map: string;
  phase: MatchPhase;
  round: number;
  maxRounds: number;
  ctScore: number;
  tScore: number;
  clock: number;
  bombPlanted: boolean;
  rounds: RoundResult[];
  players: LivePlayerSnapshot[];
  startedAt: string;
}

interface ServerEntry {
  serverId: string;
  hostname: string;
  map: string;
  /** Total conectado no server agora (`server_snapshot.players`) — inclui quem ainda não autenticou. */
  connectedPlayers: number;
  maxPlayers: number;
  round: number;
  maxRounds: number;
  ctScore: number;
  tScore: number;
  clock: number;
  phase: MatchPhase;
  bombPlanted: boolean;
  rounds: RoundResult[];
  /** Chave: steamId64. Só entra aqui quem já autenticou — nunca um jogador "fantasma". */
  players: Map<string, LivePlayerSnapshot>;
  startedAt: string;
  lastSeenAt: number;
}

const MAX_ROUNDS_HISTORY = 30;

function emptyServer(serverId: string, nowIso: string): ServerEntry {
  return {
    serverId,
    hostname: serverId,
    map: "",
    connectedPlayers: 0,
    maxPlayers: 0,
    round: 0,
    maxRounds: 0,
    ctScore: 0,
    tScore: 0,
    clock: 0,
    phase: "warmup",
    bombPlanted: false,
    rounds: [],
    players: new Map(),
    startedAt: nowIso,
    lastSeenAt: Date.now(),
  };
}

/**
 * Estado ao vivo, em memória, de todos os servidores que já mandaram algum
 * evento. Puramente um reducer sobre os eventos validados em `schema.ts` —
 * nenhuma decisão de requisito/bloqueio mora aqui, isso continua sendo do
 * `lendas_steamfilter` (lido via `SteamFilterLogService`, não por aqui).
 *
 * "Primário" (qual partida o LENDAS mostra como *a* partida ao vivo) é
 * sempre o servidor com mais gente conectada agora — mesmo critério de
 * `pickPrimaryServer()` no frontend (`useRealServers.ts`), pra não haver
 * duas noções diferentes de "servidor principal" no mesmo produto.
 */
export class LiveMatchState {
  private readonly servers = new Map<string, ServerEntry>();

  constructor(private readonly staleMs: number) {}

  applyEvents(serverId: string, events: LiveIngestEvent[]): void {
    let entry = this.servers.get(serverId);
    if (!entry) {
      entry = emptyServer(serverId, new Date().toISOString());
      this.servers.set(serverId, entry);
    }
    entry.lastSeenAt = Date.now();

    for (const event of events) this.applyOne(entry, event);
  }

  private applyOne(entry: ServerEntry, event: LiveIngestEvent): void {
    switch (event.kind) {
      case "server_snapshot":
        entry.hostname = event.hostname;
        entry.map = event.map;
        entry.connectedPlayers = event.players;
        entry.maxPlayers = event.maxPlayers;
        if (event.round !== undefined) entry.round = event.round;
        if (event.maxRounds !== undefined) entry.maxRounds = event.maxRounds;
        if (event.ctScore !== undefined) entry.ctScore = event.ctScore;
        if (event.tScore !== undefined) entry.tScore = event.tScore;
        if (event.clock !== undefined) entry.clock = event.clock;
        if (event.phase !== undefined) entry.phase = event.phase;
        if (event.bombPlanted !== undefined) entry.bombPlanted = event.bombPlanted;
        return;

      case "player_snapshot": {
        for (const p of event.players) {
          const existing = entry.players.get(p.steamId64);
          entry.players.set(p.steamId64, {
            steamId64: p.steamId64,
            steamId: p.steamId,
            nickname: p.nickname,
            avatarSeed: p.steamId64,
            ...(existing?.avatarUrl ? { avatarUrl: existing.avatarUrl } : {}),
            team: p.team,
            kills: p.kills,
            deaths: p.deaths,
            assists: p.assists,
            score: p.score,
            ping: p.ping,
            alive: p.alive,
            health: p.health,
            money: p.money,
            mvps: p.mvps,
            connectedFor: p.connectedSeconds,
          });
        }
        // O snapshot do plugin sempre traz o elenco INTEIRO atual — quem não
        // aparece mais mesmo sem um player_disconnect explícito, saiu.
        const present = new Set(event.players.map((p) => p.steamId64));
        for (const id of [...entry.players.keys()]) {
          if (!present.has(id)) entry.players.delete(id);
        }
        return;
      }

      case "map_start":
        entry.map = event.map;
        entry.round = 0;
        entry.ctScore = 0;
        entry.tScore = 0;
        entry.rounds = [];
        entry.bombPlanted = false;
        entry.phase = "warmup";
        entry.startedAt = event.timestamp;
        entry.players.clear();
        return;

      case "map_end":
        entry.phase = "ended";
        return;

      case "round_start":
        entry.round = event.round;
        entry.phase = "freezetime";
        entry.bombPlanted = false;
        return;

      case "round_end":
        entry.ctScore = event.ctScore;
        entry.tScore = event.tScore;
        entry.bombPlanted = false;
        entry.phase = "freezetime";
        entry.rounds.push({ round: event.round, winner: event.winner, reason: event.reason });
        if (entry.rounds.length > MAX_ROUNDS_HISTORY) entry.rounds.shift();
        return;

      case "player_connect":
        if (!entry.players.has(event.steamId64)) {
          entry.players.set(event.steamId64, {
            steamId64: event.steamId64,
            steamId: event.steamId,
            nickname: event.nickname,
            avatarSeed: event.steamId64,
            team: "SPEC",
            kills: 0,
            deaths: 0,
            assists: 0,
            score: 0,
            ping: 0,
            alive: false,
            health: 0,
            money: 0,
            mvps: 0,
            connectedFor: 0,
          });
        }
        return;

      case "player_disconnect":
        entry.players.delete(event.steamId64);
        return;

      case "player_team": {
        const player = entry.players.get(event.steamId64);
        if (player) player.team = event.team;
        return;
      }

      case "player_death": {
        // Kills/deaths/assists reais vêm do próximo player_snapshot
        // (GetClientFrags/GetClientDeaths/CS_GetClientAssists são a fonte
        // de verdade) — aqui só zera vida na hora, pra não esperar o
        // snapshot periódico pra marcar a vítima como morta.
        const victim = entry.players.get(event.victimSteamId64);
        if (victim) {
          victim.alive = false;
          victim.health = 0;
        }
        return;
      }

      case "bomb_planted":
        entry.bombPlanted = true;
        entry.phase = "bomb";
        return;

      case "bomb_defused":
      case "bomb_exploded":
        entry.bombPlanted = false;
        return;
    }
  }

  /** Remove servidores sem snapshot novo há tempo demais (server caiu, plugin parou/travou). */
  private pruneStale(): void {
    const cutoff = Date.now() - this.staleMs;
    for (const [id, entry] of this.servers) {
      if (entry.lastSeenAt < cutoff) this.servers.delete(id);
    }
  }

  getPrimaryServerId(): string | null {
    this.pruneStale();
    let best: ServerEntry | null = null;
    for (const entry of this.servers.values()) {
      if (!best || entry.connectedPlayers > best.connectedPlayers) best = entry;
    }
    return best?.serverId ?? null;
  }

  getSnapshot(serverId: string): LiveMatchSnapshot | null {
    const entry = this.servers.get(serverId);
    if (!entry) return null;
    return {
      serverId: entry.serverId,
      map: entry.map,
      phase: entry.phase,
      round: entry.round,
      maxRounds: entry.maxRounds,
      ctScore: entry.ctScore,
      tScore: entry.tScore,
      clock: entry.clock,
      bombPlanted: entry.bombPlanted,
      rounds: entry.rounds,
      players: [...entry.players.values()],
      startedAt: entry.startedAt,
    };
  }

  getPrimarySnapshot(): LiveMatchSnapshot | null {
    const id = this.getPrimaryServerId();
    return id ? this.getSnapshot(id) : null;
  }

  /** Todo SteamID64 conhecido agora, em qualquer servidor — pra saber quem ainda precisa de avatar. */
  allKnownSteamIds(): string[] {
    const ids = new Set<string>();
    for (const entry of this.servers.values()) {
      for (const id of entry.players.keys()) ids.add(id);
    }
    return [...ids];
  }

  /** Aplica um avatar já resolvido pela Steam Web API (chamado pelo backend, nunca pelo plugin). */
  setAvatarUrl(steamId64: string, avatarUrl: string): void {
    for (const entry of this.servers.values()) {
      const player = entry.players.get(steamId64);
      if (player) player.avatarUrl = avatarUrl;
    }
  }
}
