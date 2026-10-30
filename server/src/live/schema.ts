import { z } from "zod";

/**
 * Contrato POST /api/live/events, do novo plugin `lendas_live.smx`.
 *
 * Eventos discretos (round/kill/bomba/conexão) chegam assim que acontecem,
 * agrupados em lote pelo plugin (ver server/README.md — nunca um request por
 * evento). Estado completo do jogador/servidor chega via "snapshot"
 * periódico, não a cada frame — o plugin nunca envia um snapshot por tick.
 *
 * Time em maiúsculo casa com o `Team` do frontend (`painel/src/data/types.ts`).
 * Os dois lados são mantidos em sincronia manualmente — não há pacote
 * compartilhado entre server/ e painel/.
 */

const TEAM = z.enum(["CT", "T", "SPEC"]);

/** SteamID64 de conta individual: 17 dígitos, sempre >= 76561197960265728 (SteamID_BASE). */
const STEAM_ID64_MIN = 76561197960265728n;
export const steamId64Schema = z
  .string()
  .regex(/^\d{17}$/, "SteamID64 deve ter 17 dígitos")
  // O zod não interrompe a cadeia no primeiro check que falha — este refine
  // roda mesmo quando o regex acima já reprovou, então precisa ser seguro
  // pra qualquer string (nunca assumir que já é numérica antes do BigInt).
  .refine((value) => /^\d+$/.test(value) && BigInt(value) >= STEAM_ID64_MIN, "SteamID64 fora da faixa válida");

export function isValidSteamId64(value: string): boolean {
  return steamId64Schema.safeParse(value).success;
}

const timestamp = z.string().datetime({ offset: true }).or(z.string().datetime());

const playerStateSchema = z.object({
  steamId64: steamId64Schema,
  steamId: z.string().min(1).max(32),
  nickname: z.string().min(1).max(64),
  userId: z.number().int().nonnegative(),
  team: TEAM,
  alive: z.boolean(),
  health: z.number().int().min(0).max(1000),
  armor: z.number().int().min(0).max(1000),
  money: z.number().int().min(0).max(65535),
  kills: z.number().int().min(0),
  deaths: z.number().int().min(0),
  assists: z.number().int().min(0),
  score: z.number().int().min(0),
  ping: z.number().int().min(0).max(2000),
  weapon: z.string().max(64),
  mvps: z.number().int().min(0),
  /** `GetClientTime()` — segundos desde que este cliente conectou. */
  connectedSeconds: z.number().int().min(0),
});
export type PlayerState = z.infer<typeof playerStateSchema>;

const serverSnapshotSchema = z.object({
  kind: z.literal("server_snapshot"),
  hostname: z.string().min(1).max(128),
  map: z.string().min(1).max(64),
  players: z.number().int().min(0),
  maxPlayers: z.number().int().min(1),
  round: z.number().int().min(0).optional(),
  maxRounds: z.number().int().min(0).optional(),
  ctScore: z.number().int().min(0).optional(),
  tScore: z.number().int().min(0).optional(),
  /** Segundos restantes no round atual — omitido quando o plugin não souber calcular com confiança. */
  clock: z.number().int().min(0).optional(),
  phase: z.enum(["warmup", "freezetime", "live", "bomb", "halftime", "ended"]).optional(),
  bombPlanted: z.boolean().optional(),
  timestamp,
});

const playerSnapshotSchema = z.object({
  kind: z.literal("player_snapshot"),
  players: z.array(playerStateSchema).max(64),
  timestamp,
});

const mapStartSchema = z.object({ kind: z.literal("map_start"), map: z.string().min(1).max(64), timestamp });
const mapEndSchema = z.object({ kind: z.literal("map_end"), map: z.string().min(1).max(64), timestamp });

const roundStartSchema = z.object({
  kind: z.literal("round_start"),
  round: z.number().int().min(0),
  timestamp,
});

/** Mesmo domínio de `RoundEndReason` no frontend (`painel/src/data/types.ts`) — o plugin já manda o valor mapeado. */
const roundEndSchema = z.object({
  kind: z.literal("round_end"),
  round: z.number().int().min(0),
  winner: z.enum(["CT", "T"]),
  reason: z.enum(["bomb", "defuse", "elimination", "time", "hostage"]),
  ctScore: z.number().int().min(0),
  tScore: z.number().int().min(0),
  timestamp,
});

const playerConnectSchema = z.object({
  kind: z.literal("player_connect"),
  steamId64: steamId64Schema,
  steamId: z.string().min(1).max(32),
  nickname: z.string().min(1).max(64),
  userId: z.number().int().nonnegative(),
  timestamp,
});

const playerDisconnectSchema = z.object({
  kind: z.literal("player_disconnect"),
  steamId64: steamId64Schema,
  userId: z.number().int().nonnegative(),
  timestamp,
});

const playerTeamSchema = z.object({
  kind: z.literal("player_team"),
  steamId64: steamId64Schema,
  team: TEAM,
  timestamp,
});

const playerDeathSchema = z.object({
  kind: z.literal("player_death"),
  victimSteamId64: steamId64Schema,
  victimTeam: TEAM,
  /** Ausente em suicídio / morte pelo mundo (queda, fogo amigo do ambiente etc.). */
  attackerSteamId64: steamId64Schema.optional(),
  attackerTeam: TEAM.optional(),
  weapon: z.string().min(1).max(64),
  headshot: z.boolean(),
  timestamp,
});

const bombEventSchema = z.object({
  kind: z.enum(["bomb_planted", "bomb_defused", "bomb_exploded"]),
  timestamp,
});

export const liveIngestEventSchema = z.discriminatedUnion("kind", [
  serverSnapshotSchema,
  playerSnapshotSchema,
  mapStartSchema,
  mapEndSchema,
  roundStartSchema,
  roundEndSchema,
  playerConnectSchema,
  playerDisconnectSchema,
  playerTeamSchema,
  playerDeathSchema,
  bombEventSchema,
]);
export type LiveIngestEvent = z.infer<typeof liveIngestEventSchema>;

export const liveIngestPayloadSchema = z.object({
  serverId: z.string().min(1).max(64),
  events: z.array(liveIngestEventSchema).min(1).max(200),
});
export type LiveIngestPayload = z.infer<typeof liveIngestPayloadSchema>;
