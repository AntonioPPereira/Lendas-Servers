import "dotenv/config";
import { z } from "zod";

/**
 * Toda configuração de runtime passa por aqui — nada lê `process.env`
 * diretamente em outro lugar do código. Falha cedo (no boot) se algo
 * obrigatório estiver faltando, em vez de falhar tarde numa requisição.
 */
const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  /**
   * Lista separada por vírgula — precisa aceitar mais de uma origem em
   * produção: domínio próprio (com e sem "www.") + o `.vercel.app` antigo
   * continuando válido durante a transição.
   */
  CORS_ORIGIN: z
    .string()
    .min(1)
    .default("http://localhost:5173")
    .transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean)),

  SFTP_HOST: z.string().min(1, "SFTP_HOST é obrigatório"),
  SFTP_PORT: z.coerce.number().int().positive().default(22),
  SFTP_USERNAME: z.string().min(1, "SFTP_USERNAME é obrigatório"),
  SFTP_PASSWORD: z.string().min(1, "SFTP_PASSWORD é obrigatório"),
  /**
   * Pasta que contém uma subpasta por servidor de jogo (nomeada
   * "IP_PORTA", ex: "104.234.65.244_27800"). O backend descobre os
   * servidores sozinho listando isto — não precisa listar cada um aqui.
   */
  SFTP_BASE: z.string().min(1).default("/"),

  DEMOS_CACHE_TTL_MS: z.coerce.number().int().nonnegative().default(60_000),

  /** Base do HLstatsX:CE — sem API estruturada, o adapter faz parsing do HTML. */
  HLSTATS_BASE_URL: z
    .string()
    .url()
    .default("https://mixlendas-rank.clanservers.com.br/hlstats.php"),
  HLSTATS_GAME: z.string().min(1).default("css"),
  SERVERS_CACHE_TTL_MS: z.coerce.number().int().nonnegative().default(10_000),
  RANKING_CACHE_TTL_MS: z.coerce.number().int().nonnegative().default(45_000),
  /**
   * De quanto em quanto tempo o ranking congela uma nova linha de base pra
   * comparar posição e skill. É a janela que o painel mostra como "variação"
   * — 1h por padrão. Ver services/RankingBaseline.ts.
   */
  RANKING_BASELINE_INTERVAL_MS: z.coerce.number().int().positive().default(3_600_000),
  /** Timeout de cada requisição HTTP ao HLstatsX. */
  HLSTATS_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  /**
   * Feed de atividade (`lendas_steamfilter`): lido dos logs diários do
   * SourceMod pela MESMA conexão SFTP das demos (`SFTP_*` acima) — não
   * existe credencial própria, nem banco de dados envolvido. Ver
   * server/README.md.
   */
  ACTIVITY_CACHE_TTL_MS: z.coerce.number().int().nonnegative().default(10_000),
  /** O plugin exporta os bans a cada 5 min; reler antes disso não traz nada novo. */
  BANS_CACHE_TTL_MS: z.coerce.number().int().nonnegative().default(120_000),
  /** Quantos eventos recentes o feed de atividade traz por vez. */
  ACTIVITY_LIMIT: z.coerce.number().int().positive().default(60),

  /**
   * Ingestão ao vivo (`lendas_live.smx`, novo plugin SourceMod → POST
   * /api/live/events → SSE /api/live/stream). Token compartilhado entre o
   * plugin e o backend — vazio (padrão) desativa a rota de ingestão, que
   * responde 503 em vez de aceitar eventos sem autenticação nenhuma.
   */
  // .trim(): um espaço ou quebra de linha invisível colado no dashboard do
  // Render (comum ao copiar de chat/editor) faria a comparação de tamanho
  // falhar mesmo com o valor "certo" — confirmado em produção 2026-08-26.
  LIVE_API_TOKEN: z.string().default("").transform((value) => value.trim()),
  /** Um servidor sem snapshot novo por esse tempo é considerado morto e removido do estado. */
  LIVE_STALE_MS: z.coerce.number().int().positive().default(30_000),
  /**
   * "IP_PORTA" do Servidor 01 — pedido explícito: a "Partida ao vivo" mostra
   * este sempre que ele estiver ativo, mesmo que outro servidor tenha mais
   * gente conectada no momento. Cai pro critério de mais gente conectada
   * só se este não tiver mandado snapshot nenhum ainda.
   */
  LIVE_PREFERRED_SERVER_ID: z.string().min(1).default("104.234.65.244_27800"),
  /** Comentário de keep-alive no SSE, pra conexão não cair em proxy/load balancer no meio. */
  LIVE_SSE_HEARTBEAT_MS: z.coerce.number().int().positive().default(15_000),

  /**
   * Steam Web API — só do BACKEND, nunca do plugin (o plugin manda apenas o
   * SteamID64 capturado; quem resolve o avatar é aqui). Vazio (padrão) =
   * avatares reais desligados, o frontend cai pro emblema gerado.
   */
  STEAM_API_KEY: z.string().default(""),
  /** Avatar muda raro — cache bem mais longo que qualquer outra fonte deste backend. */
  STEAM_AVATAR_CACHE_TTL_MS: z.coerce.number().int().nonnegative().default(3_600_000),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`);
  throw new Error(
    "Configuração inválida. Confira o .env contra .env.example:\n" + issues.join("\n"),
  );
}

const env = parsed.data;

export const config = {
  port: env.PORT,
  corsOrigin: env.CORS_ORIGIN,
  sftp: {
    host: env.SFTP_HOST,
    port: env.SFTP_PORT,
    username: env.SFTP_USERNAME,
    password: env.SFTP_PASSWORD,
    base: env.SFTP_BASE.replace(/\/+$/, "") || "/",
  },
  demosCacheTtlMs: env.DEMOS_CACHE_TTL_MS,
  hlstats: {
    baseUrl: env.HLSTATS_BASE_URL,
    game: env.HLSTATS_GAME,
    timeoutMs: env.HLSTATS_TIMEOUT_MS,
    serversCacheTtlMs: env.SERVERS_CACHE_TTL_MS,
    rankingCacheTtlMs: env.RANKING_CACHE_TTL_MS,
    rankingBaselineIntervalMs: env.RANKING_BASELINE_INTERVAL_MS,
  },
  activityCacheTtlMs: env.ACTIVITY_CACHE_TTL_MS,
  activityLimit: env.ACTIVITY_LIMIT,
  bansCacheTtlMs: env.BANS_CACHE_TTL_MS,
  live: {
    apiToken: env.LIVE_API_TOKEN,
    staleMs: env.LIVE_STALE_MS,
    sseHeartbeatMs: env.LIVE_SSE_HEARTBEAT_MS,
    preferredServerId: env.LIVE_PREFERRED_SERVER_ID,
  },
  steam: {
    apiKey: env.STEAM_API_KEY,
    avatarCacheTtlMs: env.STEAM_AVATAR_CACHE_TTL_MS,
  },
} as const;
