import path from "node:path";
import SftpClient from "ssh2-sftp-client";
import type { Writable } from "node:stream";
import { TtlCache } from "../lib/cache.js";
import { classifySftpError, DemoNotFoundError, InvalidDemoIdError } from "../errors.js";
import {
  buildDemoId,
  isDemoFilename,
  isYearMonthDir,
  parseDemoId,
  parseServerDirName,
  resolveDemoPath,
  type ParsedDemoId,
  type ServerRoot,
} from "../lib/demoId.js";

export interface DemoFile {
  id: string;
  filename: string;
  map: string;
  /** "2026-08-01" */
  date: string;
  /** "16:46" */
  time: string;
  /** ISO local (sem timezone — o nome do arquivo não informa fuso). */
  recordedAt: string;
  sizeBytes: number;
  /** "104.234.65.244:27800" — de qual servidor esta demo veio. */
  server: string;
}

export interface SftpConnectionConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  /** Pasta que contém uma subpasta "IP_PORTA" por servidor de jogo. */
  base: string;
}

/**
 * Só a fatia de `ssh2-sftp-client` que este serviço realmente usa. Depender
 * disso em vez da classe concreta é o que permite testar com um fake simples
 * (sem abrir socket nenhum) em vez de mockar o módulo inteiro.
 */
export interface SftpClientLike {
  connect(config: { host: string; port: number; username: string; password: string; readyTimeout: number }): Promise<unknown>;
  list(remotePath: string): Promise<Array<{ type: string; name: string; size: number }>>;
  stat(remotePath: string): Promise<{ size: number }>;
  get(remotePath: string, dest: Writable): Promise<unknown>;
  end(): Promise<unknown>;
}

type SftpClientFactory = () => SftpClientLike;

const READY_TIMEOUT_MS = 10_000;
/** "cstrike/demos" dentro da pasta de cada servidor — convenção fixa do jogo, não varia por servidor. */
const DEMOS_SUBPATH = ["cstrike", "demos"];

/**
 * Único ponto de contato com o filesystem de demos via SFTP.
 *
 * A raiz do SFTP não tem uma única pasta de demos: cada servidor de jogo tem
 * a sua própria, nomeada "IP_PORTA" (descoberto em produção em 2026-08-25).
 * Este serviço descobre essas pastas sozinho a cada refresh — nada disso é
 * configurado à mão — e trata cada uma como uma raiz independente.
 *
 * Nunca recebe um caminho vindo de fora — só IDs, resolvidos aqui mesmo (ver
 * lib/demoId.ts). Cada operação abre sua própria conexão de vida curta e a
 * fecha no `finally`; a listagem é cacheada (TtlCache) para não abrir uma
 * conexão a cada elemento renderizado no frontend.
 */
export class SftpDemoService {
  private readonly cache: TtlCache<DemoFile[]>;

  constructor(
    private readonly conn: SftpConnectionConfig,
    cacheTtlMs: number,
    private readonly createClient: SftpClientFactory = () => new SftpClient(),
  ) {
    this.cache = new TtlCache<DemoFile[]>(cacheTtlMs);
  }

  /** Lista cacheada de todas as demos, de todos os servidores, mais recente primeiro. */
  async listDemos(): Promise<DemoFile[]> {
    try {
      return await this.cache.get(() => this.fetchAll());
    } catch (cause) {
      // Fonte fora do ar: uma lista velha ainda é melhor que uma tela quebrada.
      const stale = this.cache.peekStale();
      if (stale) return stale;
      throw cause;
    }
  }

  /** Uma demo por ID. `null` = ID válido mas arquivo (ou servidor) não existe. Lança se o ID for mal formado. */
  async getDemo(id: string): Promise<DemoFile | null> {
    if (!parseDemoId(id)) throw new InvalidDemoIdError(id);

    const fromCache = this.cache.peekStale()?.find((d) => d.id === id);
    if (fromCache) return fromCache;

    return this.withConnection(async (sftp) => {
      const roots = await this.discoverRoots(sftp);
      const resolved = resolveDemoPath(roots, id);
      if (!resolved) return null;

      const stat = await this.statOrNull(sftp, resolved.path);
      if (!stat) return null;
      return this.toDemoFile(resolved.parsed, stat.size, resolved.root);
    });
  }

  /** Transmite o arquivo direto pro destino (a resposta HTTP), sem bufferizar em memória. */
  async streamDemo(id: string, dest: Writable): Promise<{ filename: string; sizeBytes: number }> {
    if (!parseDemoId(id)) throw new InvalidDemoIdError(id);

    return this.withConnection(async (sftp) => {
      const roots = await this.discoverRoots(sftp);
      const resolved = resolveDemoPath(roots, id);
      if (!resolved) throw new DemoNotFoundError(id);

      const stat = await this.statOrNull(sftp, resolved.path);
      if (!stat) throw new DemoNotFoundError(id);

      await sftp.get(resolved.path, dest);
      return { filename: resolved.parsed.filename, sizeBytes: stat.size };
    });
  }

  /** Lista a raiz e reconhece cada subpasta "IP_PORTA" como um servidor. */
  private async discoverRoots(sftp: SftpClientLike): Promise<ServerRoot[]> {
    const entries = await sftp.list(this.conn.base);
    const roots: ServerRoot[] = [];
    for (const entry of entries) {
      if (entry.type !== "d") continue;
      const server = parseServerDirName(entry.name);
      if (!server) continue;
      roots.push({
        ip: server.ip,
        port: server.port,
        root: path.posix.join(this.conn.base, entry.name, ...DEMOS_SUBPATH),
      });
    }
    return roots;
  }

  private async fetchAll(): Promise<DemoFile[]> {
    return this.withConnection(async (sftp) => {
      const roots = await this.discoverRoots(sftp);

      const all: DemoFile[] = [];
      for (const root of roots) {
        const monthEntries = await this.listOrEmpty(sftp, root.root);
        const monthDirs = monthEntries.filter((entry) => entry.type === "d" && isYearMonthDir(entry.name));

        for (const month of monthDirs) {
          const dirPath = `${root.root}/${month.name}`;
          const files = await sftp.list(dirPath);
          for (const file of files) {
            if (file.type !== "-" || !isDemoFilename(file.name)) continue;
            const id = buildDemoId(root.port, file.name);
            const parsed = parseDemoId(id);
            if (!parsed) continue; // defesa extra, não deveria falhar se isDemoFilename já bateu
            all.push(this.toDemoFile(parsed, file.size, root));
          }
        }
      }

      all.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
      return all;
    });
  }

  private toDemoFile(parsed: ParsedDemoId, sizeBytes: number, root: ServerRoot): DemoFile {
    return {
      id: parsed.id,
      filename: parsed.filename,
      map: parsed.map,
      date: parsed.date,
      time: parsed.time,
      recordedAt: parsed.recordedAtLocal,
      sizeBytes,
      server: `${root.ip}:${root.port}`,
    };
  }

  /** Uma pasta de servidor sem "demos" ainda (nunca gravou nada) não é um erro. */
  private async listOrEmpty(sftp: SftpClientLike, remotePath: string) {
    try {
      return await sftp.list(remotePath);
    } catch {
      return [];
    }
  }

  private async statOrNull(sftp: SftpClientLike, remotePath: string) {
    try {
      return await sftp.stat(remotePath);
    } catch {
      return null;
    }
  }

  private async withConnection<T>(fn: (sftp: SftpClientLike) => Promise<T>): Promise<T> {
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
      if (cause instanceof InvalidDemoIdError || cause instanceof DemoNotFoundError) throw cause;
      throw classifySftpError(cause);
    } finally {
      try {
        await sftp.end();
      } catch {
        // a conexão pode já estar morta (foi por isso que caímos no catch acima);
        // falhar ao fechar algo que já caiu não pode derrubar o processo.
      }
    }
  }
}
