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
