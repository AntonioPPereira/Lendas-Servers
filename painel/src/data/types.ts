/**
 * Domain model for the Lendas panel.
 *
 * Every shape here mirrors what a CS:S server plugin (SourceMod / GameME /
 * SourceBans++) can realistically emit, so swapping the mock transport for a
 * real API means changing the data source, never the components.
 */

export type Team = "CT" | "T" | "SPEC";

export type ServerState = "online" | "offline" | "restarting";

export type GameMode =
  | "public"
  | "competitive"
  | "deathmatch"
  | "gungame"
  | "awp"
  | "surf"
  | "retake"
  | "zombie";

export type MatchPhase =
  | "warmup"
  | "freezetime"
  | "live"
  | "bomb"
  | "halftime"
  | "ended";

export type RoundEndReason =
  | "bomb"
  | "defuse"
  | "elimination"
  | "time"
  | "hostage";

export type BanState = "active" | "expired" | "permanent";

export type BanKind = "ban" | "mute" | "gag" | "silence";

export interface SteamIdentity {
  /** 64-bit community id, used for profile links. */
  steamId64: string;
  /** Legacy STEAM_0:X:YYYY form the server console prints. */
  steamId: string;
  nickname: string;
  /** Deterministic seed used by the generated avatar, never a remote URL. */
  avatarSeed: string;
  /**
   * Foto real da Steam, quando o perfil é público. O SourceBans guarda o
   * SteamID de quem foi punido, então aqui — ao contrário do ranking — não
   * há adivinhação por nickname. Ausente vira emblema gerado.
   */
  avatarUrl?: string;
  country: string;
}

export interface PlayerStats {
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  score: number;
  matches: number;
  wins: number;
  losses: number;
  roundsPlayed: number;
  mvps: number;
  /** Minutes connected, all servers. */
  timePlayed: number;
  bestWeapon: string;
  longestWinStreak: number;
}

export interface MapAffinity {
  map: string;
  matches: number;
  winRate: number;
}

export interface Player extends SteamIdentity {
  rank: number;
  /** Community points; the ranking is sorted by this. */
  rating: number;
  firstSeen: string;
  lastSeen: string;
  online: boolean;
  currentServerId: string | null;
  stats: PlayerStats;
  favoriteMaps: MapAffinity[];
  recentForm: MatchSummary[];
}

/**
 * Um jogador como o HLstatsX realmente o descreve — a página de Ranking,
 * Jogadores e o perfil individual usam este tipo, não `Player` (que segue
 * alimentando as telas que ainda são mock: Visão geral, Estatísticas, busca
 * global, partidas).
 *
 * `id` é o ID NUMÉRICO INTERNO do HLstatsX — não é SteamID nem SteamID64.
 * Esta instalação do HLstatsX não expõe SteamID de forma confiável (a
 * página de perfil individual trava antes de mostrar isso pra qualquer
 * jogador real — só o bot SourceTV renderiza inteiro). Enquanto isso não
 * mudar, `id` é o único identificador estável que existe.
 */
export interface RankedPlayer {
  id: string;
  rank: number;
  nickname: string;
  country: { code: string | null; name: string | null } | null;
  /** "Skill" / rating interno do HLstatsX. */
  skill: number;
  kills: number;
  deaths: number;
  kd: number | null;
  headshots: number;
  hsRate: number | null;
  /** Percentual 0–100. */
  accuracy: number | null;
  /** Minutos conectados, total histórico rastreado pelo HLstatsX. */
  connectionTimeMinutes: number | null;
  /**
   * Foto real via Steam Web API, cruzada pelo backend a partir do nickname
   * mais recente visto ao vivo (o HLstatsX nunca expõe SteamID). Ausente =
   * `PlayerAvatar` cai pro emblema gerado.
   */
  avatarUrl?: string;
  /**
   * Variação desde a última linha de base do ranking (por padrão de hora em
   * hora — ver `RankingBaseline` no backend). Positivo em `rankDelta` = subiu
   * posições. `null` = o jogador ainda não estava no retrato anterior, então
   * não há variação real pra mostrar.
   */
  rankDelta?: number | null;
  skillDelta?: number | null;
}

export interface LivePlayer {
  steamId64: string;
  steamId: string;
  nickname: string;
  avatarSeed: string;
  /** Foto real via Steam Web API, resolvida pelo backend. Ausente = `PlayerAvatar` cai pro emblema gerado. */
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
  /** Seconds since this player connected. */
  connectedFor: number;
  /** Normalised radar position (0..1) when the server reports positions. */
  pos?: { x: number; y: number };
}

export interface RoundResult {
  round: number;
  winner: Exclude<Team, "SPEC">;
  reason: RoundEndReason;
}

export interface LiveMatch {
  serverId: string;
  /** Nome real do servidor (hostname reportado por ele), pra deixar claro qual partida é essa. */
  hostname: string;
  map: string;
  phase: MatchPhase;
  round: number;
  maxRounds: number;
  ctScore: number;
  tScore: number;
  /** Seconds remaining on the round clock. */
  clock: number;
  bombPlanted: boolean;
  rounds: RoundResult[];
  players: LivePlayer[];
  startedAt: string;
}

export interface GameServer {
  id: string;
  name: string;
  shortName: string;
  host: string;
  port: number;
  state: ServerState;
  mode: GameMode;
  map: string;
  players: number;
  maxPlayers: number;
  bots: number;
  ping: number;
  region: string;
  regionLabel: string;
  tickrate: number;
  secure: boolean;
  password: boolean;
  tags: string[];
  /** Rolling 24-slot player-count history used by the sparkline. */
  load24h: number[];
}

/**
 * Um servidor como o HLstatsX realmente o descreve — bem mais enxuto que
 * `GameServer` (que segue alimentando o placar ao vivo simulado). Sem ping,
 * tickrate, região, tags ou histórico: a fonte não fornece nada disso.
 */
export interface RealServer {
  id: string;
  name: string;
  host: string;
  port: number;
  status: "online";
  map: string;
  players: number;
  maxPlayers: number;
  /** Segundos no mapa atual — não é uptime do processo do servidor. */
  mapPlaytimeSeconds: number | null;
}

export interface MatchSummary {
  id: string;
  map: string;
  playedAt: string;
  durationSec: number;
  ctScore: number;
  tScore: number;
  winner: Exclude<Team, "SPEC">;
  /** The viewing player's side, when this summary hangs off a profile. */
  side?: Exclude<Team, "SPEC">;
  kills?: number;
  deaths?: number;
  assists?: number;
}

export interface MatchDetail extends MatchSummary {
  serverId: string;
  serverName: string;
  playersCount: number;
  demoId: string | null;
  mvp: SteamIdentity;
  rounds: RoundResult[];
  scoreboard: LivePlayer[];
}

/**
 * Uma demo real, como o backend a enxerga a partir do filesystem SFTP: só o
 * que um `list`/`stat` de arquivo consegue provar. Placar, duração, MVP e
 * vencedor não existem aqui — isso exigiria parsing do `.dem` ou vínculo com
 * uma partida registrada, nenhum dos dois implementado ainda.
 */
export interface Demo {
  id: string;
  filename: string;
  map: string;
  /** "2026-08-01" */
  date: string;
  /** "16:46" */
  time: string;
  /** ISO local, sem timezone — o nome do arquivo não informa fuso. */
  recordedAt: string;
  sizeBytes: number;
  /** "104.234.65.244:27800" — de qual servidor esta demo veio. */
  server: string;
}

export interface Ban {
  id: string;
  target: SteamIdentity;
  kind: BanKind;
  reason: string;
  admin: string;
  createdAt: string;
  /** null means permanent. */
  expiresAt: string | null;
  state: BanState;
  serverName: string;
  serverId: string;
  /** Partially masked, as a public page should. */
  ipMasked: string;
  evidence: string | null;
}

/**
 * O feed de atividade é só um log de presença: quem entrou, quem saiu, e
 * quem o plugin de requisitos barrou na porta (com o motivo). Abates e
 * rodadas vivem no placar e no histórico de partidas, não aqui.
 */
export type ActivityKind = "join" | "leave" | "blocked";

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  at: string;
  serverId: string;
  actor: string;
  actorTeam?: Team;
  /**
   * Contexto do evento: o motivo, quando "blocked"; quanto tempo a pessoa
   * ficou, quando "leave". Vazio em "join".
   */
  detail?: string;
}

export interface TrendPoint {
  label: string;
  value: number;
}

export interface NetworkStats {
  playersTotal: number;
  playersOnline: number;
  matches: number;
  rounds: number;
  kills: number;
  headshots: number;
  bombsPlanted: number;
  uptimeHours: number;
  demosStored: number;
  bytesStored: number;
  topMap: { map: string; matches: number };
  mostActive: { nickname: string; hours: number };
  bestKd: { nickname: string; kd: number };
  longestStreak: { nickname: string; wins: number };
  playersByHour: TrendPoint[];
  matchesByDay: TrendPoint[];
  mapShare: TrendPoint[];
  weaponShare: TrendPoint[];
}

/**
 * Retrato agregado do servidor, vindo de `GET /api/stats` (HLstatsX:
 * mode=weapons/actions/maps). São somas de TODO o histórico.
 *
 * `null` significa "a fonte não publica isso", nunca zero — o painel omite
 * o bloco em vez de afirmar que nunca aconteceu.
 *
 * Não existe recorte por jogador aqui de propósito: o `mode=playerinfo`
 * desta instalação do HLstatsX trava, então "quem matou mais com a AK" não
 * é obtenível — ver server/README.md.
 */
export interface ServerStats {
  totalKills: number;
  totalHeadshots: number;
  headshotRate: number | null;
  weapons: Array<{
    code: string;
    name: string;
    kills: number;
    headshots: number;
    headshotRatio: number | null;
    shareOfKills: number;
  }>;
  maps: Array<{
    map: string;
    kills: number;
    headshots: number;
    headshotRatio: number | null;
    shareOfKills: number;
  }>;
  bomb: {
    planted: number | null;
    defused: number | null;
    pickedUp: number | null;
    dropped: number | null;
  };
  multiKills: {
    double: number | null;
    triple: number | null;
    quadruple: number | null;
    rampage: number | null;
    megaKill: number | null;
  };
  highlights: {
    mvp: number | null;
    domination: number | null;
    revenge: number | null;
  };
  roundOutcomes: {
    tWipedCts: number | null;
    tBombed: number | null;
    ctWipedTs: number | null;
    ctDefused: number | null;
  };
  actions: Array<{ code: string; name: string; count: number }>;
}

/**
 * Pódios por arma e por ação, de `GET /api/stats/leaderboards`.
 *
 * ATENÇÃO ao `since`: estes números NÃO são o histórico do servidor (esse é
 * o `ServerStats`), e sim o que o plugin contou desde que subiu. A tela
 * precisa deixar isso explícito, senão o leitor compara os dois blocos e
 * conclui que um está errado.
 */
export interface LeaderEntry {
  steamId64: string;
  nickname: string;
  value: number;
  /** Foto real da Steam. Ausente = conta privada ou não resolvida. */
  avatarUrl?: string;
}

export interface WeaponLeaderboard {
  /** Mesmo código do HLstatsX ("ak47"), pra reusar o rótulo curto. */
  weapon: string;
  total: number;
  top: LeaderEntry[];
}

export interface Leaderboards {
  /** ISO de quando a contagem começou. `null` = nada exportado ainda. */
  since: string | null;
  playersCounted: number;
  weapons: WeaponLeaderboard[];
  topKillers: LeaderEntry[];
  topHeadshots: LeaderEntry[];
  topPlanters: LeaderEntry[];
  topDefusers: LeaderEntry[];
}

export type RankingPeriod = "today" | "week" | "month" | "all";

export interface RankingFilters {
  period: RankingPeriod;
  map: string;
  mode: GameMode | "all";
  season: string;
  query: string;
}
