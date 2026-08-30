import { memo, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Crown, X } from "lucide-react";
import type { LivePlayer } from "@/data/types";
import { cn } from "@/lib/cn";
import { gsap, prefersReducedMotion } from "@/lib/motion";
import { useValueFlash } from "@/hooks/useCountUp";
import { PlayerAvatar } from "@/components/player/PlayerAvatar";

function pingTone(ping: number) {
  if (ping < 40) return "text-live";
  if (ping < 80) return "text-ink-2";
  if (ping < 120) return "text-warn";
  return "text-danger";
}

/**
 * Ping como barrinhas de sinal, além do número: quatro degraus dizem a
 * qualidade da conexão de relance, sem obrigar ninguém a saber de cor que
 * 40ms é bom e 120ms é ruim. O número segue ali pra quem quer o valor.
 */
function PingBars({ ping }: { ping: number }) {
  const level = ping < 40 ? 4 : ping < 80 ? 3 : ping < 120 ? 2 : 1;
  const tone = ping < 80 ? "bg-live" : ping < 120 ? "bg-warn" : "bg-danger";
  const heights = ["h-1", "h-1.5", "h-2", "h-2.5"];

  return (
    <span className="flex items-end gap-px" aria-hidden="true">
      {heights.map((h, i) => (
        <span
          key={h}
          className={cn("w-[2px] rounded-[1px]", h, i < level ? tone : "bg-line-soft")}
        />
      ))}
    </span>
  );
}

interface ScoreboardRowProps {
  player: LivePlayer;
  rank: number;
  final?: boolean;
  /** Primeiro do time por score — ganha a linha mais forte da coluna. */
  leader?: boolean;
}

/**
 * Sem coluna de assistências: `CS_GetClientAssists` não existe nesta
 * instalação de CS:S, então ela seria um zero eterno se passando por
 * estatística. O ping é o primeiro a sair quando a linha aperta.
 */
export const SCOREBOARD_COLUMNS =
  "grid-cols-[16px_minmax(0,1fr)_28px_28px_44px] sm:grid-cols-[18px_minmax(0,1fr)_30px_30px_46px_40px]";

export const ScoreboardRow = memo(function ScoreboardRow({
  player,
  rank,
  final = false,
  leader = false,
}: ScoreboardRowProps) {
  const row = useRef<HTMLDivElement>(null);
  const wasAlive = useRef(player.alive);
  const killsRef = useValueFlash<HTMLSpanElement>(player.kills);
  const scoreRef = useValueFlash<HTMLSpanElement>(player.score);

  // Death is the one event worth interrupting the eye for: a single red wash.
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const died = wasAlive.current && !player.alive;
    wasAlive.current = player.alive;
    if (!died || prefersReducedMotion()) return;

    const tween = gsap.fromTo(
      el,
      { backgroundColor: "rgba(217,69,59,0.16)" },
      { backgroundColor: "rgba(217,69,59,0)", duration: 0.85, ease: "power2.out", clearProps: "backgroundColor" },
    );
    return () => {
      tween.kill();
    };
  }, [player.alive]);

  return (
    <div
      ref={row}
      className={cn(
        "row-interactive relative grid items-center gap-2 px-3 py-1.5",
        SCOREBOARD_COLUMNS,
        // Aresta acesa na cor do time só no primeiro: marca quem está
        // carregando o lado sem precisar de mais um selo na linha.
        leader && "border-l-2",
        leader && (player.team === "CT" ? "border-ct/70 bg-ct/[0.07]" : "border-t/70 bg-t/[0.07]"),
      )}
    >
      <span
        className={cn(
          "t-num text-[10px] tabular-nums",
          leader ? (player.team === "CT" ? "text-ct-hi" : "text-t-hi") : "text-ink-4",
        )}
      >
        {rank}
      </span>

      <Link
        to={"/jogadores/" + player.steamId64}
        className="flex min-w-0 items-center gap-2 focus-visible:outline-none"
      >
        {/* A morte é marcada NO retrato, não apagando a linha inteira. Antes
            a linha toda ia a 45% de opacidade e levava junto kills, score e
            ping — justamente os números que se quer ler de quem morreu. */}
        <span className="relative shrink-0">
          <span className={cn(!player.alive && !final && "opacity-55")}>
            <PlayerAvatar
              seed={player.avatarSeed}
              avatarUrl={player.avatarUrl}
              size="xs"
              team={player.team}
            />
          </span>
          {!final && !player.alive ? (
            <span
              aria-hidden
              className="absolute inset-0 grid place-items-center rounded-[2px] bg-black/45"
            >
              <X className="size-3.5 stroke-[3] text-danger" />
            </span>
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                "truncate text-[12.5px]",
                // Só o nome perde um pouco de peso; os números ficam legíveis.
                !final && !player.alive ? "text-ink-3" : "text-ink",
              )}
            >
              {player.nickname}
            </span>
            {player.mvps > 0 ? (
              <span className="flex shrink-0 items-center gap-0.5 text-brass">
                <Crown className="size-2.5" />
                <span className="t-num text-[9.5px]">{player.mvps}</span>
              </span>
            ) : null}
          </span>
          {/* Health reads as a hairline under the name — HUD, not a widget. */}
          {final ? null : player.alive ? (
            <span className="mt-0.5 block h-px w-full max-w-[120px] bg-line-soft">
              <span
                className={cn(
                  "block h-px transition-[width] duration-500",
                  player.health > 50 ? "bg-live/70" : player.health > 20 ? "bg-warn/70" : "bg-danger",
                )}
                style={{ width: player.health + "%" }}
              />
            </span>
          ) : (
            <span className="t-eyebrow mt-0.5 block text-[8.5px] text-danger/75">Eliminado</span>
          )}
        </span>
      </Link>

      <span ref={killsRef} className="t-num text-center text-[12px] tabular-nums text-ink">
        {player.kills}
      </span>
      <span className="t-num text-center text-[12px] tabular-nums text-ink-3">{player.deaths}</span>
      <span ref={scoreRef} className="t-num text-right text-[12px] tabular-nums text-ink-2">
        {player.score}
      </span>
      <span className="hidden items-center justify-end gap-1.5 sm:flex" title={player.ping + " ms"}>
        <span className={cn("t-num text-[11px] tabular-nums", pingTone(player.ping))}>
          {player.ping}
        </span>
        <PingBars ping={player.ping} />
      </span>
    </div>
  );
});
