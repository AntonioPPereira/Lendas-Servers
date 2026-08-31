/**
 * Mapas que a rede roda.
 *
 * Saiu de `data/seed.ts` porque as telas de filtro o usavam e acabavam
 * arrastando a lista de nicknames inventados junto pro pacote. Hoje só o
 * gerador de dados falsos consome isto: o filtro de Partidas pergunta ao
 * backend (`GET /api/matches/maps`) quais mapas EXISTEM no acervo, em vez
 * de oferecer uma lista fixa que pode não bater com o que foi jogado.
 *
 * Continua aqui, e não de volta no seed, porque são nomes reais de mapa —
 * não dado inventado — e misturar as duas coisas num arquivo só foi
 * exatamente o problema que essa separação resolveu.
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
