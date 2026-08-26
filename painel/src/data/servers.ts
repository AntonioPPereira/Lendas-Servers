import type { GameServer } from "./types";
import { makeRng } from "./seed";

const rng = makeRng(0x5e12);

function load(base: number): number[] {
  // A day of player counts with a believable evening peak.
  return Array.from({ length: 24 }, (_, hour) => {
    const peak = Math.exp(-Math.pow(hour - 21, 2) / 26) * base;
    const morning = Math.exp(-Math.pow(hour - 13, 2) / 30) * base * 0.45;
    return Math.max(0, Math.round(peak + morning + rng.float(-2.5, 2.5)));
  });
}

export const SERVERS: GameServer[] = [
  {
    id: "srv-01",
    name: "LENDAS #01 — PUBLIC 24/7",
    shortName: "PUBLIC #01",
    host: "177.54.148.20",
    port: 27015,
    state: "online",
    mode: "public",
    map: "de_dust2",
    players: 23,
    maxPlayers: 32,
    bots: 0,
    ping: 12,
    region: "BR-SP",
    regionLabel: "São Paulo, BR",
    tickrate: 100,
    secure: true,
    password: false,
    tags: ["24/7", "dust2", "ranked", "stats"],
    load24h: load(28),
  },
  {
    id: "srv-02",
    name: "LENDAS #02 — CLASSIC MIX",
    shortName: "MIX #02",
    host: "177.54.148.20",
    port: 27016,
    state: "online",
    mode: "competitive",
    map: "de_inferno",
    players: 10,
    maxPlayers: 12,
    bots: 0,
    ping: 14,
    region: "BR-SP",
    regionLabel: "São Paulo, BR",
    tickrate: 100,
    secure: true,
    password: false,
    tags: ["5v5", "mr15", "knife round", "demos"],
    load24h: load(11),
  },
];

export const SERVERS_BY_ID = new Map(SERVERS.map((s) => [s.id, s]));

export function serverAddress(server: GameServer): string {
  return `${server.host}:${server.port}`;
}

/** The string a player actually pastes into the CS:S console. */
export function connectCommand(server: GameServer): string {
  return `connect ${serverAddress(server)}`;
}

export const PRIMARY_SERVER = SERVERS[0]!;
