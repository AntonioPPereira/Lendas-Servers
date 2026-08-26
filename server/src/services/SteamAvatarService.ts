/**
 * Resolve avatar real via Steam Web API — só aqui, nunca no plugin. O
 * `lendas_live` manda apenas o SteamID64 capturado; a API key mora só neste
 * backend (`STEAM_API_KEY`, nunca no frontend nem no SourceMod).
 *
 * Nunca lança: falha de rede, key ausente, ou conta sem avatar público
 * simplesmente não entra no mapa devolvido — o frontend já sabe cair pro
 * emblema gerado nesse caso (`PlayerAvatar`), então "não resolveu" nunca é
 * tratado como erro aqui.
 */

type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface SteamSummary {
  steamid: string;
  avatarfull?: string;
}

interface CacheEntry {
  url: string;
  expiresAt: number;
}

/** GetPlayerSummaries aceita até 100 SteamIDs por chamada. */
const MAX_IDS_PER_REQUEST = 100;

export class SteamAvatarService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly apiKey: string,
    private readonly cacheTtlMs: number,
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
  ) {}

  /**
   * Leitura síncrona só do cache, sem disparar rede — usado por quem não
   * pode esperar uma chamada à Steam Web API (ex.: servir uma página do
   * ranking). Quem precisa garantir a resolução (o pipeline de live) chama
   * `resolve()`; isso aqui só reaproveita o que já foi resolvido antes.
   */
  peek(steamId64: string): string | undefined {
    const cached = this.cache.get(steamId64);
    return cached && cached.expiresAt > Date.now() ? cached.url : undefined;
  }

  /** Devolve só os SteamID64 que resolveram (do cache ou de uma consulta nova). */
  async resolve(steamId64s: readonly string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (!this.apiKey || steamId64s.length === 0) return result;

    const now = Date.now();
    const toFetch: string[] = [];
    for (const id of new Set(steamId64s)) {
      const cached = this.cache.get(id);
      if (cached && cached.expiresAt > now) {
        result.set(id, cached.url);
      } else {
        toFetch.push(id);
      }
    }

    for (let i = 0; i < toFetch.length; i += MAX_IDS_PER_REQUEST) {
      await this.fetchBatch(toFetch.slice(i, i + MAX_IDS_PER_REQUEST), result);
    }

    return result;
  }

  private async fetchBatch(ids: string[], result: Map<string, string>): Promise<void> {
    const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${this.apiKey}&steamids=${ids.join(",")}`;
    try {
      const response = await this.fetchImpl(url, { signal: AbortSignal.timeout(8_000) });
      if (!response.ok) {
        console.error(`[steam-avatar] HTTP ${response.status} ao resolver avatares`);
        return;
      }
      const body = (await response.json()) as { response?: { players?: SteamSummary[] } };
      const players = body.response?.players ?? [];
      const now = Date.now();
      for (const player of players) {
        if (!player.avatarfull) continue;
        this.cache.set(player.steamid, { url: player.avatarfull, expiresAt: now + this.cacheTtlMs });
        result.set(player.steamid, player.avatarfull);
      }
    } catch (cause) {
      console.error("[steam-avatar] falha ao resolver avatares:", cause);
    }
  }
}
