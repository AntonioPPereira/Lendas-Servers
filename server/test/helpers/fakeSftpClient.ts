import type { SftpClientLike } from "../../src/services/SftpDemoService.js";

export interface FileEntry {
  type: string;
  name: string;
  size: number;
  content?: string;
}

/** Raiz do SFTP — igual à conta real: uma pasta "IP_PORTA" por servidor de jogo. */
export const BASE = "/";

const SRV1 = "/104.234.65.244_27800/cstrike/demos";
const SRV2 = "/104.234.65.243_27490/cstrike/demos";

export const SAMPLE_TREE: Record<string, FileEntry[]> = {
  [BASE]: [
    { type: "d", name: "104.234.65.244_27800", size: 0 },
    { type: "d", name: "104.234.65.243_27490", size: 0 },
    { type: "d", name: "lost+found", size: 0 }, // pasta que não bate "IP_PORTA" — ignorada
    { type: "-", name: "readme.txt", size: 12 }, // arquivo solto na raiz — ignorado
  ],
  [SRV1]: [
    { type: "d", name: "2026-08", size: 0 },
    { type: "d", name: "2026-07", size: 0 },
    { type: "d", name: "scripts", size: 0 }, // não bate YYYY-MM — ignorada
    { type: "-", name: "readme.txt", size: 12 }, // arquivo solto — ignorado
  ],
  [`${SRV1}/2026-08`]: [
    { type: "-", name: "20260801-1646-de_dust2.dem", size: 13, content: "conteudo-fake" },
    { type: "-", name: "20260801-1643-de_tuscan.dem", size: 30_000_000 },
    { type: "-", name: "notes.txt", size: 5 }, // não .dem — ignorado
    { type: "d", name: "subpasta", size: 0 }, // diretório dentro do mês — ignorado
  ],
  [`${SRV1}/2026-07`]: [{ type: "-", name: "20260715-2010-de_inferno.dem", size: 10_000_000 }],
  [SRV2]: [{ type: "d", name: "2026-08", size: 0 }],
  [`${SRV2}/2026-08`]: [
    { type: "-", name: "20260801-1900-de_mirage_csgo_v2.dem", size: 20_000_000 },
  ],
};

/** IDs esperados a partir do SAMPLE_TREE acima, mais recente primeiro. */
export const SAMPLE_IDS_BY_RECENCY = [
  "27490-20260801-1900-de_mirage_csgo_v2",
  "27800-20260801-1646-de_dust2",
  "27800-20260801-1643-de_tuscan",
  "27800-20260715-2010-de_inferno",
];

/** Filesystem falso: caminho -> entradas. Sem rede, sem timers reais. */
export function makeFakeClient(opts: { tree: Record<string, FileEntry[]>; connectError?: unknown }): {
  client: SftpClientLike;
  connectCalls: () => number;
} {
  let connectCalls = 0;
  const client: SftpClientLike = {
    async connect() {
      connectCalls += 1;
      if (opts.connectError) throw opts.connectError;
    },
    async list(remotePath: string) {
      const key = remotePath.length > 1 ? remotePath.replace(/\/+$/, "") : remotePath;
      const entries = opts.tree[key];
      if (!entries) throw new Error(`No such directory: ${remotePath}`);
      return entries;
    },
    async stat(remotePath: string) {
      const dir = remotePath.slice(0, remotePath.lastIndexOf("/")) || "/";
      const name = remotePath.slice(remotePath.lastIndexOf("/") + 1);
      const entry = (opts.tree[dir] ?? []).find((e) => e.name === name);
      if (!entry) throw new Error("No such file");
      return { size: entry.size };
    },
    async get(remotePath: string, dest) {
      const dir = remotePath.slice(0, remotePath.lastIndexOf("/")) || "/";
      const name = remotePath.slice(remotePath.lastIndexOf("/") + 1);
      const entry = (opts.tree[dir] ?? []).find((e) => e.name === name);
      if (!entry) throw new Error("No such file");
      dest.end(Buffer.from(entry.content ?? "conteudo-fake"));
    },
    async end() {},
  };
  return { client, connectCalls: () => connectCalls };
}
