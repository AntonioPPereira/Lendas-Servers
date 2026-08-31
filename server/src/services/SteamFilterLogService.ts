import path from "node:path";
import SftpClient from "ssh2-sftp-client";
import { TtlCache } from "../lib/cache.js";
import { classifySftpError } from "../errors.js";
import { parseServerDirName } from "../lib/demoId.js";
import { isDailyLogFilename, parseSteamFilterLogLine, type SteamFilterLogEvent } from "../lib/steamFilterLog.js";
import type { SftpConnectionConfig } from "./SftpDemoService.js";

export interface ActivityLogEvent extends SteamFilterLogEvent {
  id: string;
}

/**
 * Só a fatia de `ssh2-sftp-client` usada aqui. `get` sem destino devolve o
 * conteúdo inteiro (os logs diários têm no máximo alguns milhares de
 * linhas — ver server/README.md), diferente do `SftpClientLike` de
 * `SftpDemoService`, que sempre transmite pra um `Writable` (arquivos de
 * demo são grandes demais pra bufferizar).
 */
export interface SteamFilterLogClientLike {
  connect(config: { host: string; port: number; username: string; password: string; readyTimeout: number }): Promise<unknown>;
  list(remotePath: string): Promise<Array<{ type: string; name: string }>>;
  get(remotePath: string): Promise<Buffer>;
  end(): Promise<unknown>;
}

type ClientFactory = () => SteamFilterLogClientLike;

const READY_TIMEOUT_MS = 10_000;
/** Onde o SourceMod grava os logs diários dentro do moddir de cada servidor. */
const LOG_SUBPATH = ["cstrike", "addons", "sourcemod", "logs"];
/** Hoje + ontem: cobre a virada de meia-noite sem precisar ler todo o histórico. */
const RECENT_DAY_FILES = 2;

function defaultClient(): SteamFilterLogClientLike {
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

/**
 * Lê o veredito real do `lendas_steamfilter` direto dos logs diários que o
 * SourceMod já escreve, sem intervenção nenhuma — usa a MESMA conexão SFTP
 * já configurada pra demos (`config.sftp`), então não existe estado "não
 * configurado": se o SFTP de demos funciona, isto funciona.
 *
 * Alternativa descartada: ligar a gravação MySQL que o plugin já sabe fazer
 * (`lsf_checks`, ver o `.sp`/schema.sql do plugin) — funcionaria, mas exige
 * mexer em produção (criar usuário de banco, editar `databases.cfg`,
 * reiniciar o server). Os logs já têm exatamente o mesmo veredito, sempre
 * ativos, sem nenhum desses passos — decisão tomada com o usuário em
 * 2026-08-25 depois de confirmar que os logs reais já continham as linhas
 * necessárias nos dois servidores.
 */
export class SteamFilterLogService {
  private readonly cache: TtlCache<ActivityLogEvent[]>;

  constructor(
    private readonly conn: SftpConnectionConfig,
    cacheTtlMs: number,
    private readonly limit: number,
    private readonly createClient: ClientFactory = defaultClient,
  ) {
    this.cache = new TtlCache<ActivityLogEvent[]>(cacheTtlMs);
  }

  /**
   * Eventos mais recentes primeiro, de todos os servidores descobertos.
   *
   * O corte por `limit` acontece AQUI, não no cache: guardar já cortado
   * servia pro feed geral (que só mostra as últimas dezenas), mas
   * inviabilizava filtrar por jogador — as passagens de alguém específico
   * quase nunca estão entre os 60 eventos mais recentes de um servidor
   * movimentado. O cache passa a guardar a janela inteira lida do disco
   * (dois dias de log) e cada chamada recorta o que precisa.
   */
  async getRecentEvents(options: { limit?: number | undefined; actor?: string | undefined } = {}): Promise<ActivityLogEvent[]> {
    let todos: ActivityLogEvent[];
    try {
      todos = await this.cache.get(() => this.fetchRecent());
    } catch (cause) {
      const stale = this.cache.peekStale();
      if (!stale) throw cause;
      todos = stale;
    }

    const alvo = options.actor?.trim().toLowerCase();
    // Comparação exata (só normalizando caixa): nick é identidade aqui, e
    // busca por prefixo faria "tiro" trazer as passagens de "tiroteio".
    const filtrados = alvo ? todos.filter((e) => e.actor.toLowerCase() === alvo) : todos;
    return filtrados.slice(0, options.limit ?? this.limit);
  }

  private async fetchRecent(): Promise<ActivityLogEvent[]> {
    return this.withConnection(async (sftp) => {
      const logRoots = await this.discoverLogRoots(sftp);
      const all: ActivityLogEvent[] = [];

      for (const logsPath of logRoots) {
        const entries = await this.listOrEmpty(sftp, logsPath);
        const dayFiles = entries
          .filter((entry) => entry.type === "-" && isDailyLogFilename(entry.name))
          .sort((a, b) => b.name.localeCompare(a.name))
          .slice(0, RECENT_DAY_FILES);

        for (const file of dayFiles) {
          const content = await this.getOrEmpty(sftp, `${logsPath}/${file.name}`);
          content.split("\n").forEach((line, index) => {
            const parsed = parseSteamFilterLogLine(line);
            if (parsed) all.push({ ...parsed, id: `lsflog-${file.name}-${index}` });
          });
        }
      }

      all.sort((a, b) => b.at.localeCompare(a.at));
      return all;
    });
  }

  /** Reconhece cada subpasta "IP_PORTA" da raiz do SFTP como um servidor, igual ao SftpDemoService. */
  private async discoverLogRoots(sftp: SteamFilterLogClientLike): Promise<string[]> {
    const entries = await this.listOrEmpty(sftp, this.conn.base);
    const roots: string[] = [];
    for (const entry of entries) {
      if (entry.type !== "d") continue;
      if (!parseServerDirName(entry.name)) continue;
      roots.push(path.posix.join(this.conn.base, entry.name, ...LOG_SUBPATH));
    }
    return roots;
  }

  /** Uma pasta de logs que ainda não existe (server novo, nunca rodou o plugin) não é erro. */
  private async listOrEmpty(sftp: SteamFilterLogClientLike, remotePath: string) {
    try {
      return await sftp.list(remotePath);
    } catch {
      return [];
    }
  }

  private async getOrEmpty(sftp: SteamFilterLogClientLike, remotePath: string): Promise<string> {
    try {
      const buf = await sftp.get(remotePath);
      return buf.toString("utf-8");
    } catch {
      return "";
    }
  }

  private async withConnection<T>(fn: (sftp: SteamFilterLogClientLike) => Promise<T>): Promise<T> {
    const sftp = this.createClient();
    try {
      await sftp.connect({
        host: this.conn.host,
        port: this.conn.port,
        username: this.conn.username,
        password: this.conn.password,
        readyTimeout: READY_TIMEOUT_MS,
      });
      return await fn(sftp);
    } catch (cause) {
      throw classifySftpError(cause);
    } finally {
      try {
        await sftp.end();
      } catch {
        // conexão já pode estar morta — não pode derrubar o processo.
      }
    }
  }
}
