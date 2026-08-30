import { config } from "./config.js";
import { SftpDemoService } from "./services/SftpDemoService.js";
import { HLStatsService } from "./services/HLStatsService.js";
import { SteamFilterLogService } from "./services/SteamFilterLogService.js";
import { SteamAvatarService } from "./services/SteamAvatarService.js";
import { SourceBansService } from "./services/SourceBansService.js";
import { PlayerDirectoryService } from "./services/PlayerDirectoryService.js";
import { createApp } from "./app.js";

const demos = new SftpDemoService(config.sftp, config.demosCacheTtlMs);
const hlstats = new HLStatsService(
  config.hlstats,
  config.hlstats.serversCacheTtlMs,
  config.hlstats.rankingCacheTtlMs,
);
// Mesma conexão SFTP das demos — o veredito do plugin já está nos logs, sem banco.
const steamFilter = new SteamFilterLogService(config.sftp, config.activityCacheTtlMs, config.activityLimit);
// Bans do SourceBans++ via o JSON que o plugin exporta — mesma conexão SFTP.
const sourceBans = new SourceBansService(config.sftp, config.bansCacheTtlMs);
// Índice nick->SteamID64 do servidor de jogo: é o que permite avatar real no ranking.
const playerDirectory = new PlayerDirectoryService(config.sftp, config.playerDirectoryCacheTtlMs);
const avatars = new SteamAvatarService(config.steam.apiKey, config.steam.avatarCacheTtlMs);

const app = createApp(
  { demos, hlstats, steamFilter, sourceBans, playerDirectory, avatars },
  {
    corsOrigin: config.corsOrigin,
    liveApiToken: config.live.apiToken,
    liveStaleMs: config.live.staleMs,
    liveSseHeartbeatMs: config.live.sseHeartbeatMs,
    preferredLiveServerId: config.live.preferredServerId,
    rankingBaselineIntervalMs: config.hlstats.rankingBaselineIntervalMs,
  },
);

app.listen(config.port, () => {
  console.log(`[lendas-server] ouvindo em http://localhost:${config.port}`);
  console.log(`[lendas-server] CORS liberado para ${config.corsOrigin.join(", ")}`);
  console.log(`[lendas-server] SFTP alvo: ${config.sftp.host}:${config.sftp.port} base=${config.sftp.base}`);
  console.log(`[lendas-server] HLstatsX alvo: ${config.hlstats.baseUrl} (game=${config.hlstats.game})`);
  console.log("[lendas-server] lendas_steamfilter: lendo os logs via a mesma conexão SFTP das demos");
  console.log(
    config.live.apiToken
      ? "[lendas-server] live: ingestão ativa em /api/live/events, stream em /api/live/stream"
      : "[lendas-server] live: LIVE_API_TOKEN vazio — /api/live/events vai responder 503 até ser configurado",
  );
  console.log(
    config.steam.apiKey
      ? "[lendas-server] avatares: resolução via Steam Web API ativa"
      : "[lendas-server] avatares: STEAM_API_KEY vazio — jogadores ao vivo caem pro emblema gerado",
  );
});
