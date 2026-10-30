import type { LiveMatch, LivePlayer, RoundResult, Team } from "./types";
import { isoAgo, makeRng } from "./seed";
import { PLAYERS } from "./players";
import { PRIMARY_SERVER } from "./servers";

const rng = makeRng(0x7f3d);

/**
 * Spawn-ish coordinates on a normalised radar. CT holds the upper band,
 * T the lower one, with contact clustering around mid.
 */
function spawnPos(team: Team): { x: number; y: number } {
  if (team === "CT") {
    return { x: rng.float(0.18, 0.86), y: rng.float(0.12, 0.44) };
  }
  return { x: rng.float(0.14, 0.82), y: rng.float(0.56, 0.9) };
}

function buildLivePlayers(): LivePlayer[] {
  const roster = rng.shuffle(PLAYERS.slice(0, 60)).slice(0, 23);
  return roster.map((player, i) => {
    const team: Team = i < 12 ? "CT" : "T";
    const kills = rng.int(2, 24);
    const alive = rng.chance(0.62);
    return {
      steamId64: player.steamId64,
      steamId: player.steamId,
      nickname: player.nickname,
      avatarSeed: player.avatarSeed,
      team,
      kills,
      deaths: rng.int(3, 22),
      assists: rng.int(0, 8),
      score: kills * 2 + rng.int(0, 30),
      ping: rng.int(7, 128),
      alive,
      health: alive ? rng.int(12, 100) : 0,
      money: rng.int(650, 16000),
      mvps: rng.int(0, 4),
      connectedFor: rng.int(180, 7200),
      pos: spawnPos(team),
    } satisfies LivePlayer;
  });
}

function buildRoundHistory(): RoundResult[] {
  const history: RoundResult[] = [];
  let ct = 0;
  let t = 0;
  for (let i = 1; i <= 16; i += 1) {
    const winner: Exclude<Team, "SPEC"> =
      ct === 9 ? "T" : t === 7 ? "CT" : rng.chance(0.55) ? "CT" : "T";
    if (winner === "CT") ct += 1;
    else t += 1;
    history.push({
      round: i,
      winner,
      reason: winner === "CT"
        ? rng.pick(["elimination", "defuse", "time"] as const)
        : rng.pick(["elimination", "bomb", "bomb"] as const),
    });
  }
  return history;
}

export const INITIAL_MATCH: LiveMatch = {
  serverId: PRIMARY_SERVER.id,
  hostname: PRIMARY_SERVER.name,
  map: PRIMARY_SERVER.map,
  phase: "live",
  round: 17,
  maxRounds: 30,
  ctScore: 9,
  tScore: 7,
  clock: 102,
  bombPlanted: false,
  rounds: buildRoundHistory(),
  players: buildLivePlayers(),
  startedAt: isoAgo(34),
};
