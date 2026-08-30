/**
 * Mapas que a rede roda, usados para montar os filtros de Demos e Partidas.
 *
 * São nomes reais de mapa do servidor — não dado de mock — e por isso vivem
 * em `lib/`, longe de `data/seed.ts`. Ficavam lá junto dos nicknames
 * inventados, o que fazia toda tela com filtro de mapa embarcar a lista de
 * jogadores falsos.
 *
 * Limitação assumida: é uma lista fixa, não o que de fato tem demo gravada.
 * O backend não expõe "mapas com demo" hoje; escolher um sem demo devolve
 * lista vazia, que é honesto, mas não ideal.
 */
export const MAPS = [
  "de_dust2",
  "de_mirage",
  "de_inferno",
  "de_nuke",
  "de_train",
  "de_cache",
  "de_tuscan",
  "de_season",
  "de_overpass",
  "de_aztec",
  "de_cbble",
  "cs_assault",
  "cs_office",
  "cs_italy",
] as const;

export const UNIQUE_MAPS = [...new Set<string>(MAPS)];
