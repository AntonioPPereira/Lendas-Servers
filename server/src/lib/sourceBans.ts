/**
 * Tradução do JSON que o plugin `lendas_bans` exporta (do SourceBans++)
 * para o shape que o painel consome (`painel/src/data/types.ts` → `Ban`).
 *
 * Toda a regra vive aqui, sem I/O, pra ser testável: o serviço só busca o
 * arquivo e chama estas funções.
 *
 * O plugin exporta o registro quase cru de propósito — converter SteamID
 * pra 64 bits exige inteiro de 64 bits, que SourcePawn não tem (int é 32).
 * Aqui isso é trivial com BigInt.
 */

export type BanState = "active" | "expired" | "permanent";
export type BanKind = "ban" | "mute" | "gag" | "silence";

/** Uma linha exatamente como o plugin escreve no JSON. */
export interface SourceBansRow {
  kind: "ban" | "comm";
  bid: number;
  authid: string;
  name: string;
  /** Unix seconds. */
  created: number;
  /** Unix seconds. 0 quando permanente. */
  ends: number;
  /** Segundos. 0 = permanente (convenção do SourceBans). */
  length: number;
  reason: string;
  country: string;
  /** "" enquanto vale; "U" (unbanned) ou "E" (expired) depois de encerrado. */
  removeType: string;
  admin: string;
  /** "ip:porta" do servidor onde a punição foi aplicada. */
  server: string;
  /** Só para `comm`: tipo da restrição de comunicação. */
  commType: number;
  ipMasked: string;
}

export interface BanDto {
  id: string;
  target: {
    steamId64: string;
    steamId: string;
    nickname: string;
    avatarSeed: string;
    /**
     * Foto real da Steam. Preenchida pela rota, não aqui: este módulo é
     * tradução pura de linha do SourceBans e não fala com a rede. Ausente
     * quando o perfil é privado ou a chave da Steam não está configurada —
     * e aí o painel desenha o emblema gerado a partir do `avatarSeed`.
     */
    avatarUrl?: string;
    country: string;
  };
  kind: BanKind;
  reason: string;
  admin: string;
  createdAt: string;
  expiresAt: string | null;
  state: BanState;
  serverName: string;
  serverId: string;
  ipMasked: string;
  evidence: string | null;
}

/** Base do SteamID64 — o menor ID de conta individual da Steam. */
const STEAM64_BASE = 76561197960265728n;
const STEAM_ID_PATTERN = /^STEAM_[0-5]:([01]):(\d+)$/i;

/**
 * "STEAM_0:1:52341" → "76561198065948410".
 *
 * Devolve `null` quando não dá pra converter — ban por IP não tem authid, e
 * contas antigas aparecem como STEAM_ID_PENDING. Nesses casos o painel
 * simplesmente não oferece link de perfil, em vez de exibir um ID inventado.
 */
export function steamIdToSteamId64(authid: string): string | null {
  const match = STEAM_ID_PATTERN.exec(authid.trim());
  if (!match) return null;
  const [, y, z] = match as unknown as [string, string, string];
  return (STEAM64_BASE + BigInt(z) * 2n + BigInt(y)).toString();
}

/**
 * Ordem importa: uma punição levantada por um admin ("U") deixa de valer
 * mesmo que fosse permanente, então `removeType` é checado ANTES de
 * `length === 0`.
 */
export function deriveBanState(row: SourceBansRow, nowSeconds: number): BanState {
  if (row.removeType.trim() !== "") return "expired";
  if (row.length === 0) return "permanent";
  if (row.ends > 0 && row.ends <= nowSeconds) return "expired";
  return "active";
}

/**
 * `sb_comms.type` no SourceBans++: 1 = mute (voz), 2 = gag (chat). Qualquer
 * outro valor cai em "silence", que é como o painel chama os dois juntos —
 * nunca vira "ban", pra não confundir restrição de fala com banimento.
 */
export function deriveBanKind(row: SourceBansRow): BanKind {
  if (row.kind === "ban") return "ban";
  if (row.commType === 1) return "mute";
  if (row.commType === 2) return "gag";
  return "silence";
}

function toIso(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

/**
 * `serverResolver` traduz "ip:porta" num nome amigável quando o backend já
 * conhece aquele servidor. É best-effort de propósito: um ban aplicado num
 * servidor que não existe mais continua aparecendo, mostrando "ip:porta".
 */
export function toBanDto(
  row: SourceBansRow,
  nowSeconds: number,
  serverResolver?: (hostPort: string) => { id: string; name: string } | undefined,
): BanDto {
  const steamId64 = steamIdToSteamId64(row.authid);
  const state = deriveBanState(row, nowSeconds);
  const server = row.server ? serverResolver?.(row.server) : undefined;
  const [host = "", port = ""] = row.server.split(":");

  return {
    // O prefixo evita colisão: sb_bans e sb_comms têm `bid` numerados à parte.
    id: `${row.kind === "ban" ? "b" : "c"}${row.bid}`,
    target: {
      steamId64: steamId64 ?? "",
      steamId: row.authid,
      nickname: row.name || "(sem nick)",
      // Semente estável pro avatar gerado: nunca uma URL remota.
      avatarSeed: steamId64 ?? (row.authid || String(row.bid)),
      country: row.country.trim().toLowerCase(),
    },
    kind: deriveBanKind(row),
    reason: row.reason.trim(),
    admin: row.admin.trim() || "Console",
    createdAt: toIso(row.created),
    // Permanente não tem data de fim — null, nunca uma data inventada.
    expiresAt: row.length === 0 || row.ends === 0 ? null : toIso(row.ends),
    state,
    serverName: server?.name ?? (row.server || "—"),
    serverId: server?.id ?? (host ? `${host.replace(/\./g, "-")}-${port}` : ""),
    ipMasked: row.ipMasked,
    // O SourceBans não guarda link de prova; não inventamos um.
    evidence: null,
  };
}

/** Busca por nick, SteamID (nas duas formas) ou motivo. */
export function matchesQuery(ban: BanDto, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    ban.target.nickname.toLowerCase().includes(needle) ||
    ban.target.steamId.toLowerCase().includes(needle) ||
    ban.target.steamId64.includes(needle) ||
    ban.reason.toLowerCase().includes(needle) ||
    ban.admin.toLowerCase().includes(needle)
  );
}
