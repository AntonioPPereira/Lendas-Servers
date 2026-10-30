import type { LiveMatch, LivePlayer, Team } from "@/data/types";
import { makeRng } from "@/data/seed";
import { INITIAL_MATCH } from "@/data/live";
import { SERVERS } from "@/data/servers";
import type { LiveEvent, LiveHandler, LiveTransport } from "./transport";

const rng = makeRng(Date.now() % 100000);

const ROUND_TIME = 115;
const FREEZE_TIME = 6;
const BOMB_TIME = 35;

function drift(player: LivePlayer): { x: number; y: number } {
  const pos = player.pos ?? { x: 0.5, y: 0.5 };
  if (!player.alive) return pos;
  // Everyone leaks toward mid; that is where a public server fight happens.
  const pullY = player.team === "CT" ? 0.46 : 0.54;
  return {
    x: Math.min(0.94, Math.max(0.06, pos.x + rng.float(-0.035, 0.035))),
    y: Math.min(0.94, Math.max(0.06, pos.y + (pullY - pos.y) * 0.05 + rng.float(-0.02, 0.02))),
  };
}

function respawn(players: LivePlayer[]): LivePlayer[] {
  return players.map((player) => ({
    ...player,
    alive: true,
    health: 100,
    money: Math.min(16000, player.money + rng.int(1400, 3400)),
    pos:
      player.team === "CT"
        ? { x: rng.float(0.2, 0.84), y: rng.float(0.1, 0.3) }
        : { x: rng.float(0.16, 0.8), y: rng.float(0.7, 0.9) },
  }));
}

function aliveCount(players: LivePlayer[], team: Team): number {
  return players.reduce((n, p) => n + (p.alive && p.team === team ? 1 : 0), 0);
}

/**
 * Avança a partida um segundo: placar, rodadas e vivos. Não gera evento de
 * atividade nenhum — abates e rodadas ficam no placar e no histórico, o feed
 * de atividade só fala de gente entrando e saindo do servidor.
 */
export function stepMatch(current: LiveMatch): LiveMatch {
  let match: LiveMatch = { ...current, players: current.players.map((p) => ({ ...p, pos: drift(p) })) };

  if (match.phase === "freezetime") {
    const clock = match.clock - 1;
    if (clock > 0) return { ...match, clock };
    return { ...match, phase: "live", clock: ROUND_TIME, players: respawn(match.players) };
  }

  const clock = Math.max(0, match.clock - 1);
  match = { ...match, clock };

  // Bomb plant: T side, late round, once per round.
  if (!match.bombPlanted && match.phase === "live" && clock < 55 && rng.chance(0.035)) {
    const planter = match.players.find((p) => p.team === "T" && p.alive);
    if (planter) {
      match = { ...match, bombPlanted: true, phase: "bomb", clock: BOMB_TIME };
    }
  }

  // Trades. Frequency is tuned so a round resolves in a believable window.
  if (rng.chance(0.34)) {
    const attackerTeam: Team = rng.chance(0.5) ? "CT" : "T";
    const victimTeam: Team = attackerTeam === "CT" ? "T" : "CT";
    const attackers = match.players.filter((p) => p.alive && p.team === attackerTeam);
    const victims = match.players.filter((p) => p.alive && p.team === victimTeam);

    if (attackers.length && victims.length) {
      const attacker = rng.pick(attackers);
      const victim = rng.pick(victims);

      match = {
        ...match,
        players: match.players.map((p) => {
          if (p.steamId64 === attacker.steamId64) {
            return { ...p, kills: p.kills + 1, score: p.score + 2, health: Math.max(8, p.health - rng.int(0, 45)) };
          }
          if (p.steamId64 === victim.steamId64) {
            return { ...p, alive: false, health: 0, deaths: p.deaths + 1 };
          }
          return p;
        }),
      };
    }
  }

  const ctAlive = aliveCount(match.players, "CT");
  const tAlive = aliveCount(match.players, "T");
  const wipe = ctAlive === 0 || tAlive === 0;
  const expired = match.clock === 0;

  if (wipe || expired) {
    const winner: Exclude<Team, "SPEC"> =
      ctAlive === 0 ? "T" : tAlive === 0 ? "CT" : match.bombPlanted ? "T" : "CT";
    const reason = wipe ? "elimination" : match.bombPlanted ? "bomb" : "time";

    const ctScore = match.ctScore + (winner === "CT" ? 1 : 0);
    const tScore = match.tScore + (winner === "T" ? 1 : 0);

    const mvpPool = match.players.filter((p) => p.team === winner);
    const mvp = mvpPool.length
      ? mvpPool.reduce((best, p) => (p.kills > best.kills ? p : best), mvpPool[0]!)
      : null;

    return {
      ...match,
      ctScore,
      tScore,
      round: match.round + 1,
      phase: "freezetime",
      clock: FREEZE_TIME,
      bombPlanted: false,
      rounds: [...match.rounds, { round: match.round, winner, reason }],
      players: match.players.map((p) =>
        p.steamId64 === mvp?.steamId64 ? { ...p, mvps: p.mvps + 1, score: p.score + 4 } : p,
      ),
    };
  }

  return match;
}

/**
 * Drives the panel from generated data. Same event shape as the socket
 * transport, so nothing downstream can tell the difference.
 *
 * Não gera mais feed de atividade (join/leave/blocked): isso agora vem de
 * verdade via `useRealActivity` (lendas_steamfilter, ver server/README.md).
 * Inventar entradas/bloqueios aqui violaria a mesma fonte que acabou de
 * virar real — o slice `activity` do LiveState fica vazio de propósito.
 */
export class MockTransport implements LiveTransport {
  readonly kind = "mock" as const;
  private timer: number | null = null;
  private handshake: number | null = null;
  private match: LiveMatch = INITIAL_MATCH;

  connect(handler: LiveHandler) {
    const emit = (event: LiveEvent) => handler(event);

    emit({ type: "connection", payload: "connecting" });

    // A short handshake so loading states are real, not decorative.
    this.handshake = window.setTimeout(() => {
      emit({
        type: "snapshot",
        payload: { match: this.match, servers: SERVERS, activity: [] },
      });
      emit({ type: "connection", payload: "live" });

      this.timer = window.setInterval(() => {
        this.match = stepMatch(this.match);
        emit({ type: "match", payload: this.match });
      }, 1000);
    }, 620);
  }

  disconnect() {
    if (this.handshake) window.clearTimeout(this.handshake);
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    this.handshake = null;
  }
}
