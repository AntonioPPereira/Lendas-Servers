/**
 * Hash estável de 32 bits (FNV-1a), usado para semear o emblema gerado de
 * cada jogador a partir do nickname ou do SteamID.
 *
 * Mora em `lib/` e não em `data/seed.ts` de propósito: o `PlayerAvatar` usa
 * isto e aparece em quase toda tela, então importá-lo dali arrastava junto,
 * pro pacote de produção, a lista de nicknames inventados que vive no mesmo
 * arquivo. Utilitário e dado de mock não podem dividir módulo.
 */
export function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
