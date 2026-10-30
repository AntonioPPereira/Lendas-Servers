import * as cheerio from "cheerio";

/**
 * Todo o parsing de HTML do HLstatsX fica isolado aqui — funções puras,
 * `html in, dados tipados out`. Nada de seletor espalhado pelo resto do
 * código; se o template do HLstatsX mudar, o conserto é neste arquivo só.
 *
 * HLstatsX:CE 1.7.0 não tem API estruturada (confirmado na auditoria) — só
 * HTML server-rendered. A estrutura abaixo foi lida direto do HTML real da
 * instância em produção (`mixlendas-rank.clanservers.com.br`) em 2026-08-25.
 */

export interface HLStatsServerRow {
  /** ID interno do HLstatsX pro servidor (do gráfico show_graph.php), quando encontrado. */
  hlstatsServerId: string | null;
  name: string;
  host: string;
  port: number;
  map: string;
  players: number;
  maxPlayers: number;
  /** Segundos no mapa atual — NÃO é uptime do processo, é só o "Played" que a fonte dá. */
  mapPlaytimeSeconds: number | null;
}

export interface HLStatsRankingRow {
  /** ID numérico interno do HLstatsX. NÃO é SteamID nem SteamID64 — a fonte não expõe isso de forma confiável (ver HLStatsService). */
  hlstatsPlayerId: string;
  rank: number;
  nickname: string;
  countryCode: string | null;
  countryName: string | null;
  /** "Skill" / rating interno do HLstatsX. */
  skill: number;
  kills: number;
  deaths: number;
  kd: number | null;
  headshots: number;
  hsRate: number | null;
  /** Percentual 0–100. */
  accuracy: number | null;
  /** Minutos conectados, total histórico rastreado pelo HLstatsX. */
  connectionTimeMinutes: number | null;
}

function parseIntLoose(text: string | undefined | null): number | null {
  if (!text) return null;
  const cleaned = text.replace(/,/g, "").trim();
  if (!/^-?\d+$/.test(cleaned)) return null;
  return Number.parseInt(cleaned, 10);
}

function parseFloatLoose(text: string | undefined | null): number | null {
  if (!text) return null;
  const cleaned = text.replace(/,/g, "").replace(/%/g, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number.parseFloat(cleaned);
}

/** "3d 00:10:03h" ou "23:08:45h" -> minutos totais. */
function parseConnectionTime(text: string | undefined | null): number | null {
  if (!text) return null;
  const match = /^\s*(?:(\d+)d\s*)?(\d+):(\d{2}):(\d{2})h?\s*$/.exec(text);
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match;
  return (
    Number(days ?? 0) * 24 * 60 +
    Number(hours) * 60 +
    Number(minutes) +
    Math.round(Number(seconds) / 60)
  );
}

/** "02:10:02" (HH:MM:SS do mapa atual) -> segundos totais. */
function parseMapPlaytime(text: string | undefined | null): number | null {
  if (!text) return null;
  const match = /^\s*(\d+):(\d{2}):(\d{2})\s*$/.exec(text);
  if (!match) return null;
  const [, hours, minutes, seconds] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

/** "104.234.65.243:27490 (Join)" -> host/port. */
function parseHostPort(text: string): { host: string; port: number } | null {
  const match = /^\s*([\d.]+):(\d+)/.exec(text);
  if (!match) return null;
  return { host: match[1]!, port: Number(match[2]) };
}

/** "1/13" -> {players, maxPlayers}. */
function parsePlayerCount(text: string): { players: number; maxPlayers: number } | null {
  const match = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(text);
  if (!match) return null;
  return { players: Number(match[1]), maxPlayers: Number(match[2]) };
}

/**
 * Página inicial do HLstatsX: tabela `#accordion` com uma linha por servidor
 * tracked. Cada linha tem 8 `td.game-table-cell`: nome, endereço, mapa,
 * tempo no mapa, jogadores, kills, headshots, hs:k (as duas últimas não são
 * usadas aqui — pertencem ao histórico do servidor, não ao status atual).
 */
export function parseServersHtml(html: string): HLStatsServerRow[] {
  const $ = cheerio.load(html);
  const rows: HLStatsServerRow[] = [];

  $("table#accordion tr.game-table-row.toggler").each((_, el) => {
    const cells = $(el).find("> td.game-table-cell");
    if (cells.length < 5) return;

    const name = cells.eq(0).find("b").first().text().trim();
    const hostPort = parseHostPort(cells.eq(1).text());
    const map = cells.eq(2).text().trim();
    const playtime = parseMapPlaytime(cells.eq(3).text());
    const count = parsePlayerCount(cells.eq(4).text());
    if (!name || !hostPort || !count) return;

    // O server_id do HLstatsX mora na linha "opener" seguinte, dentro do
    // link do gráfico (show_graph.php?...&server_id=N&...) — é a única
    // pista disponível pra esse identificador interno.
    const graphSrc = $(el).next("tr").find('img[src*="server_id="]').attr("src") ?? "";
    const serverIdMatch = /server_id=(\d+)/.exec(graphSrc);

    rows.push({
      hlstatsServerId: serverIdMatch ? serverIdMatch[1]! : null,
      name,
      host: hostPort.host,
      port: hostPort.port,
      map,
      players: count.players,
      maxPlayers: count.maxPlayers,
      mapPlaytimeSeconds: playtime,
    });
  });

  return rows;
}

/**
 * `mode=players&game=css`: uma tabela `data-table` com um link
 * `mode=playerinfo&player=ID` por jogador. Selecionamos pelo link (não pela
 * posição da tabela) porque é o ponto mais estável do template.
 */
export function parseRankingHtml(html: string): HLStatsRankingRow[] {
  const $ = cheerio.load(html);
  const rows: HLStatsRankingRow[] = [];

  $('table.data-table a[href*="mode=playerinfo"][href*="player="]').each((_, anchor) => {
    const href = $(anchor).attr("href") ?? "";
    const idMatch = /player=(\d+)/.exec(href);
    if (!idMatch) return;

    const tr = $(anchor).closest("tr");
    const tds = tr.find("> td");
    if (tds.length < 12) return; // não é a linha do ranking (ex: link solto em outro lugar da página)

    const flag = tds.eq(1).find("img").first();
    const countryName = flag.attr("title")?.trim() || flag.attr("alt")?.trim() || null;
    const flagSrc = flag.attr("src") ?? "";
    const countryCodeMatch = /flags\/([a-z0-9]+)\.gif/i.exec(flagSrc);

    // A célula de skill tem um <img> de tooltip encaixado; o número real é
    // o texto que sobra depois de remover os elementos filhos.
    const skillCell = tds.eq(3).clone();
    skillCell.children().remove();
    const skill = parseIntLoose(skillCell.text());

    const kills = parseIntLoose(tds.eq(6).text());
    const deaths = parseIntLoose(tds.eq(7).text());
    const nickname = tds.eq(1).find("a").first().text().trim();

    if (!nickname || skill === null || kills === null || deaths === null) return;

    rows.push({
      hlstatsPlayerId: idMatch[1]!,
      rank: parseIntLoose(tds.eq(0).text()) ?? rows.length + 1,
      nickname,
      countryCode: countryCodeMatch ? countryCodeMatch[1]!.toLowerCase() : null,
      countryName,
      skill,
      kills,
      deaths,
      kd: parseFloatLoose(tds.eq(8).text()),
      headshots: parseIntLoose(tds.eq(9).text()) ?? 0,
      hsRate: parseFloatLoose(tds.eq(10).text()),
      accuracy: parseFloatLoose(tds.eq(11).text()),
      connectionTimeMinutes: parseConnectionTime(tds.eq(5).text()),
    });
  });

  return rows;
}

/** Maior número de página encontrado no rodapé "Page: 1 2 3 4 5 6". */
export function parseRankingPageCount(html: string): number {
  const $ = cheerio.load(html);
  let max = 1;
  $('a[href*="mode=players"][href*="page="]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const match = /page=(\d+)/.exec(href);
    if (match) max = Math.max(max, Number(match[1]));
  });
  return max;
}

/* ------------------------------------------------------------------ *
 * Estatísticas agregadas do servidor (mode=weapons / actions / maps).
 *
 * São as três páginas do HLstatsX que respondem de forma confiável e
 * trazem número somado de TODO o histórico. Diferente de `mode=playerinfo`
 * (que trava nesta instalação — ver HLStatsService), aqui não há recorte
 * por jogador: é o total do servidor. Por isso a tela de Estatísticas
 * mostra "o servidor inteiro", nunca "quem fez o quê".
 * ------------------------------------------------------------------ */

export interface HLStatsWeaponRow {
  /** Chave interna do HLstatsX: "ak47", "deagle", "knife". */
  code: string;
  /** Nome de exibição que o próprio HLstatsX usa ("Kalashnikov AK-47"). */
  name: string;
  kills: number;
  headshots: number;
  /** Fração 0..1 dos headshots sobre os kills DESTA arma. */
  headshotRatio: number | null;
}

export interface HLStatsActionRow {
  /** Chave interna ("headshot", "Plant_Bomb"). */
  code: string;
  name: string;
  count: number;
}

export interface HLStatsMapRow {
  map: string;
  kills: number;
  headshots: number;
  headshotRatio: number | null;
}

export function parseWeaponsHtml(html: string): HLStatsWeaponRow[] {
  const $ = cheerio.load(html);
  const rows: HLStatsWeaponRow[] = [];

  $('a[href*="mode=weaponinfo"][href*="weapon="]').each((_, anchor) => {
    const code = /weapon=([^&]+)/.exec($(anchor).attr("href") ?? "")?.[1];
    if (!code) return;

    const tds = $(anchor).closest("tr").find("> td");
    if (tds.length < 10) return;

    // O nome legível não é texto: vive no alt do ícone da arma. Sem ele,
    // cai no código interno em vez de ficar sem rótulo.
    const name = tds.eq(1).find("img").attr("alt")?.trim() || code;
    const kills = parseIntLoose(tds.eq(3).text());
    if (kills === null) return;

    rows.push({
      code,
      name,
      kills,
      headshots: parseIntLoose(tds.eq(6).text()) ?? 0,
      headshotRatio: parseFloatLoose(tds.eq(9).text()),
    });
  });

  return rows;
}

export function parseActionsHtml(html: string): HLStatsActionRow[] {
  const $ = cheerio.load(html);
  const rows: HLStatsActionRow[] = [];

  $('a[href*="mode=actioninfo"][href*="action="]').each((_, anchor) => {
    const code = /action=([^&]+)/.exec($(anchor).attr("href") ?? "")?.[1];
    if (!code) return;

    const tds = $(anchor).closest("tr").find("> td");
    if (tds.length < 3) return;

    // A célula vem como "28,263 times": o sufixo é rótulo do HLstatsX, não
    // parte do número, e `parseIntLoose` (com razão) recusa a string
    // inteira. Por isso o número é recortado antes.
    const count = parseIntLoose(/^[\d,]+/.exec(tds.eq(2).text().trim())?.[0]);
    if (count === null) return;

    rows.push({ code, name: tds.eq(1).text().trim() || code, count });
  });

  return rows;
}

export function parseMapsHtml(html: string): HLStatsMapRow[] {
  const $ = cheerio.load(html);
  const rows: HLStatsMapRow[] = [];

  $('a[href*="mode=mapinfo"][href*="map="]').each((_, anchor) => {
    const map = /map=([^&]+)/.exec($(anchor).attr("href") ?? "")?.[1];
    if (!map) return;

    const tds = $(anchor).closest("tr").find("> td");
    if (tds.length < 9) return;

    const kills = parseIntLoose(tds.eq(2).text());
    if (kills === null) return;

    rows.push({
      map,
      kills,
      headshots: parseIntLoose(tds.eq(5).text()) ?? 0,
      headshotRatio: parseFloatLoose(tds.eq(8).text()),
    });
  });

  return rows;
}
