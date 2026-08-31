const numberFmt = new Intl.NumberFormat("pt-BR");
const compactFmt = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const dateParts = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const relativeFmt = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

export const formatNumber = (value: number) => numberFmt.format(Math.round(value));
export const formatCompact = (value: number) => compactFmt.format(value);

export const formatDecimal = (value: number, digits = 2) =>
  value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const formatPercent = (value: number, digits = 0) => `${formatDecimal(value, digits)}%`;

/** Round clock: 1:42 */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

/** Match length: 42:18 under an hour, 1h 24m above. */
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}:${String(safe % 60).padStart(2, "0")}`;
}

/** Career time, stored in minutes. */
export function formatPlaytime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  if (hours >= 1000) return `${formatDecimal(hours / 1000, 1)}k h`;
  if (hours >= 1) return `${formatNumber(hours)}h`;
  return `${Math.round(minutes)}min`;
}

export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${formatDecimal(value, value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function formatDate(iso: string): string {
  const parts = dateParts.formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return get("day") + " " + get("month").replace(".", "") + " " + get("year");
}
export const formatTime = (iso: string) => timeFmt.format(new Date(iso));
export const formatDateTime = (iso: string) => `${formatDate(iso)} · ${formatTime(iso)}`;

const RELATIVE_STEPS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/**
 * Tempo relativo de algo que JÁ ACONTECEU.
 *
 * Um evento no futuro é sempre desencontro de relógio, não previsão: os
 * logs do servidor de jogo não trazem fuso, então são lidos como hora
 * local, e alguns minutos de diferença entre o relógio do servidor e o de
 * quem olha faziam a Atividade anunciar "em 2 minutos" pra alguém que já
 * tinha entrado. Um feed de acontecimentos não fala no futuro — o desvio
 * vira "agora", que é a leitura honesta.
 *
 * Só o desvio pequeno é absorvido. Se a diferença passar de uma hora, o
 * texto volta a mostrar o valor cru: aí não é drift, é relógio errado de
 * verdade, e esconder isso atrapalharia quem for investigar.
 */
const DRIFT_TOLERAVEL_MS = 3_600_000;

export function timeAgo(iso: string, from: Date = new Date()): string {
  const delta = new Date(iso).getTime() - from.getTime();
  if (delta > 0 && delta < DRIFT_TOLERAVEL_MS) return "agora";
  for (const [unit, ms] of RELATIVE_STEPS) {
    if (Math.abs(delta) >= ms) return relativeFmt.format(Math.round(delta / ms), unit);
  }
  return "agora";
}

export const ratio = (a: number, b: number) => a / Math.max(1, b);

/** de_dust2 -> DUST2, cs_office -> OFFICE */
export function mapLabel(map: string): string {
  return map.replace(/^(de|cs|aim|awp|fy|surf|gg)_/, "").replace(/_/g, " ").toUpperCase();
}

export function mapPrefix(map: string): string {
  const match = /^([a-z]+)_/.exec(map);
  return (match?.[1] ?? "map").toUpperCase();
}

const periodFmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

/** "2026-08" -> "agosto de 2026" */
export function formatPeriod(period: string): string {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  return periodFmt.format(new Date(year, month - 1, 1));
}

export function initials(nickname: string): string {
  const clean = nickname.replace(/[^\p{L}\p{N}]/gu, "");
  return (clean.slice(0, 2) || "??").toUpperCase();
}

export function steamProfileUrl(steamId64: string): string {
  return `https://steamcommunity.com/profiles/${steamId64}`;
}

/**
 * Nome curto de arma, do jeito que jogador fala.
 *
 * O HLstatsX devolve o nome comercial completo ("Arctic Warfare Magnum
 * (Police)", "H&K USP .45 Tactical"), que não cabe num rótulo de gráfico e
 * é lido por ninguém — todo mundo chama de AWP e USP. A chave é o código
 * interno do HLstatsX, que é estável; arma fora da lista cai no nome
 * original, então nada some por não estar mapeado.
 */
const WEAPON_LABELS: Record<string, string> = {
  deagle: "Deagle",
  ak47: "AK-47",
  awp: "AWP",
  m4a1: "M4A1",
  usp: "USP",
  glock: "Glock",
  famas: "Famas",
  galil: "Galil",
  p90: "P90",
  p228: "P228",
  scout: "Scout",
  knife: "Faca",
  hegrenade: "Granada HE",
  elite: "Elites",
  mp5navy: "MP5",
  tmp: "TMP",
  mac10: "MAC-10",
  ump45: "UMP-45",
  m3: "M3",
  xm1014: "XM1014",
  fiveseven: "Five-Seven",
  sg550: "SG550",
  sg552: "SG552",
  aug: "AUG",
  m249: "Para M249",
  g3sg1: "G3SG1",
  flashbang: "Flashbang",
  smokegrenade: "Smoke",
};

export function weaponLabel(code: string, fallback: string): string {
  return WEAPON_LABELS[code] ?? fallback;
}
