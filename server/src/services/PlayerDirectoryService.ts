import path from "node:path";
import SftpClient from "ssh2-sftp-client";
import { TtlCache } from "../lib/cache.js";
import { classifySftpError } from "../errors.js";
import { parseServerDirName } from "../lib/demoId.js";
import type { SftpConnectionConfig } from "./SftpDemoService.js";

/**
 * Índice `nick -> SteamID64` que o plugin `lendas_players` mantém dentro do
 * servidor de jogo.
 *
 * Existe porque o HLstatsX — de onde vem o ranking — expõe só o nick, nunca
 * o SteamID (auditado; ver server/README.md). Sem SteamID não há como pedir
 * o avatar real à Steam, e todo o ranking fica com o emblema gerado. O
 * servidor de jogo conhece o SteamID de quem entra, então é ele que registra
 * o par; aqui a gente só lê, pela MESMA conexão SFTP de demos/atividade.
 *
 * Cobertura é parcial por natureza: só entra quem já jogou desde que o
 * índice existe. Quem nunca apareceu continua sem avatar real — e isso é
 * correto, é melhor que inventar uma foto.
 */

export interface PlayerDirectoryClientLike {
  connect(config: { host: string; port: number; username: string; password: string; readyTimeout: number }): Promise<unknown>;
  list(remotePath: string): Promise<Array<{ type: string; name: string }>>;
  get(remotePath: string): Promise<Buffer>;
  end(): Promise<unknown>;
}

type ClientFactory = () => PlayerDirectoryClientLike;

const READY_TIMEOUT_MS = 10_000;
const EXPORT_SUBPATH = ["cstrike", "addons", "sourcemod", "data", "lendas_players.json"];
/** SteamID64 tem 17 dígitos; qualquer coisa fora disso é lixo, não um ID. */
const STEAM_ID64_PATTERN = /^\d{17}$/;

function defaultClient(): PlayerDirectoryClientLike {
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

export class PlayerDirectoryService {
  private readonly cache: TtlCache<Map<string, string>>;

  constructor(
    private readonly conn: SftpConnectionConfig,
    cacheTtlMs: number,
    private readonly createClient: ClientFactory = defaultClient,
  ) {
    this.cache = new TtlCache<Map<string, string>>(cacheTtlMs);
  }

  /** Mapa nick -> SteamID64. Nunca lança por índice ausente: devolve vazio. */
  async getDirectory(): Promise<Map<string, string>> {
    return this.cache.getStaleWhileRevalidate(
      () => this.load(),
      (cause) => console.error("[player-directory] atualização de fundo falhou:", cause),
    );
  }

  private async load(): Promise<Map<string, string>> {
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
       * Cada servidor mantém o próprio índice. Juntamos todos: um jogador
       * que só joga no Servidor 02 tem que ganhar avatar igual.
       */
      const juntos = new Map<string, string>();
      for (const root of await this.discoverRoots(sftp)) {
        for (const [nick, id] of await this.readOrEmpty(sftp, root)) {
          juntos.set(nick, id);
        }
      }
      return juntos;
    } catch (err) {
      throw classifySftpError(err);
    } finally {
      await sftp.end().catch(() => undefined);
    }
  }

  private async discoverRoots(sftp: PlayerDirectoryClientLike): Promise<string[]> {
    const entries = await sftp.list(this.conn.base);
    const roots: string[] = [];
    for (const entry of entries) {
      if (entry.type !== "d") continue;
      if (!parseServerDirName(entry.name)) continue;
      roots.push(path.posix.join(this.conn.base, entry.name, ...EXPORT_SUBPATH));
    }
    return roots;
  }

  /** Servidor sem o plugin não tem o arquivo — não é erro, só não contribui. */
  private async readOrEmpty(
    sftp: PlayerDirectoryClientLike,
    remotePath: string,
  ): Promise<Map<string, string>> {
    const vazio = new Map<string, string>();
    let raw: Buffer;
    try {
      raw = await sftp.get(remotePath);
    } catch {
      return vazio;
    }

    try {
      const parsed = JSON.parse(raw.toString("utf-8")) as { players?: Record<string, unknown> };
      if (!parsed.players || typeof parsed.players !== "object") return vazio;

      for (const [nick, id] of Object.entries(parsed.players)) {
        // Só aceita o que tem cara de SteamID64: um valor torto viraria uma
        // consulta inútil à Steam, ou pior, o avatar de outra pessoa.
        if (typeof id === "string" && STEAM_ID64_PATTERN.test(id)) {
          vazio.set(nick, id);
        }
      }
      return vazio;
    } catch {
      return vazio;
    }
  }
}
