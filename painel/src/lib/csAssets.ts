/**
 * Arte real do Counter-Strike, extraída dos arquivos do jogo — brasões de
 * time e ícones de mapa. Coloridos, vão como <img> normal.
 */

/** Resolve contra a base do Vite para não quebrar em deploy com subcaminho. */
export function asset(path: string): string {
  return import.meta.env.BASE_URL.replace(/\/$/, "") + path;
}

/**
 * Mapas com ícone oficial disponível. Boa parte da rotação clássica do Source
 * (chateau, prodigy, port, piranesi, tides, season, havana, compound) nunca
 * ganhou ícone no CS:GO — esses caem no plate genérico do MapIcon.
 */
const MAPS_WITH_ICON = new Set([
  "de_dust2",
  "de_dust",
  "de_inferno",
  "de_nuke",
  "de_train",
  "de_aztec",
  "de_cbble",
  "cs_office",
  "cs_italy",
  "cs_assault",
  "cs_militia",
]);

export function mapIcon(map: string): string | null {
  return MAPS_WITH_ICON.has(map) ? asset(`/cs/maps/${map}.svg`) : null;
}

const KNOWN_PREFIXES = new Set(["de", "cs", "css", "aim", "awp", "fy", "surf", "gg", "ka"]);
const VARIANT_TOKENS = new Set([
  "csgo",
  "cs2",
  "css",
  "source",
  "new",
  "old",
  "night",
  "remake",
  "hd",
  "final",
  "fixed",
  "fix",
]);

/**
 * A rotação real do servidor (cstrike/mapcycle.txt) tem várias versões
 * portadas do CS:GO do mesmo mapa lado a lado — "de_dust2", "de_dust2_csgo_
 * new_v2" — e tratar cada uma como um mapa diferente perderia essa relação.
 * Isso normaliza pro nome-base, só pra decidir qual arte de fundo usar.
 */
export function normalizeMapKey(map: string): string {
  const tokens = map.toLowerCase().split("_").filter(Boolean);
  if (tokens.length > 1 && KNOWN_PREFIXES.has(tokens[0]!)) tokens.shift();
  const cleaned = tokens.filter((t) => !VARIANT_TOKENS.has(t) && !/^v?\d+$/.test(t));
  return (cleaned.length ? cleaned : tokens).join("_");
}

/**
 * Fotos reais de fundo pra Partida ao vivo, uma por mapa-base. Só existem
 * pros mapas que a comunidade forneceu — os demais caem no tratamento
 * tipográfico (nome gigante e pálido), nunca numa imagem genérica ou de
 * outro mapa. Guarda o nome do arquivo (com a extensão real de cada
 * envio) em vez de assumir um formato único.
 */
const MAP_BACKGROUNDS: Record<string, string> = {
  dust2: "dust2.avif",
  mirage: "mirage.jpg",
  cache: "cache.jpg",
  inferno: "inferno.avif",
  train: "train.jpg",
  nuke: "nuke.jpg",
  tuscan: "tuscan.jpg",
  season: "season.jpg",
  overpass: "overpass.jpg",
  aztec: "aztec.jpg",
  cbble: "cbble.jpg",
  assault: "assault.jpg",
};

export function mapBackground(map: string): string | null {
  const key = normalizeMapKey(map);
  const filename = MAP_BACKGROUNDS[key];
  return filename ? asset(`/cs/maps/bg/${filename}`) : null;
}

export const TEAM_CREST = {
  CT: asset("/cs/teams/ct_logo.svg"),
  T: asset("/cs/teams/t_logo.svg"),
} as const;

/** C4 real do jogo (arte branca monocromática) — marca a rodada que a bomba decidiu. */
export const BOMB_ICON = asset("/cs/weapons/c4.svg");

/**
 * Retratos dos agentes (SAS e Phoenix), fornecidos pelo usuário. São bustos
 * de 512×384 com fundo transparente: funcionam grandes, ladeando o placar,
 * e não em miniatura — para tamanho pequeno o brasão continua sendo o certo.
 */
export const TEAM_AGENT = {
  CT: asset("/cs/agents/ct.png"),
  T: asset("/cs/agents/t.png"),
} as const;

/**
 * Um operador CT diferente pra cada posição do pódio (1º/2º/3º), fornecidos
 * pelo usuário — decoração de rank, não retrato do jogador: o mesmo
 * personagem aparece pra quem quer que esteja naquela posição no momento.
 */
export const PODIUM_AGENT: Record<1 | 2 | 3, string> = {
  1: asset("/cs/agents/podium/rank-1.png"),
  2: asset("/cs/agents/podium/rank-2.png"),
  3: asset("/cs/agents/podium/rank-3.png"),
};
