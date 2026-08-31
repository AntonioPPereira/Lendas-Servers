import type {
  ActivityEvent,
  Ban,
  BanState,
  Demo,
  NetworkStats,
  RankedPlayer,
  RealServer,
  ServerStats,
  Leaderboards,
} from "@/data/types";
import { config, isMockMode } from "@/lib/config";

/**
 * Os mocks entram por `import()` dinâmico, e não no topo do arquivo.
 *
 * Este client é importado por praticamente toda página, então um import
 * estático colava o conjunto inteiro de dados falsos — partidas, bans e a
 * lista de nicknames inventados — no pacote principal de produção, mesmo com
 * o modo mock desligado, onde nada disso chega a ser lido.
 *
 * Como só é chamado atrás de `isMockMode`, em produção o módulo nunca é
 * baixado; em desenvolvimento é buscado uma vez e reaproveitado.
 */
function mocks() {
  return Promise.all([import("@/data/bans"), import("@/data/matches"), import("@/data/stats")]).then(
    ([bans, matches, stats]) => ({ ...bans, ...matches, ...stats }),
  );
}

export interface PlayerWeapons {
  /** Desde quando o plugin conta. `null` = nenhum servidor exportou ainda. */
  since: string | null;
  /** `false` quando o plugin não respondeu — diferente de "matou zero". */
  available: boolean;
  total: number;
  weapons: Array<{ weapon: string; kills: number }>;
}

/**
 * Uma linha do arquivo: pode ser uma partida com placar ou só uma
 * gravação. Os campos de placar são `null` — nunca 0 — quando a linha é só
 * a demo: zero leria como empate e essas partidas nunca foram registradas.
 */
export interface ArchiveEntry {
  id: string;
  kind: "match" | "demo";
  map: string;
  startedAt: string;
  endedAt: string | null;
  ctScore: number | null;
  tScore: number | null;
  roundCount: number | null;
  playerCount: number | null;
  demo: { id: string; filename: string; size: number } | null;
}

export interface ArchivePage extends Page<ArchiveEntry> {
  /** Quantas linhas do recorte têm placar — o painel usa pra explicar a mistura. */
  withScore: number;
}

export interface MatchRound {
  n: number;
  winner: "CT" | "T";
  reason: "bomb" | "defuse" | "elimination" | "time" | "hostage";
  ct: number;
  t: number;
}

export interface MatchPlayer {
  steamId64: string;
  name: string;
  team: "CT" | "T" | "SPEC";
  kills: number;
  deaths: number;
}

export interface MatchDetailReal extends ArchiveEntry {
  rounds: MatchRound[];
  players: MatchPlayer[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function delay<T>(value: T, ms: number = config.mockLatency): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(config.apiBaseUrl + path, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new ApiError("Falha ao carregar " + path, response.status);
  }
  return (await response.json()) as T;
}

function paginate<T>(items: T[], page: number, pageSize: number): Page<T> {
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total: items.length, page, pageSize };
}

/**
 * Ranking e Jogadores não têm modo mock, nem filtro de período/temporada: o
 * HLstatsX é sempre acumulado (all-time), sem esse recorte — ver
 * server/README.md. Sem VITE_API_URL configurada, os métodos abaixo lançam
 * em vez de fingir uma lista.
 */
export interface RankingQuery {
  query?: string;
  page?: number;
  pageSize?: number;
}

/**
 * `/api/ranking` devolve, além da página, desde quando os `rankDelta`/
 * `skillDelta` de cada jogador estão sendo contados — `null` enquanto o
 * backend ainda não congelou nenhuma linha de base.
 */
export interface RankingPage extends Page<RankedPlayer> {
  comparedTo: string | null;
}

/** `/api/players` soma agregados sobre a lista inteira, além da página pedida. */
export interface PlayersPage extends Page<RankedPlayer> {
  totalKills: number;
  totalHeadshots: number;
}

function requireApi(feature: string): void {
  if (!config.apiBaseUrl) {
    throw new ApiError(`VITE_API_URL não configurada — ${feature} exige o backend real (server/).`, 0);
  }
}

export interface DemoQuery {
  query?: string;
  map?: string;
  /** "2026-08" — sem isso, o backend cai no mês corrente (nunca varre o histórico inteiro). */
  period?: string;
  page?: number;
  pageSize?: number;
}

/** Além dos itens da página, o backend confirma qual período foi de fato aplicado. */
export interface DemosPage extends Page<Demo> {
  period: string;
}

export interface DemoPeriods {
  /** "2026-08", "2026-07", ... — mais recente primeiro. */
  items: string[];
  /** Período corrente segundo o relógio do backend — mesmo default usado quando `period` não é enviado. */
  current: string;
}

/**
 * URL de download direto — usada como `href` de um link normal, nunca via
 * `fetch` + blob. O navegador segue o Content-Disposition que o backend
 * manda; nenhum caminho de filesystem passa perto do frontend.
 */
export function demoDownloadUrl(id: string): string {
  return config.apiBaseUrl + "/demos/" + encodeURIComponent(id) + "/download";
}

/** Formato exato que o backend manda pela rede — `size`, não `sizeBytes`. */
interface DemoDto {
  id: string;
  filename: string;
  map: string;
  date: string;
  time: string;
  recordedAt: string;
  size: number;
  server: string;
}

function toDemo(dto: DemoDto): Demo {
  const { size, ...rest } = dto;
  return { ...rest, sizeBytes: size };
}

export interface BanQuery {
  query?: string;
  state?: BanState | "all";
  page?: number;
  pageSize?: number;
}

export interface BansSummary {
  /**
   * Quando o servidor de jogo exportou os bans (o plugin roda a cada 5 min).
   * `null` quando ainda não houve nenhum export — nunca a hora da leitura,
   * que daria a impressão falsa de dado fresco.
   */
  generatedAt: string | null;
  all: number;
  active: number;
  expired: number;
  permanent: number;
}

export const api = {
  /** Sem mock: status/mapa/jogadores só existem de verdade via HLstatsX (server/). */
  async servers(): Promise<RealServer[]> {
    requireApi("servidores");
    return request<RealServer[]>("/servers");
  },

  /**
   * Veredito real do plugin `lendas_steamfilter`, lido pelo backend direto
   * dos logs do SourceMod via SFTP (aprovado → "join", bloqueado →
   * "blocked" com o motivo real). Sem modo mock: se o backend não
   * responder, a página mostra o estado de indisponível, nunca inventa
   * atividade. Inclui "leave" desde o `lendas_steamfilter` 1.1.0, que
   * passou a registrar a desconexão de quem foi aprovado.
   *
   * `actor` filtra por nick exato — é o que o perfil do jogador usa pra
   * listar só as passagens dele pelo servidor. O corte acontece no
   * backend, antes do limite: as passagens de uma pessoa específica quase
   * nunca estão entre os últimos eventos de um servidor movimentado.
   */
  async activity(params: { actor?: string; limit?: number } = {}): Promise<ActivityEvent[]> {
    requireApi("atividade");
    const search = new URLSearchParams();
    if (params.actor) search.set("actor", params.actor);
    if (params.limit) search.set("limit", String(params.limit));
    const qs = search.toString();
    return request<ActivityEvent[]>("/activity" + (qs ? "?" + qs : ""));
  },

  /**
   * Abates por arma DESTE jogador. Vem do plugin `lendas_playerstats`, não
   * do HLstatsX — que nesta instalação não entrega recorte por arma por
   * jogador. Por isso a resposta traz `since`: a contagem começa quando o
   * plugin sobe, e sem essa data o número não bate com o total de abates do
   * resto do perfil.
   */
  async playerWeapons(id: string): Promise<PlayerWeapons> {
    requireApi("armas do jogador");
    return request<PlayerWeapons>("/players/" + encodeURIComponent(id) + "/weapons");
  },

  async ranking(params: RankingQuery = {}): Promise<RankingPage> {
    requireApi("ranking");
    const { query = "", page = 1, pageSize = 25 } = params;
    const search = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (query) search.set("q", query);
    return request<RankingPage>("/ranking?" + search.toString());
  },

  /** Mesma fonte do ranking, com agregados pros cards de resumo da tela de Jogadores. */
  async players(params: RankingQuery = {}): Promise<PlayersPage> {
    requireApi("jogadores");
    const { query = "", page = 1, pageSize = 24 } = params;
    const search = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (query) search.set("q", query);
    return request<PlayersPage>("/players?" + search.toString());
  },

  async player(id: string): Promise<RankedPlayer> {
    requireApi("perfil de jogador");
    return request<RankedPlayer>("/players/" + encodeURIComponent(id));
  },

  /**
   * Demos não têm modo mock: o catálogo só existe de verdade no filesystem
   * do servidor (via o backend + SFTP). Sem VITE_API_URL configurada, isto
   * lança em vez de fingir uma lista — ver DATA-SOURCES.md.
   */
  async demos(params: DemoQuery = {}): Promise<DemosPage> {
    requireApi("demos");
    const { query = "", map = "all", period, page = 1, pageSize = 12 } = params;
    const search = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (query) search.set("q", query);
    if (map !== "all") search.set("map", map);
    if (period) search.set("period", period);
    const raw = await request<DemosPage & { items: DemoDto[] }>("/demos?" + search.toString());
    return { ...raw, items: raw.items.map(toDemo) };
  },

  /** Quais meses têm demo pelo menos numa das raízes do SFTP — pro filtro de período. */
  async demoPeriods(): Promise<DemoPeriods> {
    requireApi("demos");
    return request<DemoPeriods>("/demos/periods");
  },

  async demo(id: string): Promise<Demo> {
    requireApi("demos");
    const raw = await request<DemoDto>("/demos/" + encodeURIComponent(id));
    return toDemo(raw);
  },

  /**
   * Arquivo unificado: partidas e gravações na mesma lista. Sem modo mock —
   * uma partida inventada aqui seria indistinguível de uma real, e é
   * exatamente o tipo de coisa que ninguém consegue desmentir depois.
   */
  async archive(
    params: { page?: number; pageSize?: number; map?: string; period?: string } = {},
  ): Promise<ArchivePage> {
    requireApi("partidas");
    const { page = 1, pageSize = 12, map = "all" } = params;
    const search = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (map !== "all") search.set("map", map);
    if (params.period) search.set("period", params.period);
    return request<ArchivePage>("/matches?" + search.toString());
  },

  async match(id: string): Promise<MatchDetailReal> {
    requireApi("partida");
    return request<MatchDetailReal>("/matches/" + encodeURIComponent(id));
  },

  /** Mapas que de fato existem no acervo — nunca uma lista fixa. */
  async archiveMaps(): Promise<string[]> {
    requireApi("partidas");
    const body = await request<{ items: string[] }>("/matches/maps");
    return body.items;
  },

  async bans(params: BanQuery = {}): Promise<Page<Ban>> {
    const { query = "", state = "all", page = 1, pageSize = 12 } = params;
    if (!isMockMode) {
      const search = new URLSearchParams({ q: query, state, page: String(page) });
      return request<Page<Ban>>("/bans?" + search.toString());
    }

    const { BANS } = await mocks();
    const needle = query.trim().toLowerCase();
    const rows = BANS.filter((ban) => {
      if (state !== "all" && ban.state !== state) return false;
      if (!needle) return true;
      return (
        ban.target.nickname.toLowerCase().includes(needle) ||
        ban.target.steamId.toLowerCase().includes(needle) ||
        ban.target.steamId64.includes(needle) ||
        ban.reason.toLowerCase().includes(needle)
      );
    });

    return delay(paginate(rows, page, pageSize));
  },

  /**
   * Contadores por estado, calculados no backend em cima de TODOS os
   * registros — a lista paginada não serviria pra isso (só traz a página
   * atual), e contar em cima do mock daria número que não existe.
   */
  async bansSummary(): Promise<BansSummary> {
    if (!isMockMode) return request<BansSummary>("/bans/summary");
    const { BANS } = await mocks();
    return delay({
      generatedAt: null,
      all: BANS.length,
      active: BANS.filter((b) => b.state === "active").length,
      expired: BANS.filter((b) => b.state === "expired").length,
      permanent: BANS.filter((b) => b.state === "permanent").length,
    });
  },

  /**
   * Agregados reais do servidor. Sem mock: estes números não existem sem o
   * HLstatsX, e um valor inventado aqui seria indistinguível de um real.
   */
  async serverStats(): Promise<ServerStats> {
    requireApi("estatísticas");
    return request<ServerStats>("/stats");
  },

  /**
   * Pódios por arma/ação. Chamada separada de `serverStats` porque as duas
   * cobrem períodos diferentes — juntar convidaria a somar o que não soma.
   */
  async leaderboards(): Promise<Leaderboards> {
    requireApi("estatísticas");
    return request<Leaderboards>("/stats/leaderboards");
  },

  async stats(): Promise<NetworkStats> {
    if (!isMockMode) return request<NetworkStats>("/stats");
    const { NETWORK_STATS } = await mocks();
    return delay(NETWORK_STATS, 320);
  },
};
