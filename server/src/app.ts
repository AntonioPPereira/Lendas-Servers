import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import type { SftpDemoService } from "./services/SftpDemoService.js";
import type { HLStatsService } from "./services/HLStatsService.js";
import type { SteamFilterLogService } from "./services/SteamFilterLogService.js";
import type { SourceBansService } from "./services/SourceBansService.js";
import type { PlayerDirectoryService } from "./services/PlayerDirectoryService.js";
import type { PlayerStatsService } from "./services/PlayerStatsService.js";
import type { SteamAvatarService } from "./services/SteamAvatarService.js";
import { LiveMatchState } from "./live/state.js";
import { LiveBroadcaster } from "./live/broadcaster.js";
import { NicknameDirectory } from "./live/nicknameDirectory.js";
import { RankingBaseline } from "./services/RankingBaseline.js";
import { createDemosRouter } from "./routes/demos.js";
import { createServersRouter } from "./routes/servers.js";
import { createRankingRouter } from "./routes/ranking.js";
import { createPlayersRouter } from "./routes/players.js";
import { createActivityRouter } from "./routes/activity.js";
import { createBansRouter } from "./routes/bans.js";
import { createStatsRouter } from "./routes/stats.js";
import { createLiveEventsRouter } from "./routes/liveEvents.js";
import { createLiveStreamRouter } from "./routes/liveStream.js";
import { errorHandler } from "./middleware/errorHandler.js";

const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

export interface AppServices {
  demos: SftpDemoService;
  hlstats: HLStatsService;
  steamFilter: SteamFilterLogService;
  sourceBans: SourceBansService;
  playerDirectory: PlayerDirectoryService;
  playerStats: PlayerStatsService;
  avatars: SteamAvatarService;
}

export interface AppOptions {
  /** Uma origem, várias (a lib `cors` aceita array nativamente), ou `true` (qualquer origem — testes). */
  corsOrigin?: string | string[];
  /** Token que `POST /api/live/events` exige. Vazio (padrão) = rota sempre responde "não configurado". */
  liveApiToken?: string;
  /** Servidor sem snapshot novo há mais que isso é considerado morto e removido do estado ao vivo. */
  liveStaleMs?: number;
  /** Intervalo do comentário de keep-alive de cada conexão SSE. */
  liveSseHeartbeatMs?: number;
  /** "IP_PORTA" preferido pra "Partida ao vivo" quando estiver ativo — ver LiveMatchState. */
  preferredLiveServerId?: string;
  /** Janela de comparação de posição/skill no ranking — ver RankingBaseline. */
  rankingBaselineIntervalMs?: number;
}

/**
 * Fábrica do app, sem tocar em `config`/env — assim os testes de rota
 * rodam sem precisar de um .env real, e o app fica genuinamente testável
 * fora do processo de produção.
 *
 * `LiveMatchState`/`LiveBroadcaster`/`NicknameDirectory` nascem aqui dentro
 * (um por `createApp`, nunca compartilhado entre chamadas) — ao contrário
 * dos outros serviços, não fazem I/O externo nenhum, são só coordenação em
 * memória entre as rotas de live e o ranking; isolar por instância de app é
 * o que mantém os testes sem estado vazando de um caso pro outro.
 */
export function createApp(services: AppServices, options: AppOptions = {}) {
  const app = express();
  const liveState = new LiveMatchState(options.liveStaleMs ?? 30_000, options.preferredLiveServerId);
  const liveBroadcaster = new LiveBroadcaster();
  const nicknames = new NicknameDirectory();
  const rankingBaseline = new RankingBaseline(options.rankingBaselineIntervalMs ?? 3_600_000);

  // Atrás de exatamente um proxy reverso em produção (Render, e qualquer PaaS
  // parecido) — sem isso o express-rate-limit não confia no X-Forwarded-For
  // e pode acabar tratando todo mundo atrás do proxy como um cliente só.
  app.set("trust proxy", 1);

  app.disable("x-powered-by");
  app.use(cors({ origin: options.corsOrigin ?? true }));
  app.use(express.json({ limit: "256kb" }));
  app.use("/api", apiLimiter);

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/demos", createDemosRouter(services.demos));
  app.use("/api/servers", createServersRouter(services.hlstats));
  app.use("/api/ranking", createRankingRouter(services.hlstats, nicknames, services.avatars, rankingBaseline, services.playerDirectory));
  app.use("/api/players", createPlayersRouter(services.hlstats, nicknames, services.avatars, services.playerDirectory));
  app.use("/api/activity", createActivityRouter(services.steamFilter));
  app.use("/api/bans", createBansRouter(services.sourceBans, services.hlstats));
  app.use("/api/stats", createStatsRouter(services.hlstats, services.playerStats, services.avatars));
  app.use(
    "/api/live/events",
    createLiveEventsRouter(liveState, liveBroadcaster, services.avatars, nicknames, options.liveApiToken ?? ""),
  );
  app.use(
    "/api/live/stream",
    createLiveStreamRouter(liveState, liveBroadcaster, options.liveSseHeartbeatMs ?? 15_000),
  );

  app.use((_req, res) => res.status(404).json({ error: "not_found", message: "Rota inexistente." }));
  app.use(errorHandler);

  return app;
}
