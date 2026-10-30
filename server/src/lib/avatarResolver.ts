import type { NicknameDirectory } from "../live/nicknameDirectory.js";
import type { PlayerDirectoryService } from "../services/PlayerDirectoryService.js";
import type { SteamAvatarService } from "../services/SteamAvatarService.js";

/**
 * Descobre o avatar real de uma leva de nicknames de uma vez só.
 *
 * O problema que isto resolve: o ranking vem do HLstatsX, que expõe só o
 * nick — nunca o SteamID (auditado; ver server/README.md). Sem SteamID não
 * há como pedir a foto à Steam. Então cruzamos o nick com duas fontes que
 * conhecem o SteamID de verdade:
 *
 * 1. `NicknameDirectory` — quem o `lendas_live` acabou de reportar (em
 *    memória, some no restart, mas é o dado mais fresco).
 * 2. `PlayerDirectoryService` — o índice histórico que o `lendas_players`
 *    mantém no servidor de jogo (persistente, cobre quem não está online).
 *
 * A primeira ganha quando as duas conhecem o nick: se a pessoa está jogando
 * agora, aquele é o vínculo mais recente entre nick e conta.
 *
 * Em lote de propósito: `GetPlayerSummaries` aceita 100 IDs por chamada, e
 * uma página do ranking tem no máximo 100 linhas — então isso custa **uma**
 * requisição à Steam, não uma por jogador.
 */
export async function resolveAvatarsByNickname(
  nicknamesToResolve: readonly string[],
  live: NicknameDirectory,
  directory: PlayerDirectoryService,
  avatars: SteamAvatarService,
): Promise<Map<string, string>> {
  let historico: Map<string, string>;
  try {
    historico = await directory.getDirectory();
  } catch {
    // Índice indisponível não pode derrubar a página: avatar é enfeite, e a
    // ausência dele já tem tratamento no frontend (emblema gerado).
    historico = new Map();
  }

  const idPorNick = new Map<string, string>();
  for (const nick of nicknamesToResolve) {
    const id = live.lookup(nick) ?? historico.get(nick);
    if (id) idPorNick.set(nick, id);
  }

  const urlPorId = await avatars.resolve([...new Set(idPorNick.values())]);

  const resultado = new Map<string, string>();
  for (const [nick, id] of idPorNick) {
    const url = urlPorId.get(id);
    // Conta sem avatar público simplesmente não entra — nunca um placeholder
    // remoto fingindo ser a foto da pessoa.
    if (url) resultado.set(nick, url);
  }
  return resultado;
}
