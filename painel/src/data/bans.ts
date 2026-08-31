import type { Ban, BanKind, BanState } from "./types";
import { ADMINS, BAN_DURATIONS, BAN_REASONS, NOW, isoAgo, makeRng } from "./seed";
import { PLAYERS } from "./players";
import { SERVERS } from "./servers";

const rng = makeRng(0x8b21);

function buildBans(): Ban[] {
  const roster = rng.shuffle(PLAYERS).slice(0, 42);

  return roster.map((player, i) => {
    const duration = rng.pick(BAN_DURATIONS);
    const createdMinutesAgo = i * rng.int(240, 1500) + rng.int(20, 400);
    const createdAt = isoAgo(createdMinutesAgo);
    const expiresAt =
      duration.hours === 0
        ? null
        : new Date(new Date(createdAt).getTime() + duration.hours * 3_600_000).toISOString();

    const state: BanState =
      expiresAt === null
        ? "permanent"
        : new Date(expiresAt) > NOW
          ? "active"
          : "expired";

    const kind: BanKind = rng.chance(0.76)
      ? "ban"
      : rng.pick(["mute", "gag", "silence"] as const);

    const server = rng.pick(SERVERS);

    return {
      id: `bn_${String(9140 - i)}`,
      target: {
        steamId64: player.steamId64,
        steamId: player.steamId,
        nickname: player.nickname,
        avatarSeed: player.avatarSeed,
        country: player.country,
      },
      kind,
      reason: rng.pick(BAN_REASONS),
      admin: rng.pick(ADMINS),
      createdAt,
      expiresAt,
      state,
      serverName: server.shortName,
      serverId: server.id,
      ipMasked: `${rng.int(177, 201)}.${rng.int(10, 240)}.xxx.xxx`,
      evidence: rng.chance(0.35) ? `dm_${rng.int(2400, 2481)}` : null,
    } satisfies Ban;
  });
}

export const BANS: Ban[] = buildBans().sort(
  (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
);

export const BANS_BY_ID = new Map(BANS.map((b) => [b.id, b]));

// `banTimeLeft` saiu daqui para `lib/banTime.ts`: a tela de Banimentos a
// usava e, por morar neste arquivo, puxava junto os nomes inventados.
export { banTimeLeft } from "@/lib/banTime";
