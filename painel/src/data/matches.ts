import type { LivePlayer, MatchDetail, RoundEndReason, RoundResult, Team } from "./types";
import { MAPS, isoAgo, makeRng } from "./seed";
import { PLAYERS } from "./players";
import { SERVERS } from "./servers";

type Side = Exclude<Team, "SPEC">;

const rng = makeRng(0x4a71);

/**
 * Rounds come in runs, not alternating noise: a side that just won an eco is
 * likely to win the next one too. Take 1-4 at a time from whichever side still
 * has wins left, weighted by what remains.
 */
function buildRounds(ctScore: number, tScore: number): RoundResult[] {
  const order: Side[] = [];
  let ct = ctScore;
  let t = tScore;

  while (ct > 0 || t > 0) {
    const side: Side = ct === 0 ? "T" : t === 0 ? "CT" : rng.chance(ct / (ct + t)) ? "CT" : "T";
    const remaining = side === "CT" ? ct : t;
    const run = Math.min(remaining, rng.int(1, 4));
    for (let i = 0; i < run; i += 1) order.push(side);
    if (side === "CT") ct -= run;
    else t -= run;
  }

  return order.map((winner, i) => {
    const ctReasons: RoundEndReason[] = ["elimination", "defuse", "time", "elimination"];
    const tReasons: RoundEndReason[] = ["elimination", "bomb", "bomb", "elimination"];
    return {
      round: i + 1,
      winner,
      reason: rng.pick(winner === "CT" ? ctReasons : tReasons),
    };
  });
}

function buildScoreboard(rounds: number, seedOffset: number): LivePlayer[] {
  const roster = rng.shuffle(PLAYERS.slice(0, 46)).slice(0, 10);
  return roster
    .map((player, i) => {
      const form = 0.55 + ((seedOffset + i) % 5) * 0.12 + rng.float(-0.1, 0.22);
      const kills = Math.max(1, Math.round(rounds * 0.72 * form));
      return {
        steamId64: player.steamId64,
        steamId: player.steamId,
        nickname: player.nickname,
        avatarSeed: player.avatarSeed,
        team: (i < 5 ? "CT" : "T") as Team,
        kills,
        deaths: Math.max(1, Math.round(rounds * 0.68 * (1.5 - form))),
        assists: rng.int(1, 9),
        score: kills * 2 + rng.int(0, 22),
        ping: rng.int(8, 96),
        alive: true,
        health: 100,
        money: rng.int(800, 16000),
        mvps: rng.int(0, 5),
        connectedFor: rng.int(1200, 4200),
      } satisfies LivePlayer;
    })
    .sort((a, b) => b.score - a.score);
}

function buildMatches(): MatchDetail[] {
  return Array.from({ length: 34 }, (_, i) => {
    const winnerSide: Side = rng.chance(0.5) ? "CT" : "T";
    const loserScore = rng.int(4, 15);
    const ctScore = winnerSide === "CT" ? 16 : loserScore;
    const tScore = winnerSide === "T" ? 16 : loserScore;
    const rounds = buildRounds(ctScore, tScore);
    const scoreboard = buildScoreboard(rounds.length, i);
    const server = rng.pick(SERVERS.slice(0, 2));
    const minutesAgo = i * rng.int(160, 420) + rng.int(25, 90);
    const top = scoreboard[0]!;

    return {
      id: `mt_${String(2481 - i).padStart(4, "0")}`,
      map: rng.pick(MAPS),
      playedAt: isoAgo(minutesAgo),
      durationSec: rounds.length * rng.int(78, 112),
      ctScore,
      tScore,
      winner: winnerSide,
      serverId: server.id,
      serverName: server.shortName,
      playersCount: scoreboard.length,
      // Vínculo com uma demo real ainda não existe (exigiria casar esta
      // partida mockada com um arquivo real por data/hora/mapa — sem um
      // registro real de partida dos dois lados, isso seria inventado).
      demoId: null,
      mvp: {
        steamId64: top.steamId64,
        steamId: top.steamId,
        nickname: top.nickname,
        avatarSeed: top.avatarSeed,
        country: "BR",
      },
      rounds,
      scoreboard,
    } satisfies MatchDetail;
  });
}

export const MATCHES: MatchDetail[] = buildMatches();

export const MATCHES_BY_ID = new Map(MATCHES.map((m) => [m.id, m]));

export function roundsWonBy(rounds: RoundResult[], side: Side): number {
  return rounds.reduce((total, r) => total + (r.winner === side ? 1 : 0), 0);
}
