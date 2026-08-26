import type { SteamFilterLogClientLike } from "../../src/services/SteamFilterLogService.js";

export const BASE = "/";

/** Igual à estrutura real: uma pasta "IP_PORTA" por servidor, logs dentro do moddir. */
export const SRV1_LOGS = "/104.234.65.244_27800/cstrike/addons/sourcemod/logs";
export const SRV2_LOGS = "/104.234.65.243_27490/cstrike/addons/sourcemod/logs";

export interface FakeLogTree {
  /** path -> entradas de `list()` */
  dirs: Record<string, Array<{ type: string; name: string }>>;
  /** path completo do arquivo -> conteúdo de texto */
  files: Record<string, string>;
}

const DEFAULT_DIRS: FakeLogTree["dirs"] = {
  [BASE]: [
    { type: "d", name: "104.234.65.244_27800" },
    { type: "d", name: "104.234.65.243_27490" },
  ],
};

/** Filesystem falso: sem rede, sem timers reais — mesmo espírito do fakeSftpClient.ts das demos. */
export function makeFakeLogClient(
  tree: Partial<FakeLogTree> & { connectError?: unknown } = {},
): { client: SteamFilterLogClientLike; connectCalls: () => number } {
  const dirs = { ...DEFAULT_DIRS, ...tree.dirs };
  const files = tree.files ?? {};
  let connectCalls = 0;

  const client: SteamFilterLogClientLike = {
    async connect() {
      connectCalls += 1;
      if (tree.connectError) throw tree.connectError;
    },
    async list(remotePath: string) {
      const key = remotePath.replace(/\/+$/, "") || "/";
      const entries = dirs[key];
      if (!entries) throw new Error(`No such directory: ${remotePath}`);
      return entries;
    },
    async get(remotePath: string) {
      const content = files[remotePath];
      if (content === undefined) throw new Error(`No such file: ${remotePath}`);
      return Buffer.from(content, "utf-8");
    },
    async end() {},
  };

  return { client, connectCalls: () => connectCalls };
}
