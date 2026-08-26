import { Agent } from "undici";
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

// RequestInit (o mesmo tipo do fetch global, via undici-types empacotado com
// @types/node) em vez de um objeto próprio: declarar "dispatcher" à mão aqui
// colide com o tipo de Agent do pacote `undici` — mesma coisa em tempo de
// execução, classes formalmente diferentes pro TypeScript.
type FetchLike = (url: string, init?: RequestInit) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

/**
 * mixlendas-rank.clanservers.com.br passou a apresentar um certificado
 * autoassinado (confirmado 2026-08-26, depois que o Cloudflare parou de
 * intermediar essa conexão pra liberar o IP do Render) — o fetch padrão do
 * Node rejeita isso como proteção contra man-in-the-middle. Aceito só aqui,
 * de propósito: é leitura de uma página pública de estatísticas, sem
 * credencial nem dado sensível trafegando — nenhuma outra chamada deste
 * backend (Steam Web API, SFTP) usa este agente.
 */
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

/**
 * O Node/undici não manda um User-Agent de navegador por padrão — o que
 * facilmente entra numa heurística de bot do Cloudflare (confirmado: o
 * HLstatsX está atrás dele, e um 403 direto começou a aparecer só quando o
 * backend passou a rodar num datacenter em vez da máquina do dono do
 * servidor). Identificar como um navegador real é legítimo aqui: é a
 * própria comunidade lendo a página pública de estatísticas do seu próprio
 * servidor, não um scraper de terceiro tentando driblar controle de acesso.
 */
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
};

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
      response = await this.fetchImpl(url, {
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
        headers: BROWSER_HEADERS,
        // As declarações de tipo do pacote `undici` e as empacotadas com
        // @types/node (undici-types) descrevem Dispatcher de um jeito
        // formalmente incompatível entre si, mesmo sendo o mesmo código em
        // tempo de execução — sem o `as`, o TypeScript trava numa
        // incompatibilidade nas sobrecargas de Dispatcher.compose().
        dispatcher: insecureAgent as unknown as NonNullable<RequestInit["dispatcher"]>,
      });
    } catch (cause) {
      throw new HLStatsUnavailableError(cause);
    }
    if (!response.ok) {
      throw new HLStatsUnavailableError(new Error(`HTTP ${response.status} em ${url}`));
    }
    return response.text();
  }
}
