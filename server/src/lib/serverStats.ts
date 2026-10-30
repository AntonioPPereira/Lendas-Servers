import type {
  HLStatsActionRow,
  HLStatsMapRow,
  HLStatsWeaponRow,
  ServerStatsRaw,
} from "../services/HLStatsService.js";

/**
 * Monta o retrato agregado do servidor a partir do que o HLstatsX publica.
 *
 * Regra que vale pra tudo aqui: **nada é calculado por estimativa**. Se uma
 * ação não existe na instalação (o HLstatsX só lista o que já aconteceu ao
 * menos uma vez), o campo vem `null` e o painel omite o bloco — em vez de
 * mostrar zero, que o leitor interpretaria como "ninguém nunca fez isso".
 */

export interface WeaponStat {
  code: string;
  name: string;
  kills: number;
  headshots: number;
  /** Fração 0..1. `null` quando o HLstatsX não publicou a razão. */
  headshotRatio: number | null;
  /** Fatia 0..1 desta arma sobre todos os kills com arma identificada. */
  shareOfKills: number;
}

export interface MapStat {
  map: string;
  kills: number;
  headshots: number;
  headshotRatio: number | null;
  shareOfKills: number;
}

export interface ServerStats {
  /** Soma dos kills de todas as armas — o "total de mortes no servidor". */
  totalKills: number;
  totalHeadshots: number;
  /** Fração 0..1 dos kills que foram na cabeça. */
  headshotRate: number | null;

  weapons: WeaponStat[];
  maps: MapStat[];

  /** Ações notáveis, já com nome em português. `null` = não existe na fonte. */
  bomb: {
    planted: number | null;
    defused: number | null;
    pickedUp: number | null;
    dropped: number | null;
  };
  multiKills: {
    double: number | null;
    triple: number | null;
    /** "Domination (4 kills)" no HLstatsX — sequência, não a dominação clássica. */
    quadruple: number | null;
    /** "Rampage (5 kills)". */
    rampage: number | null;
    /** "Mega Kill (6 kills)". */
    megaKill: number | null;
  };
  highlights: {
    mvp: number | null;
    domination: number | null;
    revenge: number | null;
  };
  /**
   * Desfecho dos rounds, separado por MOTIVO — é o mais perto de
   * "equilíbrio CT x T" que esta fonte permite. O HLstatsX não publica
   * placar de round, então round vencido por tempo esgotado não aparece
   * aqui: os totais NÃO somam o número de rounds jogados, e o painel
   * precisa dizer isso.
   */
  roundOutcomes: {
    /** T venceu eliminando todos os CTs. */
    tWipedCts: number | null;
    /** T venceu explodindo o alvo. */
    tBombed: number | null;
    /** CT venceu eliminando todos os Ts. */
    ctWipedTs: number | null;
    /** CT venceu desarmando a bomba. */
    ctDefused: number | null;
  };

  /** Toda ação publicada, crua, pra tela poder listar o que não modelamos. */
  actions: Array<{ code: string; name: string; count: number }>;
}

/**
 * Códigos EXATOS desta instalação, conferidos no HTML real (2026-08-30).
 * Não são os nomes "óbvios": plantar a bomba é `Planted_The_Bomb` (não
 * `Plant_Bomb`), e multi-kill é `kill_streak_N` (não `double_kill`).
 * Confirmar no HTML antes de mudar qualquer um destes.
 */
const ACTION_CODES = {
  plant: "Planted_The_Bomb",
  defuse: "Defused_The_Bomb",
  pickUp: "Got_The_Bomb",
  drop: "Dropped_The_Bomb",
  double: "kill_streak_2",
  triple: "kill_streak_3",
  quadruple: "kill_streak_4",
  rampage: "kill_streak_5",
  megaKill: "kill_streak_6",
  mvp: "round_mvp",
  domination: "domination",
  revenge: "revenge",
  /** Cuidado: o código diz quem VENCEU, o nome diz quem foi eliminado. */
  tWipedCts: "Terrorists_Win",
  ctWipedTs: "CTs_Win",
  tBombed: "Target_Bombed",
  ctDefused: "Bomb_Defused",
} as const;

/**
 * O código é a chave estável, mas nem toda instalação usa o mesmo — por
 * isso, se o código não bater, ainda tentamos pelo nome de exibição. Sem
 * nenhum dos dois, `null`: melhor um bloco ausente que um zero falso.
 */
function findAction(
  actions: readonly HLStatsActionRow[],
  code: string,
  nameFallback?: RegExp,
): number | null {
  const porCodigo = actions.find((a) => a.code === code);
  if (porCodigo) return porCodigo.count;
  if (nameFallback) {
    const porNome = actions.find((a) => nameFallback.test(a.name));
    if (porNome) return porNome.count;
  }
  return null;
}

function comParticipacao<T extends { kills: number }>(rows: readonly T[], total: number) {
  return rows.map((row) => ({
    ...row,
    shareOfKills: total > 0 ? row.kills / total : 0,
  }));
}

export function buildServerStats(raw: ServerStatsRaw): ServerStats {
  const weapons = [...raw.weapons].sort((a, b) => b.kills - a.kills);
  const maps = [...raw.maps].sort((a, b) => b.kills - a.kills);

  /**
   * O total sai das ARMAS, não dos mapas: kill sem arma identificada
   * (queda, mundo) entra num e não no outro, e somar mapas daria um número
   * diferente pra mesma pergunta. Uma fonte só, sempre.
   */
  const totalKills = weapons.reduce((sum, w) => sum + w.kills, 0);
  const totalHeadshots = weapons.reduce((sum, w) => sum + w.headshots, 0);

  const a = raw.actions;

  return {
    totalKills,
    totalHeadshots,
    headshotRate: totalKills > 0 ? totalHeadshots / totalKills : null,

    weapons: comParticipacao(weapons as HLStatsWeaponRow[], totalKills),
    maps: comParticipacao(maps as HLStatsMapRow[], maps.reduce((s, m) => s + m.kills, 0)),

    bomb: {
      planted: findAction(a, ACTION_CODES.plant, /^Plant the Bomb$/i),
      defused: findAction(a, ACTION_CODES.defuse, /^Defuse the Bomb$/i),
      pickedUp: findAction(a, ACTION_CODES.pickUp, /^Pick up the Bomb$/i),
      dropped: findAction(a, ACTION_CODES.drop, /^Drop the Bomb$/i),
    },
    multiKills: {
      double: findAction(a, ACTION_CODES.double, /Double Kill/i),
      triple: findAction(a, ACTION_CODES.triple, /Triple Kill/i),
      quadruple: findAction(a, ACTION_CODES.quadruple, /\(4 kills\)/i),
      rampage: findAction(a, ACTION_CODES.rampage, /Rampage/i),
      megaKill: findAction(a, ACTION_CODES.megaKill, /Mega Kill/i),
    },
    highlights: {
      mvp: findAction(a, ACTION_CODES.mvp, /Round MVP/i),
      domination: findAction(a, ACTION_CODES.domination, /^Domination$/i),
      revenge: findAction(a, ACTION_CODES.revenge, /^Revenge$/i),
    },
    roundOutcomes: {
      tWipedCts: findAction(a, ACTION_CODES.tWipedCts, /All Counter-Terrorists eliminated/i),
      tBombed: findAction(a, ACTION_CODES.tBombed, /bombed the target/i),
      ctWipedTs: findAction(a, ACTION_CODES.ctWipedTs, /All Terrorists eliminated/i),
      ctDefused: findAction(a, ACTION_CODES.ctDefused, /defused the bomb/i),
    },

    actions: a.map(({ code, name, count }) => ({ code, name, count })),
  };
}
