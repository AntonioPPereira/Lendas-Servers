import type { SourceBansClientLike } from "../../src/services/SourceBansService.js";

export const BASE = "/sftp";
/** Mesmas duas pastas de servidor que o SFTP real expõe. */
export const SERVER_DIRS = ["104.234.65.244_27800", "104.234.65.243_27490"];

const EXPORT_PATH = "cstrike/addons/sourcemod/data/lendas_bans.json";

export interface FakeSourceBansOptions {
  /** Conteúdo por pasta de servidor. Ausente = servidor sem o plugin instalado. */
  files?: Record<string, string>;
  /** Simula a raiz do SFTP fora do ar. */
  listThrows?: boolean;
}

/**
 * Reproduz só o que `SourceBansService` usa: listar a raiz e baixar o JSON
 * de cada servidor. `get` rejeita quando o arquivo não existe — exatamente
 * como o SFTP real faz num servidor sem o plugin.
 */
export function makeFakeSourceBansClient(options: FakeSourceBansOptions = {}) {
  const files = options.files ?? {};
  const getCalls: string[] = [];
  let ended = false;

  const client: SourceBansClientLike = {
    async connect() {
      return undefined;
    },
    async list(remotePath: string) {
      if (options.listThrows) throw new Error("sftp down");
      if (remotePath !== BASE) return [];
      return SERVER_DIRS.map((name) => ({ type: "d", name }));
    },
    async get(remotePath: string) {
      getCalls.push(remotePath);
      for (const [dir, content] of Object.entries(files)) {
        if (remotePath === `${BASE}/${dir}/${EXPORT_PATH}`) {
          return Buffer.from(content, "utf-8");
        }
      }
      throw new Error(`No such file: ${remotePath}`);
    },
    async end() {
      ended = true;
      return undefined;
    },
  };

  return {
    client,
    getCalls,
    get ended() {
      return ended;
    },
  };
}

/** Um export mínimo e válido, no formato exato que o plugin escreve. */
export function makeExport(items: unknown[], generatedAt = 1_788_000_000): string {
  return JSON.stringify({ generatedAt, items });
}
