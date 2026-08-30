import path from "node:path";
import SftpClient from "ssh2-sftp-client";
import { TtlCache } from "../lib/cache.js";
import { classifySftpError } from "../errors.js";
import { parseServerDirName } from "../lib/demoId.js";
import type { SourceBansRow } from "../lib/sourceBans.js";
import type { SftpConnectionConfig } from "./SftpDemoService.js";

/**
 * Lê os bans do SourceBans++ a partir do JSON que o plugin `lendas_bans`
 * exporta dentro do próprio servidor de jogo.
 *
 * Por que não falar direto com o MySQL do SourceBans: o usuário do banco só
 * aceita conexão vinda do próprio servidor de jogo, e o painel da hospedagem
 * (ClanServers) não expõe "Remote MySQL" pra liberar o IP do backend —
 * confirmado na prática em 2026-08-30, com "Access denied for user ...@<ip
 * de casa>" mesmo com a senha correta. Em vez de depender de um pedido ao
 * suporte, o plugin (que já roda no servidor e tem acesso local) exporta o
 * JSON, e aqui usamos a MESMA conexão SFTP já usada por demos e atividade.
 *
 * Efeito colateral bom: o banco nunca fica exposto à internet.
 */

export interface SourceBansClientLike {
  connect(config: { host: string; port: number; username: string; password: string; readyTimeout: number }): Promise<unknown>;
  list(remotePath: string): Promise<Array<{ type: string; name: string }>>;
  get(remotePath: string): Promise<Buffer>;
  end(): Promise<unknown>;
}

type ClientFactory = () => SourceBansClientLike;

const READY_TIMEOUT_MS = 10_000;
/** Caminho do JSON dentro do moddir de cada servidor. */
const EXPORT_SUBPATH = ["cstrike", "addons", "sourcemod", "data", "lendas_bans.json"];

function defaultClient(): SourceBansClientLike {
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

export interface SourceBansSnapshot {
  /** Quando o plugin gerou o arquivo (não quando lemos). */
  generatedAt: string | null;
  rows: SourceBansRow[];
}

const EMPTY: SourceBansSnapshot = { generatedAt: null, rows: [] };

export class SourceBansService {
  private readonly cache: TtlCache<SourceBansSnapshot>;

  constructor(
    private readonly conn: SftpConnectionConfig,
    cacheTtlMs: number,
    private readonly createClient: ClientFactory = defaultClient,
  ) {
    this.cache = new TtlCache<SourceBansSnapshot>(cacheTtlMs);
  }

  async getSnapshot(): Promise<SourceBansSnapshot> {
    return this.cache.get(() => this.load());
  }

  private async load(): Promise<SourceBansSnapshot> {
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
       * O plugin só está instalado no Servidor 01, mas o banco do
       * SourceBans é COMPARTILHADO entre os dois servidores — então esse
       * único arquivo já contém as punições dos dois. Ainda assim varremos
       * todas as pastas de servidor e ficamos com o export mais recente,
       * pra que instalar o plugin no Servidor 02 amanhã não exija mudar
       * nada aqui.
       */
      let melhor: SourceBansSnapshot = EMPTY;
      let melhorTs = -1;

      for (const root of await this.discoverServerRoots(sftp)) {
        const parsed = await this.readOrNull(sftp, root);
        if (!parsed) continue;
        if (parsed.ts > melhorTs) {
          melhorTs = parsed.ts;
          melhor = parsed.snapshot;
        }
      }

      return melhor;
    } catch (err) {
      throw classifySftpError(err);
    } finally {
      await sftp.end().catch(() => undefined);
    }
  }

  private async discoverServerRoots(sftp: SourceBansClientLike): Promise<string[]> {
    const entries = await sftp.list(this.conn.base);
    const roots: string[] = [];
    for (const entry of entries) {
      if (entry.type !== "d") continue;
      if (!parseServerDirName(entry.name)) continue;
      roots.push(path.posix.join(this.conn.base, entry.name, ...EXPORT_SUBPATH));
    }
    return roots;
  }

  /**
   * Um servidor sem o plugin instalado simplesmente não tem o arquivo — não
   * é erro. JSON corrompido também não derruba a rota: ignoramos aquele
   * servidor e seguimos com os outros.
   */
  private async readOrNull(
    sftp: SourceBansClientLike,
    remotePath: string,
  ): Promise<{ ts: number; snapshot: SourceBansSnapshot } | null> {
    let raw: Buffer;
    try {
      raw = await sftp.get(remotePath);
    } catch {
      return null;
    }

    try {
      const parsed = JSON.parse(raw.toString("utf-8")) as {
        generatedAt?: number;
        items?: SourceBansRow[];
      };
      if (!Array.isArray(parsed.items)) return null;
      const ts = typeof parsed.generatedAt === "number" ? parsed.generatedAt : 0;
      return {
        ts,
        snapshot: {
          generatedAt: ts > 0 ? new Date(ts * 1000).toISOString() : null,
          rows: parsed.items,
        },
      };
    } catch {
      return null;
    }
  }
}
