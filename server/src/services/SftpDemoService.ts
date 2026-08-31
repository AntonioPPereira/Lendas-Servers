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
  /** Um cache por período ("2026-08") — nunca um cache só pro histórico inteiro. */
  private readonly cachesByPeriod = new Map<string, TtlCache<DemoFile[]>>();
  /** Um por período pedido ("" = o mais recente). Ver `listArchive`. */
  private readonly archiveCaches = new Map<
    string,
    TtlCache<{ periods: string[]; period: string; demos: DemoFile[] }>
  >();
  private readonly periodsCache: TtlCache<string[]>;

  constructor(
    private readonly conn: SftpConnectionConfig,
    private readonly cacheTtlMs: number,
    private readonly createClient: SftpClientFactory = () => new SftpClient(),
  ) {
    this.periodsCache = new TtlCache<string[]>(cacheTtlMs);
  }

  /**
   * Demos de um único período ("2026-08"), em todos os servidores — nunca
   * varre o histórico inteiro. Pedido explícito (2026-08-26): o arquivo cresce
   * sem parar (gravação automática a cada partida) e listar tudo a cada
   * expiração de cache ficaria mais pesado no SFTP a cada mês que passa,
   * mesmo sem ninguém pedindo o histórico velho.
   */
  async listDemos(period: string): Promise<DemoFile[]> {
    let cache = this.cachesByPeriod.get(period);
    if (!cache) {
      cache = new TtlCache<DemoFile[]>(this.cacheTtlMs);
      this.cachesByPeriod.set(period, cache);
    }
    try {
      return await cache.getStaleWhileRevalidate(
        () => this.fetchPeriod(period),
        (cause) => console.error("[demos] atualização de fundo falhou:", cause),
      );
    } catch (cause) {
      // Fonte fora do ar: uma lista velha ainda é melhor que uma tela quebrada.
      const stale = cache.peekStale();
      if (stale) return stale;
      throw cause;
    }
  }

  /** Só os nomes dos períodos que existem (sem descer nos arquivos de cada um) — pro filtro de período. */
  async listPeriods(): Promise<string[]> {
    try {
      return await this.periodsCache.get(() => this.fetchPeriods());
    } catch (cause) {
      const stale = this.periodsCache.peekStale();
      if (stale) return stale;
      throw cause;
    }
  }

  /**
   * Períodos E as demos de um deles, numa conexão SFTP SÓ.
   *
   * Existe por causa de custo real, medido: abrir a conexão custa ~3s, e
   * varrer a pasta custa pouco. A tela de Partidas precisava dos dois, e
   * chamar `listPeriods()` e depois `listDemos()` abria DUAS conexões —
   * ~7s antes de a página ter qualquer coisa pra mostrar. Do Render, com a
   * latência maior, isso estourava o tempo limite e a rota devolvia 503.
   *
   * `period` ausente = o mais recente que existe. Quem decide isso aqui é
   * quem já tem a lista de períodos em mãos, sem uma terceira ida ao
   * servidor.
   *
   * Os caches de `listPeriods`/`listDemos` são preenchidos de passagem, pra
   * uma chamada seguinte a qualquer um dos dois não reabrir nada.
   */
  async listArchive(period?: string): Promise<{ periods: string[]; period: string; demos: DemoFile[] }> {
    // Cache quente dos dois: responde sem abrir conexão nenhuma.
    const periodosEmCache = this.periodsCache.peekFresh();
    if (periodosEmCache) {
      const alvo = period ?? periodosEmCache[0];
      const demosEmCache = alvo ? this.cachesByPeriod.get(alvo)?.peekFresh() : undefined;
      if (demosEmCache) return { periods: periodosEmCache, period: alvo!, demos: demosEmCache };
    }

    /**
     * Passa por um cache PRÓPRIO, e não direto no fetch, por causa da
     * deduplicação: a tela de Partidas pede `/matches` e `/matches/maps` ao
     * mesmo tempo, e sem isso as duas abriam sua própria conexão SFTP — o
     * dobro do custo pra buscar exatamente a mesma coisa. O `TtlCache` faz
     * a segunda esperar a promise da primeira.
     */
    const chave = period ?? "";
    let cache = this.archiveCaches.get(chave);
    if (!cache) {
      cache = new TtlCache<{ periods: string[]; period: string; demos: DemoFile[] }>(this.cacheTtlMs);
      this.archiveCaches.set(chave, cache);
    }

    try {
      return await cache.getStaleWhileRevalidate(
        () => this.fetchArchive(period),
        (cause) => console.error("[demos] atualização de fundo falhou:", cause),
      );
    } catch (cause) {
      /**
       * Fonte fora do ar: devolve o que houver de velho em vez de derrubar
       * a tela. Só relança quando não há NADA — aí a página precisa dizer
       * que falhou, não fingir que o acervo está vazio.
       */
      const periods = this.periodsCache.peekStale();
      const alvo = period ?? periods?.[0];
      const demos = alvo ? this.cachesByPeriod.get(alvo)?.peekStale() : undefined;
      if (periods && alvo && demos) return { periods, period: alvo, demos };
      throw cause;
    }
  }

  /** Descobre os períodos e lista o escolhido sem fechar a conexão no meio. */
  private async fetchArchive(period?: string): Promise<{ periods: string[]; period: string; demos: DemoFile[] }> {
    return this.withConnection(async (sftp) => {
      const roots = await this.discoverRoots(sftp);

      const months = new Set<string>();
      for (const root of roots) {
        for (const entry of await this.listOrEmpty(sftp, root.root)) {
          if (entry.type === "d" && isYearMonthDir(entry.name)) months.add(entry.name);
        }
      }
      const periods = [...months].sort((a, b) => b.localeCompare(a));
      this.periodsCache.seed(periods);

      const alvo = period ?? periods[0];
      if (!alvo) return { periods, period: period ?? "", demos: [] as DemoFile[] };

      const demos: DemoFile[] = [];
      for (const root of roots) {
        for (const file of await this.listOrEmpty(sftp, `${root.root}/${alvo}`)) {
          if (file.type !== "-" || !isDemoFilename(file.name)) continue;
          const parsed = parseDemoId(buildDemoId(root.port, file.name));
          if (!parsed) continue;
          demos.push(this.toDemoFile(parsed, file.size, root));
        }
      }
      demos.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));

      // Alimenta o cache por período: um `listDemos(alvo)` logo depois (o
      // download, por exemplo) não reabre conexão.
      let cache = this.cachesByPeriod.get(alvo);
      if (!cache) {
        cache = new TtlCache<DemoFile[]>(this.cacheTtlMs);
        this.cachesByPeriod.set(alvo, cache);
      }
      cache.seed(demos);

      return { periods, period: alvo, demos };
    });
  }

  /** Uma demo por ID. `null` = ID válido mas arquivo (ou servidor) não existe. Lança se o ID for mal formado. */
  async getDemo(id: string): Promise<DemoFile | null> {
    const parsedForCache = parseDemoId(id);
    if (!parsedForCache) throw new InvalidDemoIdError(id);

    const fromCache = this.cachesByPeriod
      .get(parsedForCache.yearMonth)
      ?.peekStale()
      ?.find((d) => d.id === id);
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

  /** Nomes de pasta YYYY-MM únicos entre todos os servidores, mais recente primeiro. */
  private async fetchPeriods(): Promise<string[]> {
    return this.withConnection(async (sftp) => {
      const roots = await this.discoverRoots(sftp);
      const months = new Set<string>();

      for (const root of roots) {
        const entries = await this.listOrEmpty(sftp, root.root);
        for (const entry of entries) {
          if (entry.type === "d" && isYearMonthDir(entry.name)) months.add(entry.name);
        }
      }

      return [...months].sort((a, b) => b.localeCompare(a));
    });
  }

  /** Só a pasta `period` de cada servidor — nunca lista os outros meses. */
  private async fetchPeriod(period: string): Promise<DemoFile[]> {
    return this.withConnection(async (sftp) => {
      const roots = await this.discoverRoots(sftp);

      const all: DemoFile[] = [];
      for (const root of roots) {
        const dirPath = `${root.root}/${period}`;
        const files = await this.listOrEmpty(sftp, dirPath);
        for (const file of files) {
          if (file.type !== "-" || !isDemoFilename(file.name)) continue;
          const id = buildDemoId(root.port, file.name);
          const parsed = parseDemoId(id);
          if (!parsed) continue; // defesa extra, não deveria falhar se isDemoFilename já bateu
          all.push(this.toDemoFile(parsed, file.size, root));
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
