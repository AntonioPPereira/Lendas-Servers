/**
 * Arte real do Counter-Strike, extraída dos arquivos do jogo — brasões de
 * time e ícones de mapa. Coloridos, vão como <img> normal.
 */

/** Resolve contra a base do Vite para não quebrar em deploy com subcaminho. */
function asset(path: string): string {
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
 * outro mapa.
 */
const MAP_BACKGROUNDS = new Set(["dust2"]);

export function mapBackground(map: string): string | null {
  const key = normalizeMapKey(map);
  return MAP_BACKGROUNDS.has(key) ? asset(`/cs/maps/bg/${key}.avif`) : null;
}

export const TEAM_CREST = {
  CT: asset("/cs/teams/ct_logo.svg"),
  T: asset("/cs/teams/t_logo.svg"),
} as const;

/**
 * Retratos dos agentes (SAS e Phoenix), fornecidos pelo usuário. São bustos
 * de 512×384 com fundo transparente: funcionam grandes, ladeando o placar,
 * e não em miniatura — para tamanho pequeno o brasão continua sendo o certo.
 */
export const TEAM_AGENT = {
  CT: asset("/cs/agents/ct.png"),
  T: asset("/cs/agents/t.png"),
} as const;
