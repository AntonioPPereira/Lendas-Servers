import { TtlCache } from "../lib/cache.js";
import { HLStatsParseError, HLStatsUnavailableError } from "../errors.js";
import {
  parseRankingHtml,
  parseRankingPageCount,
  parseServersHtml,
  type HLStatsRankingRow,
  type HLStatsServerRow,
} from "../lib/hlstatsParse.js";

export type { HLStatsRankingRow, HLStatsServerRow };

export interface HLStatsConfig {
  baseUrl: string;
  game: string;
  timeoutMs: number;
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

/**
 * Único ponto de contato com o HLstatsX:CE.
 *
 * O HLstatsX:CE 1.7.0 desta instalação não tem API estruturada — confirmado
 * na auditoria (Fase 1). Este serviço faz o parsing do HTML (isolado em
 * `lib/hlstatsParse.ts`, nunca espalhado nas rotas ou no frontend) e
 * mantém dois caches independentes, porque as duas fontes mudam em
 * cadências bem diferentes: status de servidor quase em tempo real,
 * ranking bem mais devagar.
 *
 * `mode=playerinfo` (perfil individual) é conhecido por travar no meio do
 * carregamento pra qualquer jogador com avatar Steam real nesta instalação
 * — confirmado com múltiplos IDs, headers e timeouts (só o bot SourceTV
 * renderiza a página inteira). Por isso não existe `fetchPlayerInfo` aqui:
 * o perfil individual é resolvido a partir do cache de ranking mesmo
 * (`getPlayer`), que é a única fonte que renderiza de forma confiável.
 */
export class HLStatsService {
  private readonly serversCache: TtlCache<HLStatsServerRow[]>;
  private readonly rankingCache: TtlCache<HLStatsRankingRow[]>;

  constructor(
    private readonly cfg: HLStatsConfig,
    serversCacheTtlMs: number,
    rankingCacheTtlMs: number,
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    this.serversCache = new TtlCache<HLStatsServerRow[]>(serversCacheTtlMs);
    this.rankingCache = new TtlCache<HLStatsRankingRow[]>(rankingCacheTtlMs);
  }

  async getServers(): Promise<HLStatsServerRow[]> {
    try {
      return await this.serversCache.get(() => this.fetchServers());
    } catch (cause) {
      const stale = this.serversCache.peekStale();
      if (stale) return stale;
      throw cause;
    }
  }

  async getRanking(): Promise<HLStatsRankingRow[]> {
    try {
      return await this.rankingCache.get(() => this.fetchAllRankingPages());
    } catch (cause) {
      const stale = this.rankingCache.peekStale();
      if (stale) return stale;
      throw cause;
    }
  }

  /**
   * `null` = ID bem formado mas não encontrado no ranking atual (jogador
   * sem estatísticas registradas, ou nunca existiu). Reaproveita o cache de
   * `getRanking()` — não dispara uma requisição nova por jogador.
   */
  async getPlayer(id: string): Promise<HLStatsRankingRow | null> {
    const ranking = await this.getRanking();
    return ranking.find((row) => row.hlstatsPlayerId === id) ?? null;
  }

  private async fetchServers(): Promise<HLStatsServerRow[]> {
    const html = await this.fetchText(`${this.cfg.baseUrl}?game=${this.cfg.game}`);
    const rows = parseServersHtml(html);
    if (rows.length === 0) {
      throw new HLStatsParseError("nenhum servidor encontrado na tabela #accordion");
    }
    return rows;
  }

  private async fetchAllRankingPages(): Promise<HLStatsRankingRow[]> {
    const baseUrl = `${this.cfg.baseUrl}?mode=players&game=${this.cfg.game}`;
    const firstHtml = await this.fetchText(baseUrl);
    const totalPages = parseRankingPageCount(firstHtml);

    const all = parseRankingHtml(firstHtml);
    for (let page = 2; page <= totalPages; page += 1) {
      const html = await this.fetchText(`${baseUrl}&page=${page}`);
      all.push(...parseRankingHtml(html));
    }

    if (all.length === 0) {
      throw new HLStatsParseError("nenhum jogador encontrado na tabela de ranking");
    }
    return all;
  }

  private async fetchText(url: string): Promise<string> {
    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await this.fetchImpl(url, { signal: AbortSignal.timeout(this.cfg.timeoutMs) });
    } catch (cause) {
      throw new HLStatsUnavailableError(cause);
    }
    if (!response.ok) {
      throw new HLStatsUnavailableError(new Error(`HTTP ${response.status} em ${url}`));
    }
    return response.text();
  }
}
