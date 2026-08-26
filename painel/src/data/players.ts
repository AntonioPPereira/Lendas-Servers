import type { MapAffinity, MatchSummary, Player, PlayerStats } from "./types";
import {
  COUNTRIES,
  MAPS,
  NICKNAMES,
  RIFLES,
  UNIQUE_MAPS,
  isoAgo,
  makeRng,
  steamIds,
} from "./seed";

function buildStats(rng: ReturnType<typeof makeRng>, skill: number): PlayerStats {
  const matches = rng.int(40, 620);
  const roundsPlayed = matches * rng.int(18, 27);
  const kills = Math.round(roundsPlayed * (0.55 + skill * 0.55));
  const deaths = Math.round(roundsPlayed * (0.92 - skill * 0.32));
  const assists = Math.round(kills * rng.float(0.14, 0.3));
  const headshots = Math.round(kills * (0.32 + skill * 0.3));
  const wins = Math.round(matches * (0.38 + skill * 0.3));

  return {
    kills,
    deaths,
    assists,
    headshots,
    score: Math.round(kills * 2 + assists - deaths * 0.5 + wins * 4),
    matches,
    wins,
    losses: matches - wins,
    roundsPlayed,
    mvps: Math.round(roundsPlayed * (0.05 + skill * 0.09)),
    timePlayed: Math.round(matches * rng.float(28, 46)),
    bestWeapon: rng.pick(RIFLES),
    longestWinStreak: rng.int(3 + Math.round(skill * 5), 6 + Math.round(skill * 18)),
  };
}

function buildMapAffinity(rng: ReturnType<typeof makeRng>, skill: number): MapAffinity[] {
  return rng
    .shuffle(UNIQUE_MAPS)
    .slice(0, 4)
    .map((map) => ({
      map,
      matches: rng.int(12, 180),
      winRate: Math.round((0.36 + skill * 0.28 + rng.float(-0.08, 0.08)) * 100),
    }))
    .sort((a, b) => b.matches - a.matches);
}

function buildRecentForm(
  rng: ReturnType<typeof makeRng>,
  skill: number,
  playerIndex: number,
): MatchSummary[] {
  return Array.from({ length: 8 }, (_, i) => {
    const side = rng.chance(0.5) ? "CT" : "T";
    // Decide the result first, then build a scoreline that matches it.
    const won = rng.chance(0.34 + skill * 0.34);
    const loserScore = rng.int(3, 14);
    const own = won ? 16 : loserScore;
    const other = won ? loserScore : 16;
    const kills = Math.round(rng.int(9, 22) * (0.7 + skill * 0.7));
    return {
      id: `m_${playerIndex}_${i}`,
      map: rng.pick(MAPS),
      playedAt: isoAgo(i * rng.int(240, 900) + rng.int(30, 200)),
      durationSec: rng.int(1500, 3300),
      ctScore: side === "CT" ? own : other,
      tScore: side === "T" ? own : other,
      winner: won ? side : side === "CT" ? "T" : "CT",
      side,
      kills,
      deaths: rng.int(8, 21),
      assists: rng.int(1, 9),
    } satisfies MatchSummary;
  });
}

function buildPlayers(): Player[] {
  const rng = makeRng(0x51de);

  const raw = NICKNAMES.map((nickname, index) => {
    // Skill is a smooth curve, not noise: a real ladder has a long tail.
    const skill = Math.pow(1 - index / NICKNAMES.length, 1.35) * rng.float(0.82, 1.06);
    const ids = steamIds(rng, index);
    const online = rng.chance(0.22);

    return {
      ...ids,
      nickname,
      avatarSeed: nickname,
      country: rng.pick(COUNTRIES),
      rank: 0,
      rating: 0,
      firstSeen: isoAgo(rng.int(60, 1400) * 60 * 24),
      lastSeen: online ? isoAgo(rng.int(0, 3)) : isoAgo(rng.int(20, 30000)),
      online,
      currentServerId: online ? `srv-0${rng.int(1, 4)}` : null,
      stats: buildStats(rng, skill),
      favoriteMaps: buildMapAffinity(rng, skill),
      recentForm: buildRecentForm(rng, skill, index),
    } satisfies Player;
  });

  return raw
    .map((player) => ({
      ...player,
      rating: Math.round(
        900 +
          (player.stats.kills / Math.max(1, player.stats.deaths)) * 620 +
          (player.stats.wins / Math.max(1, player.stats.matches)) * 340 +
          Math.min(player.stats.matches, 400) * 0.7,
      ),
    }))
    .sort((a, b) => b.rating - a.rating)
    .map((player, index) => ({ ...player, rank: index + 1 }));
}

export const PLAYERS: Player[] = buildPlayers();

export const PLAYERS_BY_ID = new Map(PLAYERS.map((p) => [p.steamId64, p]));

export function findPlayer(id: string): Player | undefined {
  return (
    PLAYERS_BY_ID.get(id) ??
    PLAYERS.find((p) => p.steamId === id || p.nickname.toLowerCase() === id.toLowerCase())
  );
}

export function kd(stats: Pick<PlayerStats, "kills" | "deaths">): number {
  return stats.kills / Math.max(1, stats.deaths);
}

export function winRate(stats: Pick<PlayerStats, "wins" | "matches">): number {
  return (stats.wins / Math.max(1, stats.matches)) * 100;
}

export function hsRate(stats: Pick<PlayerStats, "kills" | "headshots">): number {
  return (stats.headshots / Math.max(1, stats.kills)) * 100;
}
