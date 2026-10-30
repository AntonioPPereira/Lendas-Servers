/**
 * Parsing das linhas que o `lendas_steamfilter.sp` já escreve, sem cache
 * nenhum, nos logs padrão do SourceMod (`cstrike/addons/sourcemod/logs/
 * L<YYYYMMDD>.log`) — confirmado em produção em 2026-08-25, funcionando
 * nos dois servidores, sem precisar de banco de dados nenhum.
 *
 * Só as duas linhas TERMINAIS de cada checagem importam pro feed de
 * atividade — as linhas de diagnóstico ([bans], [perfil], [horas],
 * [shared], "ERRO API: ...") são ruído aqui: mesmo quando uma chamada à
 * Steam falha, o plugin ainda fecha com "APROVADO" (fail-open, ver
 * server/README.md), então essas duas linhas por si só já dizem tudo que
 * o site precisa mostrar:
 *
 *   Bloqueado <nick><userid><authid><time>  - <motivo>
 *   APROVADO: <nick><userid><authid><time> passou em todas as checagens.
 *   SAIU: <nick><userid><authid><time> ficou <n> min.
 *
 * Formato exato das strings vem de `RejectClient`/`FinishCheck` no `.sp`
 * (`LogMessage("Bloqueado %L - %s", ...)` / `LogMessage("APROVADO: %L
 * passou em todas as checagens.", ...)`), onde `%L` é o formato padrão do
 * SourceMod: `nick<userid><authid><time-conectado-ou-vazio>`.
 */

export type SteamFilterLogKind = "join" | "blocked" | "leave";

export interface SteamFilterLogEvent {
  /** ISO local, sem fuso — o log do SourceMod não informa timezone. */
  at: string;
  kind: SteamFilterLogKind;
  actor: string;
  /**
   * Contexto do evento: o motivo, quando "blocked"; quanto tempo a pessoa
   * ficou, quando "leave". Ausente em "join", onde não há o que dizer além
   * de que entrou.
   */
  detail?: string;
}

const LOG_LINE_PATTERN =
  /^L (\d{2})\/(\d{2})\/(\d{4}) - (\d{2}):(\d{2}):(\d{2}): \[lendas_steamfilter\.smx\] (.+)$/;

const BLOCKED_PATTERN = /^Bloqueado (.+?)<\d+><[^>]*><[^>]*> - (.+)$/;
const APPROVED_PATTERN = /^APROVADO: (.+?)<\d+><[^>]*><[^>]*> passou em todas as checagens\.$/;
/**
 * O plugin só escreve esta linha pra quem foi APROVADO e entrou de fato
 * (ver `OnClientDisconnect` no `.sp`). Quem foi barrado também desconecta,
 * mas não gera "SAIU" — senão o feed mostraria "Bloqueado" e logo abaixo
 * "Saiu" pro mesmo sujeito, contando duas vezes o que aconteceu uma.
 */
const LEFT_PATTERN = /^SAIU: (.+?)<\d+><[^>]*><[^>]*> ficou (\d+) min\.$/;

/** `null` = linha não é um veredito terminal do steamfilter (ruído, linha em branco, outro plugin). */
export function parseSteamFilterLogLine(rawLine: string): SteamFilterLogEvent | null {
  const line = rawLine.trim();
  const header = LOG_LINE_PATTERN.exec(line);
  if (!header) return null;

  const [, month, day, year, hour, minute, second, rest] = header as unknown as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const at = `${year}-${month}-${day}T${hour}:${minute}:${second}`;

  const blocked = BLOCKED_PATTERN.exec(rest);
  if (blocked) {
    return { at, kind: "blocked", actor: blocked[1]!.trim(), detail: blocked[2]!.trim() };
  }

  const approved = APPROVED_PATTERN.exec(rest);
  if (approved) {
    return { at, kind: "join", actor: approved[1]!.trim() };
  }

  const left = LEFT_PATTERN.exec(rest);
  if (left) {
    return { at, kind: "leave", actor: left[1]!.trim(), detail: formatSessao(Number(left[2])) };
  }

  return null;
}

/**
 * Duração da sessão em texto curto. Abaixo de um minuto o plugin manda 0, e
 * "0 min" leria como bug — "menos de 1 min" diz a mesma coisa sem parecer
 * defeito. Acima de uma hora, "2h14" cabe melhor que "134 min".
 */
function formatSessao(minutos: number): string {
  if (minutos < 1) return "menos de 1 min";
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, "0")}`;
}

/** Nome de arquivo esperado: "L20260825.log" — um por dia, gerado pelo próprio SourceMod. */
const DAILY_LOG_PATTERN = /^L\d{8}\.log$/;

export function isDailyLogFilename(name: string): boolean {
  return DAILY_LOG_PATTERN.test(name);
}
