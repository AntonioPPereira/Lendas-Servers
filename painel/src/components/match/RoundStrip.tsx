import { useEffect, useRef } from "react";
import type { RoundEndReason, RoundResult } from "@/data/types";
import { cn } from "@/lib/cn";
import { gsap, prefersReducedMotion } from "@/lib/motion";
import { BOMB_ICON, TEAM_CREST } from "@/lib/csAssets";

const REASON_LABEL: Record<RoundEndReason, string> = {
  bomb: "Bomba explodiu",
  defuse: "Bomba desarmada",
  elimination: "Time eliminado",
  time: "Tempo esgotado",
  hostage: "Reféns resgatados",
};

/** A bomba decidiu a rodada — a C4 substitui o brasão como marca do round. */
const BOMB_DECIDED = new Set<RoundEndReason>(["bomb", "defuse"]);

interface RoundStripProps {
  rounds: RoundResult[];
  maxRounds?: number;
  /** Sides swap after this round. MR15 by default. */
  halftimeAt?: number;
  /** Rodada em andamento agora — ganha destaque de "acontecendo". */
  currentRound?: number;
  size?: "sm" | "md";
  className?: string;
}

/**
 * A linha do tempo da partida — o único motivo estrutural da interface, e ele
 * paga o espaço que ocupa: cada rodada carrega a arte real do jogo, não um
 * quadrado colorido genérico.
 *
 * O brasão do time diz QUEM venceu; a C4 substitui o brasão quando foi a
 * bomba que decidiu (explodiu ou foi desarmada), que é a informação que muda
 * a leitura da rodada. Rodada não jogada fica como slot vazio, e a que está
 * em andamento pulsa — dá pra ler o andamento da partida de relance.
 */
export function RoundStrip({
  rounds,
  maxRounds = 30,
  halftimeAt = 15,
  currentRound,
  size = "md",
  className,
}: RoundStripProps) {
  const container = useRef<HTMLDivElement>(null);
  const previous = useRef(rounds.length);

  // Rodada nova entra como evento: cresce da base, não aparece do nada.
  useEffect(() => {
    if (rounds.length <= previous.current) {
      previous.current = rounds.length;
      return;
    }
    previous.current = rounds.length;

    const el = container.current?.querySelector<HTMLElement>("[data-round-latest]");
    if (!el || prefersReducedMotion()) return;

    const tween = gsap.fromTo(
      el,
      { scale: 0.4, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(2.4)" },
    );
    return () => {
      tween.kill();
    };
  }, [rounds.length]);

  const slots = Math.max(maxRounds, rounds.length);
  const tile = size === "md" ? "size-6" : "size-[17px]";

  return (
    <div
      ref={container}
      className={cn("flex items-center gap-[3px] overflow-x-auto no-scrollbar", className)}
      role="img"
      aria-label={"Histórico de rodadas: " + rounds.length + " jogadas"}
    >
      {Array.from({ length: slots }, (_, index) => {
        const round = rounds[index];
        const isLatest = index === rounds.length - 1;
        const isCurrent = currentRound !== undefined && index + 1 === currentRound && !round;

        return (
          <div key={index} className="flex items-center">
            {/* Troca de lado no intervalo: a partir daqui os times invertem. */}
            {index === halftimeAt ? (
              <span
                className={cn("mx-1.5 w-px shrink-0 bg-line", size === "md" ? "h-5" : "h-3.5")}
                aria-hidden="true"
              />
            ) : null}

            <span
              data-round-latest={isLatest ? "" : undefined}
              data-round-current={isCurrent ? "" : undefined}
              title={
                round
                  ? "Rodada " + round.round + " · " + round.winner + " · " + REASON_LABEL[round.reason]
                  : "Rodada " + (index + 1) + (isCurrent ? " · em andamento" : " · não jogada")
              }
              className={cn(
                "grid shrink-0 place-items-center rounded-[2px] border transition-colors",
                tile,
                !round && !isCurrent && "border-line-soft/60 bg-panel-2/50",
                isCurrent && "border-brass/60 bg-brass/10",
                round?.winner === "CT" && "border-ct/45 bg-ct/20",
                round?.winner === "T" && "border-t/45 bg-t/20",
                isLatest && "ring-1 ring-brass/50",
              )}
            >
              {round ? (
                <img
                  src={BOMB_DECIDED.has(round.reason) ? BOMB_ICON : TEAM_CREST[round.winner]}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  className={cn(
                    "select-none object-contain",
                    // A C4 é arte branca e alta; o brasão é largo. Cada um
                    // ocupa a proporção em que ainda se reconhece nesse tamanho.
                    BOMB_DECIDED.has(round.reason) ? "h-[72%] opacity-85" : "size-[82%] opacity-90",
                  )}
                />
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function RoundStripLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      <LegendTile team="CT" label="Vitória CT" />
      <LegendTile team="T" label="Vitória T" />
      <span className="flex items-center gap-1.5">
        <span className="grid size-4 place-items-center rounded-[2px] border border-line-soft/70">
          <img src={BOMB_ICON} alt="" aria-hidden="true" className="h-[72%] opacity-85" />
        </span>
        <span className="t-eyebrow text-[9px]">Bomba decidiu</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-4 rounded-[2px] border border-line-soft/60 bg-panel-2/50" aria-hidden="true" />
        <span className="t-eyebrow text-[9px]">Não jogada</span>
      </span>
    </div>
  );
}

function LegendTile({ team, label }: { team: "CT" | "T"; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn(
          "grid size-4 place-items-center rounded-[2px] border",
          team === "CT" ? "border-ct/45 bg-ct/20" : "border-t/45 bg-t/20",
        )}
      >
        <img src={TEAM_CREST[team]} alt="" aria-hidden="true" className="size-[82%] opacity-90" />
      </span>
      <span className="t-eyebrow text-[9px]">{label}</span>
    </span>
  );
}
