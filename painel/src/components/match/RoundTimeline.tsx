import { useEffect, useRef } from "react";
import type { RoundEndReason, RoundResult } from "@/data/types";
import { cn } from "@/lib/cn";
import { gsap, prefersReducedMotion } from "@/lib/motion";
import { BOMB_ICON, TEAM_CREST } from "@/lib/csAssets";
import { RoundStripLegend } from "./RoundStrip";

const REASON_LABEL: Record<RoundEndReason, string> = {
  bomb: "Bomba explodiu",
  defuse: "Bomba desarmada",
  elimination: "Time eliminado",
  time: "Tempo esgotado",
  hostage: "Reféns resgatados",
};

const BOMB_DECIDED = new Set<RoundEndReason>(["bomb", "defuse"]);

/**
 * O histórico da partida em duas raias — CT em cima, T embaixo. Cada rodada
 * ocupa uma coluna e a marca cai na raia de quem venceu, então uma sequência
 * de vitórias vira um bloco contínuo numa das linhas: dá pra ler quem estava
 * dominando cada trecho da partida de relance, o que uma régua de linha única
 * não mostra.
 *
 * A arte é a real do jogo: brasão do vencedor, ou a C4 quando foi a bomba que
 * decidiu. Coluna sem marca nas duas raias é rodada que ainda não aconteceu.
 */
export function RoundTimeline({
  rounds,
  maxRounds = 30,
  currentRound,
  className,
}: {
  rounds: RoundResult[];
  maxRounds?: number;
  currentRound?: number;
  className?: string;
}) {
  const scope = useRef<HTMLDivElement>(null);
  const previous = useRef(rounds.length);

  useEffect(() => {
    if (rounds.length <= previous.current) {
      previous.current = rounds.length;
      return;
    }
    previous.current = rounds.length;

    const el = scope.current?.querySelector<HTMLElement>("[data-timeline-latest]");
    if (!el || prefersReducedMotion()) return;

    const tween = gsap.fromTo(
      el,
      { scale: 0.35, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(2.4)" },
    );
    return () => {
      tween.kill();
    };
  }, [rounds.length]);

  const slots = Math.max(maxRounds, rounds.length);

  return (
    <div className={className}>
      <div ref={scope} className="flex gap-[3px] overflow-x-auto no-scrollbar pb-1">
        {Array.from({ length: slots }, (_, index) => {
          const round = rounds[index];
          const number = index + 1;
          const isLatest = index === rounds.length - 1;
          const isCurrent = currentRound === number && !round;
          // Marco a cada 5 rodadas: dá régua pro olho sem numerar tudo forte.
          const milestone = number % 5 === 0;

          return (
            <div key={index} className="flex shrink-0 flex-col items-center gap-[3px]">
              <span
                className={cn(
                  "t-num text-[8px] tabular-nums leading-none",
                  isCurrent ? "text-brass" : milestone ? "text-ink-3" : "text-ink-4/60",
                )}
              >
                {number}
              </span>

              <RoundCell
                lane="CT"
                round={round}
                isLatest={isLatest}
                isCurrent={isCurrent}
                number={number}
              />
              <RoundCell
                lane="T"
                round={round}
                isLatest={isLatest}
                isCurrent={isCurrent}
                number={number}
              />
            </div>
          );
        })}
      </div>

      <RoundStripLegend className="mt-2.5" />
    </div>
  );
}

function RoundCell({
  lane,
  round,
  isLatest,
  isCurrent,
  number,
}: {
  lane: "CT" | "T";
  round: RoundResult | undefined;
  isLatest: boolean;
  isCurrent: boolean;
  number: number;
}) {
  const won = round?.winner === lane;
  const bombed = round ? BOMB_DECIDED.has(round.reason) : false;

  return (
    <span
      data-timeline-latest={won && isLatest ? "" : undefined}
      title={
        round
          ? "Rodada " + round.round + " · " + round.winner + " · " + REASON_LABEL[round.reason]
          : "Rodada " + number + (isCurrent ? " · em andamento" : " · não jogada")
      }
      className={cn(
        "grid size-[18px] place-items-center rounded-[2px] border transition-colors",
        // Slot vazio precisa ser VISÍVEL: sem ele as duas raias viram
        // marcas soltas no ar, em vez de dois trilhos contínuos onde dá pra
        // seguir quem venceu cada trecho.
        !won && !isCurrent && "border-line-soft/60 bg-panel-2/50",
        isCurrent && "border-brass/50 bg-brass/10",
        won && lane === "CT" && "border-ct/45 bg-ct/20",
        won && lane === "T" && "border-t/45 bg-t/20",
        won && isLatest && "ring-1 ring-brass/50",
      )}
    >
      {won ? (
        <img
          src={bombed ? BOMB_ICON : TEAM_CREST[lane]}
          alt=""
          aria-hidden="true"
          draggable={false}
          className={cn(
            "select-none object-contain",
            bombed ? "h-[72%] opacity-80" : "size-[82%] opacity-90",
          )}
        />
      ) : null}
    </span>
  );
}
