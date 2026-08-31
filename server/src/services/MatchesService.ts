import path from "node:path";
import SftpClient from "ssh2-sftp-client";
import { TtlCache } from "../lib/cache.js";
import { classifySftpError } from "../errors.js";
import { parseServerDirName } from "../lib/demoId.js";
import type { SftpConnectionConfig } from "./SftpDemoService.js";

/**
 * Partidas ENCERRADAS, gravadas pelo plugin `lendas_matches` no disco do
 * servidor de jogo e lidas aqui pelo SFTP de sempre.
 *
 * Por que não vem do feed ao vivo: o `lendas_live` transmite tudo em tempo
 * real, mas o backend só guarda em memória — e o Render hiberna. Uma
 * partida jogada de madrugada, com o site dormindo, se perderia. O plugin
 * escreve no disco do próprio servidor, então o histórico não depende de o
 * painel estar acordado.
 *
 * O `id` sai daqui já com o prefixo de porta (`27800-20260831-1930-de_dust2`),
 * exatamente o formato de ID de demo (ver `lib/demoId.ts`). É esse
 * casamento que junta a gravação com a partida sem nenhum campo extra dos
 * dois lados.
 */

export interface MatchesClientLike {
  connect(config: { host: string; port: number; username: string; password: string; readyTimeout: number }): Promise<unknown>;
  list(remotePath: string): Promise<Array<{ type: string; name: string }>>;
  get(remotePath: string): Promise<Buffer>;
  end(): Promise<unknown>;
}

type ClientFactory = () => MatchesClientLike;

const READY_TIMEOUT_MS = 10_000;
const EXPORT_SUBPATH = ["cstrike", "addons", "sourcemod", "data", "lendas_matches.json"];

export type RoundWinner = "CT" | "T";
export type RoundReason = "bomb" | "defuse" | "elimination" | "time" | "hostage";

export interface MatchRound {
  n: number;
  winner: RoundWinner;
  reason: RoundReason;
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

export interface MatchRow {
  /** Já com prefixo de porta — mesmo espaço de ID das demos. */
  id: string;
  map: string;
  /** ISO UTC: o plugin grava `GetTime()`, que é epoch. */
  startedAt: string;
  endedAt: string;
  ctScore: number;
  tScore: number;
  rounds: MatchRound[];
  players: MatchPlayer[];
  /** Porta do servidor de origem, pra resolver nome e raiz depois. */
  port: string;
}

const RAZOES: readonly RoundReason[] = ["bomb", "defuse", "elimination", "time", "hostage"];

function isRound(valor: unknown): valor is MatchRound {
  const r = valor as Partial<MatchRound> | null;
  return (
    !!r &&
    typeof r.n === "number" &&
    (r.winner === "CT" || r.winner === "T") &&
    typeof r.reason === "string" &&
    RAZOES.includes(r.reason as RoundReason) &&
    typeof r.ct === "number" &&
    typeof r.t === "number"
  );
}

function isPlayer(valor: unknown): valor is MatchPlayer {
  const p = valor as Partial<MatchPlayer> | null;
  return (
    !!p &&
    typeof p.steamId64 === "string" &&
    /^\d{17}$/.test(p.steamId64) &&
    typeof p.name === "string" &&
    (p.team === "CT" || p.team === "T" || p.team === "SPEC") &&
    typeof p.kills === "number" &&
    typeof p.deaths === "number"
  );
}

export class MatchesService {
  private readonly cache: TtlCache<MatchRow[]>;

  constructor(
    private readonly conn: SftpConnectionConfig,
    cacheTtlMs: number,
    private readonly createClient: ClientFactory = defaultClient,
  ) {
    this.cache = new TtlCache<MatchRow[]>(cacheTtlMs);
  }

  /** Mais recentes primeiro, de todos os servidores que têm o plugin. */
  async getMatches(): Promise<MatchRow[]> {
    return this.cache.get(() => this.load());
  }

  private async load(): Promise<MatchRow[]> {
    const sftp = this.createClient();
    try {
      await sftp.connect({
        host: this.conn.host,
        port: this.conn.port,
        username: this.conn.username,
        password: this.conn.password,
        readyTimeout: READY_TIMEOUT_MS,
      });

      const todas: MatchRow[] = [];
      for (const { caminho, port } of await this.discoverRoots(sftp)) {
        todas.push(...(await this.readOrEmpty(sftp, caminho, port)));
      }

      todas.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      return todas;
    } catch (err) {
      throw classifySftpError(err);
    } finally {
      await sftp.end().catch(() => undefined);
    }
  }

  private async discoverRoots(sftp: MatchesClientLike): Promise<Array<{ caminho: string; port: string }>> {
    const entries = await sftp.list(this.conn.base);
    const roots: Array<{ caminho: string; port: string }> = [];
    for (const entry of entries) {
      if (entry.type !== "d") continue;
      const parsed = parseServerDirName(entry.name);
      if (!parsed) continue;
      roots.push({
        caminho: path.posix.join(this.conn.base, entry.name, ...EXPORT_SUBPATH),
        port: parsed.port,
      });
    }
    return roots;
  }

  /** Servidor sem o plugin não é erro — só não contribui partida nenhuma. */
  private async readOrEmpty(
    sftp: MatchesClientLike,
    remotePath: string,
    port: string,
  ): Promise<MatchRow[]> {
    let raw: Buffer;
    try {
      raw = await sftp.get(remotePath);
    } catch {
      return [];
    }

    try {
      const parsed = JSON.parse(raw.toString("utf-8")) as { matches?: unknown[] };
      if (!Array.isArray(parsed.matches)) return [];
      return parsed.matches
        .map((item) => this.sanitize(item, port))
        .filter((m): m is MatchRow => m !== null);
    } catch {
      return [];
    }
  }

  /**
   * Partida malformada é descartada inteira. Meia partida — placar sem
   * rounds, ou scoreboard sem placar — é pior que partida nenhuma: aparece
   * na lista como se estivesse completa.
   */
  private sanitize(valor: unknown, port: string): MatchRow | null {
    const m = valor as Record<string, unknown> | null;
    if (!m) return null;

    const id = m["id"];
    const map = m["map"];
    const startedAt = m["startedAt"];
    const endedAt = m["endedAt"];
    const ctScore = m["ctScore"];
    const tScore = m["tScore"];

    if (typeof id !== "string" || !/^\d{8}-\d{4}-[A-Za-z0-9_]+$/.test(id)) return null;
    if (typeof map !== "string" || map.length === 0) return null;
    if (typeof startedAt !== "number" || typeof endedAt !== "number") return null;
    if (typeof ctScore !== "number" || typeof tScore !== "number") return null;

    const rounds = Array.isArray(m["rounds"]) ? m["rounds"].filter(isRound) : [];
    const players = Array.isArray(m["players"]) ? m["players"].filter(isPlayer) : [];
    // Partida sem round não existe: é warmup ou troca de mapa.
    if (rounds.length === 0 || players.length === 0) return null;

    return {
      id: `${port}-${id}`,
      map,
      startedAt: new Date(startedAt * 1000).toISOString(),
      endedAt: new Date(endedAt * 1000).toISOString(),
      ctScore,
      tScore,
      rounds,
      players,
      port,
    };
  }
}

function defaultClient(): MatchesClientLike {
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
