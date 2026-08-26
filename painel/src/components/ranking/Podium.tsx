import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Crown } from "lucide-react";
import type { RankedPlayer } from "@/data/types";
import { cn } from "@/lib/cn";
import { gsap, prefersReducedMotion } from "@/lib/motion";
import { formatDecimal, formatNumber, formatPercent, formatPlaytime } from "@/lib/format";
import { PlayerAvatar } from "@/components/player/PlayerAvatar";

/**
 * The ladder head. First place is the only element in the product that gets a
 * metal treatment: a lit edge and a single sheen pass on mount.
 */
export function Podium({ players, className }: { players: RankedPlayer[]; className?: string }) {
  const scope = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion() || players.length === 0) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-podium]",
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.55, stagger: 0.08, ease: "power3.out" },
      );
      gsap.fromTo(
        "[data-sheen]",
        { xPercent: -140 },
        { xPercent: 240, duration: 1.1, delay: 0.5, ease: "power2.inOut" },
      );
    }, scope);
    return () => ctx.revert();
  }, [players]);

  if (players.length < 3) return null;

  const [first, second, third] = players;
  const order = [second!, first!, third!];

  return (
    <div
      ref={scope}
      className={cn("grid gap-3 sm:grid-cols-3 sm:items-end", className)}
    >
      {order.map((player) => {
        const champion = player.rank === 1;
        return (
          <Link
            key={player.id}
            to={"/jogadores/" + player.id}
            data-podium
            className={cn(
              "panel group relative overflow-hidden p-4 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1",
              champion
                ? "brass-edge order-first border-brass/25 sm:order-none sm:pb-6 sm:pt-7"
                : "sm:pb-4",
            )}
          >
            {champion ? (
              <span
                data-sheen
                className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-brass-hi/12 to-transparent"
                aria-hidden="true"
              />
            ) : null}

            <div className="flex items-start justify-between gap-3">
              <span
                className={cn(
                  "t-display leading-none",
                  champion ? "brass-text text-[44px]" : "text-[30px] text-ink-4",
                )}
              >
                {player.rank}
              </span>
              {champion ? <Crown className="size-4 shrink-0 text-brass" /> : null}
            </div>

            <div className="mt-3 flex items-center gap-3">
              <PlayerAvatar seed={player.id} nickname={player.nickname} size={champion ? "lg" : "md"} />
              <div className="min-w-0">
                <p className={cn("truncate font-medium text-ink", champion ? "text-[16px]" : "text-[14px]")}>
                  {player.nickname}
                </p>
                <p className="t-num mt-0.5 text-[11px] text-ink-3">
                  {formatNumber(player.skill)} skill
                </p>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-2">
              <Stat label="K/D" value={formatDecimal(player.kd ?? 0)} highlight={champion} />
              <Stat label="Precisão" value={formatPercent(player.accuracy ?? 0)} />
              <Stat label="Conexão" value={formatPlaytime(player.connectionTimeMinutes ?? 0)} />
            </dl>
          </Link>
        );
      })}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <dt className="t-eyebrow text-[8.5px]">{label}</dt>
      <dd className={cn("t-num mt-1 text-[13px] tabular-nums", highlight ? "text-brass" : "text-ink-2")}>
        {value}
      </dd>
    </div>
  );
}
