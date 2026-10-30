/**
 * Deterministic mock generation.
 *
 * Everything downstream is derived from a fixed seed so the prototype looks
 * identical on every reload — reviewers compare screenshots, not dice rolls.
 */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed: number) {
  const rand = mulberry32(seed);
  return {
    next: rand,
    int: (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min,
    float: (min: number, max: number) => rand() * (max - min) + min,
    pick: <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!,
    chance: (p: number) => rand() < p,
    shuffle: <T,>(items: readonly T[]): T[] => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rand() * (i + 1));
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      }
      return copy;
    },
  };
}

export type Rng = ReturnType<typeof makeRng>;

// `hash` e a lista de mapas saíram daqui para `lib/`: são utilitário e dado
// real, e ficar neste arquivo fazia o pacote de produção carregar junto os
// nicknames inventados abaixo.
export { hash } from "@/lib/hash";
export { MAPS, UNIQUE_MAPS } from "@/lib/csMaps";

export const NICKNAMES = [
  "n0ck", "Bardo", "zLk", "DEMOLIDOR", "sKz", "vrs4", "Pantera", "Tulipa",
  "mFerreira", "cX-", "Rakion", "trov4o", "Silencio", "Krow", "buLLet",
  "Ravena", "Gaucho", "d1sturb", "Coringa", "M4rreta", "PhantomBR", "zeh",
  "Lobisomem", "Kaiser", "0verkill", "shellz", "Tigrao", "napalm", "Vulto",
  "Estilhaco", "kR4t0s", "Meia-Noite", "Bruxo", "Cascavel", "Falcao",
  "ninjaLoko", "Tempestade", "Rasteira", "gh0st", "Chumbinho", "Rebite",
  "Sentinela", "Andarilho", "Jacare", "matad0r", "Perereca", "AWPzin",
  "Fumaca", "Nitro", "Boiadeiro", "Espinho", "Cobra", "Tarantula", "Vespa",
  "hexed", "Curupira", "Tanque", "Zumbi", "Relampago", "Mandioca",
  "Sarrada", "Pipoco", "Xerife", "Bagre", "Escorpiao", "Furacao", "Granada",
  "Piranha", "Ferrolho", "Lampiao", "Cangaco", "Pinguim", "Mosquito",
  "Ratazana", "Chicote", "Bala-Perdida", "Corvo", "Onca", "Anaconda",
  "Bandeirante", "Trovejante", "Sabotador", "Nevoeiro", "Vidente",
  "Marreco", "Carranca", "Sucuri", "Bacurau", "Jequiti", "Farofa",
] as const;

export const ADMINS = [
  "Toton", "Ravena", "kR4t0s", "Sentinela", "Vulcano", "Mother", "adm_Bruno",
  "CONSOLE",
] as const;

export const COUNTRIES = ["BR", "BR", "BR", "BR", "AR", "PT", "CL", "UY", "US"] as const;

/** The CS:S competitive rotation, weighted toward what actually gets played. */


export const WEAPONS = [
  "ak47", "m4a1", "awp", "deagle", "mp5navy", "p90", "famas", "galil",
  "scout", "xm1014", "m3", "aug", "sg552", "ump45", "mac10", "tmp",
  "glock18", "usp", "fiveseven", "p228", "elite", "m249", "knife",
  "hegrenade", "g3sg1", "sg550",
] as const;

export const RIFLES = ["ak47", "m4a1", "awp", "famas", "galil", "aug", "sg552", "scout"] as const;

export const BAN_REASONS = [
  "Aimbot detectado (SMAC)",
  "Wallhack confirmado por demo",
  "Bunny hop script",
  "No-recoil / spread script",
  "Trigger bot",
  "Team kill intencional recorrente",
  "Ban evasion (conta alternativa)",
  "Divulgação de outro servidor",
  "Toxicidade extrema no chat",
  "Spam de microfone",
  "Exploit de mapa",
  "Bloqueio de spawn (griefing)",
] as const;

export const BAN_DURATIONS = [
  { label: "2 horas", hours: 2 },
  { label: "1 dia", hours: 24 },
  { label: "3 dias", hours: 72 },
  { label: "7 dias", hours: 168 },
  { label: "30 dias", hours: 720 },
  { label: "Permanente", hours: 0 },
] as const;

/**
 * Anchored once per session: every generated timestamp is relative to it, so
 * "ha 3 dias" stays honest without the dataset shifting mid-render.
 */
export const NOW = new Date();

export function isoAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

export function isoAhead(minutes: number): string {
  return new Date(NOW.getTime() + minutes * 60_000).toISOString();
}

export function steamIds(rng: Rng, index: number) {
  const account = 40_000_000 + index * 7919 + rng.int(0, 6000);
  const universe = account % 2;
  const id32 = Math.floor(account / 2);
  return {
    steamId: `STEAM_0:${universe}:${id32}`,
    steamId64: String(76561197960265728n + BigInt(account)),
  };
}
