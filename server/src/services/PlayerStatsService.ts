import path from "node:path";
import SftpClient from "ssh2-sftp-client";
import { TtlCache } from "../lib/cache.js";
import { classifySftpError } from "../errors.js";
import { parseServerDirName } from "../lib/demoId.js";
import type { SftpConnectionConfig } from "./SftpDemoService.js";

/**
 * Estatísticas POR JOGADOR, contadas pelo plugin `lendas_playerstats` dentro
 * do servidor de jogo e lidas aqui pelo SFTP de sempre.
 *
 * Existe porque o HLstatsX desta rede não entrega esse recorte: o
 * `mode=playerinfo` trava e a página de prêmios está vazia (o cron de awards
 * não roda). Sem isso não haveria "quem mata mais com cada arma".
 *
 * `since` é essencial e vem junto de propósito: estes números NÃO são o
 * histórico do servidor, são o que foi contado desde que o plugin subiu. A
 * tela precisa dizer isso, senão o leitor compara com os totais do HLstatsX
 * e conclui que algo está errado.
 */

export interface PlayerStatsClientLike {
  connect(config: { host: string; port: number; username: string; password: string; readyTimeout: number }): Promise<unknown>;
  list(remotePath: string): Promise<Array<{ type: string; name: string }>>;
  get(remotePath: string): Promise<Buffer>;
  end(): Promise<unknown>;
}

type ClientFactory = () => PlayerStatsClientLike;

const READY_TIMEOUT_MS = 10_000;
const EXPORT_SUBPATH = ["cstrike", "addons", "sourcemod", "data", "lendas_playerstats.json"];
const STEAM_ID64_PATTERN = /^\d{17}$/;

function defaultClient(): PlayerStatsClientLike {
  const client = new SftpClient();
  return {
    connect: (cfg) => client.connect(cfg),
    list: (remotePath) => client.list(remotePath) as unknown as Promise<Array<{ type: string; name: string }>>,
    async get(remotePath) {
      const result = await client.get(remotePath);
      return Buffer.isBuffer(result) ? result : Buffer.from(String(result), "utf-8");
    },
    end: () => client.end(),
  };
}

export interface PlayerStatsRow {
  id: string;
  name: string;
  kills: number;
  hs: number;
  plants: number;
  defuses: number;
  /** Código da arma (mesmo do HLstatsX) -> abates. */
  weapons: Record<string, number>;
}

export interface PlayerStatsSnapshot {
  /** Desde quando a contagem existe. `null` = nenhum servidor exportou ainda. */
  since: string | null;
  rows: PlayerStatsRow[];
}

const VAZIO: PlayerStatsSnapshot = { since: null, rows: [] };

export class PlayerStatsService {
  private readonly cache: TtlCache<PlayerStatsSnapshot>;

  constructor(
    private readonly conn: SftpConnectionConfig,
    cacheTtlMs: number,
    private readonly createClient: ClientFactory = defaultClient,
  ) {
    this.cache = new TtlCache<PlayerStatsSnapshot>(cacheTtlMs);
  }

  async getSnapshot(): Promise<PlayerStatsSnapshot> {
    return this.cache.getStaleWhileRevalidate(
      () => this.load(),
      (cause) => console.error("[player-stats] atualização de fundo falhou:", cause),
    );
  }

  private async load(): Promise<PlayerStatsSnapshot> {
    const sftp = this.createClient();
    try {
      await sftp.connect({
        host: this.conn.host,
        port: this.conn.port,
        username: this.conn.username,
        password: this.conn.password,
        readyTimeout: READY_TIMEOUT_MS,
      });

      /**
       * Cada servidor conta o seu, então os dois são somados: quem joga nos
       * dois aparece uma vez só, com o total. Sem isso o mesmo jogador
       * apareceria duas vezes no pódio, cada uma com metade dos abates.
       */
      const porJogador = new Map<string, PlayerStatsRow>();
      let desde: number | null = null;

      for (const root of await this.discoverRoots(sftp)) {
        const parsed = await this.readOrNull(sftp, root);
        if (!parsed) continue;

        // A contagem "existe desde" o começo mais antigo entre os servidores.
        if (parsed.since > 0 && (desde === null || parsed.since < desde)) desde = parsed.since;

        for (const row of parsed.rows) {
          const atual = porJogador.get(row.id);
          if (!atual) {
            porJogador.set(row.id, { ...row, weapons: { ...row.weapons } });
            continue;
          }
          atual.kills += row.kills;
          atual.hs += row.hs;
          atual.plants += row.plants;
          atual.defuses += row.defuses;
          for (const [arma, n] of Object.entries(row.weapons)) {
            atual.weapons[arma] = (atual.weapons[arma] ?? 0) + n;
          }
        }
      }

      return {
        since: desde === null ? null : new Date(desde * 1000).toISOString(),
        rows: [...porJogador.values()],
      };
    } catch (err) {
      throw classifySftpError(err);
    } finally {
      await sftp.end().catch(() => undefined);
    }
  }

  private async discoverRoots(sftp: PlayerStatsClientLike): Promise<string[]> {
    const entries = await sftp.list(this.conn.base);
    const roots: string[] = [];
    for (const entry of entries) {
      if (entry.type !== "d") continue;
      if (!parseServerDirName(entry.name)) continue;
      roots.push(path.posix.join(this.conn.base, entry.name, ...EXPORT_SUBPATH));
    }
    return roots;
  }

  private async readOrNull(
    sftp: PlayerStatsClientLike,
    remotePath: string,
  ): Promise<{ since: number; rows: PlayerStatsRow[] } | null> {
    let raw: Buffer;
    try {
      raw = await sftp.get(remotePath);
    } catch {
      return null; // servidor sem o plugin ainda — não é erro
    }

    try {
      const parsed = JSON.parse(raw.toString("utf-8")) as {
        since?: number;
        players?: unknown[];
      };
      if (!Array.isArray(parsed.players)) return null;

      const rows: PlayerStatsRow[] = [];
      for (const item of parsed.players) {
        const row = this.sanitize(item);
        if (row) rows.push(row);
      }
      return { since: typeof parsed.since === "number" ? parsed.since : 0, rows };
    } catch {
      return null;
    }
  }

  /** Linha malformada é descartada inteira — meio jogador é pior que nenhum. */
  private sanitize(item: unknown): PlayerStatsRow | null {
    if (typeof item !== "object" || item === null) return null;
    const o = item as Record<string, unknown>;
    if (typeof o.id !== "string" || !STEAM_ID64_PATTERN.test(o.id)) return null;

    const inteiro = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

    const weapons: Record<string, number> = {};
    if (typeof o.weapons === "object" && o.weapons !== null) {
      for (const [arma, n] of Object.entries(o.weapons as Record<string, unknown>)) {
        // O código vira chave de leaderboard: só aceita o formato conhecido.
        if (/^[a-z0-9_]{1,32}$/.test(arma) && inteiro(n) > 0) weapons[arma] = inteiro(n);
      }
    }

    return {
      id: o.id,
      name: typeof o.name === "string" && o.name.trim() ? o.name : "(sem nick)",
      kills: inteiro(o.kills),
      hs: inteiro(o.hs),
      plants: inteiro(o.plants),
      defuses: inteiro(o.defuses),
      weapons,
    };
  }
}

export { VAZIO as EMPTY_PLAYER_STATS };
