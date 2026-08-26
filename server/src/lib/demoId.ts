import path from "node:path";

/**
 * Todo o modelo de segurança do download mora aqui.
 *
 * Descoberta em 2026-08-25: o SFTP não tem uma raiz única de demos — cada
 * servidor de jogo tem sua própria pasta na raiz do SFTP, nomeada
 * "IP_PORTA" (ex: "104.234.65.244_27800"), e o `cstrike/demos/YYYY-MM` mora
 * dentro dela. Como há mais de um servidor, o ID precisa saber de qual
 * raiz veio pra resolver o caminho — por isso o prefixo de porta
 * (`27800-20260801-1646-de_dust2`). A porta funciona como chave porque as
 * portas dos servidores nunca colidem entre si (ao contrário do IP, que
 * seria mais longo e não traz nada que a porta já não diferencie aqui).
 *
 * O ID continua NÃO sendo um caminho — é validado por um regex fechado, e a
 * partir dele o backend RECONSTRÓI o caminho contra a lista de raízes
 * conhecidas (vinda da config, nunca do cliente). Isso exclui "..", "/" e
 * qualquer extensão diferente de ".dem" por construção, não por filtro.
 *
 * Caminhos SFTP são sempre POSIX, independente do SO onde este backend roda
 * — por isso `path.posix`, nunca o `path` "cru" (que vira win32 no Windows).
 */

const DEMO_ID_PATTERN = /^(\d{2,5})-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})-([a-zA-Z0-9_]+)$/;

export interface ParsedDemoId {
  id: string;
  /** Nome do arquivo sem o prefixo de porta: "20260801-1646-de_dust2.dem". */
  filename: string;
  map: string;
  /** "2026-08-01" */
  date: string;
  /** "16:46" */
  time: string;
  /** "2026-08" — nome exato da pasta onde o arquivo mora, dentro da raiz do servidor. */
  yearMonth: string;
  /** ISO local, sem fuso — o nome do arquivo não informa timezone. */
  recordedAtLocal: string;
  /** Porta do servidor de origem — é o que liga o ID à raiz certa. */
  port: string;
}

export function parseDemoId(id: string): ParsedDemoId | null {
  const match = DEMO_ID_PATTERN.exec(id);
  if (!match) return null;

  const [, port, year, month, day, hour, minute, map] = match as unknown as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];

  const monthNum = Number(month);
  const dayNum = Number(day);
  const hourNum = Number(hour);
  const minuteNum = Number(minute);
  if (monthNum < 1 || monthNum > 12) return null;
  if (dayNum < 1 || dayNum > 31) return null;
  if (hourNum > 23 || minuteNum > 59) return null;

  const bareName = `${year}${month}${day}-${hour}${minute}-${map}`;

  return {
    id,
    filename: `${bareName}.dem`,
    map,
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
    yearMonth: `${year}-${month}`,
    recordedAtLocal: `${year}-${month}-${day}T${hour}:${minute}:00`,
    port,
  };
}

/** Monta o ID público a partir do que a listagem SFTP realmente encontrou. */
export function buildDemoId(port: string, bareFilename: string): string {
  return `${port}-${demoIdFromFilename(bareFilename)}`;
}

/** Uma raiz de demos conhecida — vem só da config, nunca do cliente. */
export interface ServerRoot {
  /** Porta do servidor, extraída do nome da pasta (ex: "27800"). */
  port: string;
  /** IP do servidor, só para exibição (ex: "104.234.65.244"). */
  ip: string;
  /** Caminho absoluto até a pasta "demos" deste servidor. */
  root: string;
}

/**
 * Constrói o caminho SFTP real a partir de um ID já validado: acha a raiz
 * cuja porta bate com a do ID, e confere de novo (defesa em profundidade)
 * que o resultado não escapou dela — mesmo sabendo que o regex acima já
 * torna isso impossível.
 */
export function resolveDemoPath(
  roots: readonly ServerRoot[],
  id: string,
): { path: string; parsed: ParsedDemoId; root: ServerRoot } | null {
  const parsed = parseDemoId(id);
  if (!parsed) return null;

  const match = roots.find((r) => r.port === parsed.port);
  if (!match) return null;

  const normalizedRoot = path.posix.normalize(match.root);
  const fullPath = path.posix.normalize(
    path.posix.join(normalizedRoot, parsed.yearMonth, parsed.filename),
  );

  const rootWithSlash = normalizedRoot.endsWith("/") ? normalizedRoot : normalizedRoot + "/";
  if (!fullPath.startsWith(rootWithSlash)) return null;

  return { path: fullPath, parsed, root: match };
}

/** Nome de pasta esperado dentro da raiz: "2026-08", "2025-12", etc. */
const YEAR_MONTH_DIR_PATTERN = /^\d{4}-\d{2}$/;

export function isYearMonthDir(name: string): boolean {
  return YEAR_MONTH_DIR_PATTERN.test(name);
}

/** Nome de arquivo esperado dentro de uma pasta YYYY-MM. */
const DEMO_FILENAME_PATTERN = /^\d{8}-\d{4}-[a-zA-Z0-9_]+\.dem$/;

export function isDemoFilename(name: string): boolean {
  return DEMO_FILENAME_PATTERN.test(name);
}

/** Remove a extensão ".dem" de um nome de arquivo já validado por `isDemoFilename`. */
export function demoIdFromFilename(filename: string): string {
  return filename.slice(0, -".dem".length);
}

/**
 * Nome de pasta esperado na raiz do SFTP: "104.234.65.244_27800" — um
 * servidor de jogo por pasta. A porta extraída daqui é a mesma que vira
 * prefixo do ID.
 */
const SERVER_DIR_PATTERN = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})_(\d{2,5})$/;

export function parseServerDirName(name: string): { ip: string; port: string } | null {
  const match = SERVER_DIR_PATTERN.exec(name);
  if (!match) return null;
  return { ip: match[1]!, port: match[2]! };
}
