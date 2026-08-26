import type { NetworkStats, TrendPoint } from "./types";
import { UNIQUE_MAPS, makeRng } from "./seed";
import { PLAYERS, kd } from "./players";
import { MATCHES } from "./matches";
import { SERVERS } from "./servers";

const rng = makeRng(0x33c9);

const playersByHour: TrendPoint[] = Array.from({ length: 24 }, (_, hour) => ({
  label: `${String(hour).padStart(2, "0")}h`,
  value: SERVERS.reduce((total, server) => total + (server.load24h[hour] ?? 0), 0),
}));

const WEEK = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const matchesByDay: TrendPoint[] = Array.from({ length: 14 }, (_, i) => ({
  label: WEEK[(i + 3) % 7]!,
  value: rng.int(28, 96) + (i % 7 >= 4 ? 34 : 0),
}));

const mapShare: TrendPoint[] = UNIQUE_MAPS.slice(0, 8)
  .map((map, i) => ({
    label: map,
    value: Math.round(940 * Math.pow(0.86, i)) + rng.int(-28, 28),
  }))
  .sort((a, b) => b.value - a.value);

const weaponShare: TrendPoint[] = [
  { label: "ak47", value: 184_920 },
  { label: "m4a1", value: 152_311 },
  { label: "awp", value: 96_740 },
  { label: "deagle", value: 61_205 },
  { label: "mp5navy", value: 38_412 },
  { label: "famas", value: 24_806 },
  { label: "knife", value: 9_431 },
];

const totals = PLAYERS.reduce(
  (acc, p) => ({
    kills: acc.kills + p.stats.kills,
    headshots: acc.headshots + p.stats.headshots,
    rounds: acc.rounds + p.stats.roundsPlayed,
  }),
  { kills: 0, headshots: 0, rounds: 0 },
);

const bestKdPlayer = [...PLAYERS].sort((a, b) => kd(b.stats) - kd(a.stats))[0]!;
const mostActivePlayer = [...PLAYERS].sort((a, b) => b.stats.timePlayed - a.stats.timePlayed)[0]!;
const streakPlayer = [...PLAYERS].sort(
  (a, b) => b.stats.longestWinStreak - a.stats.longestWinStreak,
)[0]!;

export const NETWORK_STATS: NetworkStats = {
  playersTotal: 18_463,
  playersOnline: SERVERS.reduce((n, s) => n + s.players, 0),
  matches: 12_874,
  rounds: Math.round(totals.rounds / 9),
  kills: totals.kills,
  headshots: totals.headshots,
  bombsPlanted: 41_338,
  uptimeHours: 21_640,
  // Esta página continua 100% mock — o catálogo real de demos vive no
  // backend novo (SFTP), não neste gerador. Número só de enfeite.
  demosStored: 1_317,
  bytesStored: 412 * 1024 * 1024 * 1024,
  topMap: { map: mapShare[0]!.label, matches: mapShare[0]!.value },
  mostActive: {
    nickname: mostActivePlayer.nickname,
    hours: Math.round(mostActivePlayer.stats.timePlayed / 60),
  },
  bestKd: { nickname: bestKdPlayer.nickname, kd: kd(bestKdPlayer.stats) },
  longestStreak: {
    nickname: streakPlayer.nickname,
    wins: streakPlayer.stats.longestWinStreak,
  },
  playersByHour,
  matchesByDay,
  mapShare,
  weaponShare,
};

export const RECENT_MATCH_COUNT = MATCHES.length;
