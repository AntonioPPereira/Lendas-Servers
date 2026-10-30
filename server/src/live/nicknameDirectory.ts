/**
 * Ponte entre o `lendas_live` (sabe o SteamID64 real de quem está jogando) e
 * o HLstatsX (nunca expõe SteamID pra ninguém, nem no ranking nem no perfil
 * — ver HLStatsService). Guarda só "o último SteamID64 visto ao vivo com
 * este nickname", pra permitir mostrar avatar Steam real no Ranking/
 * Jogadores mesmo essa fonte não tendo SteamID nenhum.
 *
 * Nickname NÃO é identificador único de verdade — duas contas diferentes
 * podem usar o mesmo nick em momentos diferentes, e isso faria o avatar
 * "errado" aparecer até a próxima atualização. Risco aceito conscientemente
 * (comunidade pequena, nicks realmente repetidos são raros) em troca de
 * fotos reais em vez do emblema gerado sempre. Match é exato (sem
 * normalizar maiúsc/minúsc) pra reduzir colisão ao mínimo.
 *
 * Só em memória, como `LiveMatchState` — reseta a cada deploy/restart e se
 * reconstrói sozinho conforme a galera conecta de novo. Não é histórico
 * permanente, é só "quem eu vi jogando recentemente".
 */
export class NicknameDirectory {
  private readonly nicknameOf = new Map<string, string>();
  private readonly steamId64Of = new Map<string, string>();

  record(nickname: string, steamId64: string): void {
    const trimmed = nickname.trim();
    if (!trimmed || !steamId64) return;

    const previousNickname = this.nicknameOf.get(steamId64);
    if (previousNickname && previousNickname !== trimmed) {
      this.steamId64Of.delete(previousNickname);
    }

    this.nicknameOf.set(steamId64, trimmed);
    this.steamId64Of.set(trimmed, steamId64);
  }

  /** SteamID64 mais recente visto ao vivo com este nickname, se houver. */
  lookup(nickname: string): string | undefined {
    return this.steamId64Of.get(nickname.trim());
  }
}
