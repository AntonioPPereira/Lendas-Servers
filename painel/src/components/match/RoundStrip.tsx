import { useEffect, useRef } from "react";
import type { RoundEndReason, RoundResult } from "@/data/types";
import { cn } from "@/lib/cn";
import { gsap, prefersReducedMotion } from "@/lib/motion";

const REASON_LABEL: Record<RoundEndReason, string> = {
  bomb: "Bomba explodiu",
  defuse: "Bomba desarmada",
  elimination: "Time eliminado",
  time: "Tempo esgotado",
  hostage: "Reféns resgatados",
};

interface RoundStripProps {
  rounds: RoundResult[];
  maxRounds?: number;
  /** Sides swap after this round. MR15 by default. */
  halftimeAt?: number;
  size?: "sm" | "md";
  className?: string;
}

/**
 * The round history strip, reused on the live match, match detail and demo
 * pages. It is the one structural motif of the interface, and it earns the
 * space: colour is which side won, the notch is how.
 */
export function RoundStrip({
  rounds,
  maxRounds = 30,
  halftimeAt = 15,
  size = "md",
  className,
}: RoundStripProps) {
  const container = useRef<HTMLDivElement>(null);
  const previous = useRef(rounds.length);

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
      { scaleY: 0.2, opacity: 0 },
      { scaleY: 1, opacity: 1, duration: 0.42, ease: "back.out(2)", transformOrigin: "50% 100%" },
    );
    return () => {
      tween.kill();
    };
  }, [rounds.length]);

  const slots = Math.max(maxRounds, rounds.length);
  const half = halftimeAt;

  return (
    <div
      ref={container}
      className={cn("flex items-end gap-px overflow-x-auto no-scrollbar", className)}
      role="img"
      aria-label={"Histórico de rodadas: " + rounds.length + " jogadas"}
    >
      {Array.from({ length: slots }, (_, index) => {
        const round = rounds[index];
        const isLatest = index === rounds.length - 1;
        const showDivider = index === half;

        return (
          <div key={index} className="flex items-end">
            {showDivider ? (
              <span
                className={cn("mx-1 w-px shrink-0 bg-line", size === "md" ? "h-5" : "h-3.5")}
                aria-hidden="true"
              />
            ) : null}

            <div
              data-round-latest={isLatest ? "" : undefined}
              title={
                round
                  ? "Rodada " + round.round + " · " + round.winner + " · " + REASON_LABEL[round.reason]
                  : "Rodada " + (index + 1) + " · não jogada"
              }
              className={cn(
                "shrink-0 rounded-[1px] transition-colors",
                size === "md" ? "h-5 w-2.5" : "h-3.5 w-1.5",
                !round && "border border-line-soft bg-transparent",
                round?.winner === "CT" && "bg-ct/75",
                round?.winner === "T" && "bg-t/75",
                isLatest && "ring-1 ring-brass/60",
              )}
            >
              {round && size === "md" ? (
                <span
                  className={cn(
                    "mx-auto mt-0.5 block rounded-full",
                    round.reason === "bomb" && "size-1 bg-danger",
                    round.reason === "defuse" && "h-0.5 w-1.5 bg-void/70",
                    round.reason === "time" && "size-1 border border-void/60",
                    round.reason === "elimination" && "hidden",
                    round.reason === "hostage" && "size-1 bg-void/50",
                  )}
                  aria-hidden="true"
                />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RoundStripLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      <LegendItem className="bg-ct/75" label="CT" />
      <LegendItem className="bg-t/75" label="T" />
      <span className="flex items-center gap-1.5">
        <span className="size-1 rounded-full bg-danger" aria-hidden="true" />
        <span className="t-eyebrow text-[9px]">Bomba</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-1.5 rounded-full bg-ink-3" aria-hidden="true" />
        <span className="t-eyebrow text-[9px]">Desarme</span>
      </span>
    </div>
  );
}

function LegendItem({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-3 w-1.5 rounded-[1px]", className)} aria-hidden="true" />
      <span className="t-eyebrow text-[9px]">{label}</span>
    </span>
  );
}
