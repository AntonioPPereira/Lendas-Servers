import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Bomb, Timer } from "lucide-react";
import type { LiveMatch as LiveMatchModel } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatClock, mapLabel } from "@/lib/format";
import { useValueFlash } from "@/hooks/useCountUp";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { PlayerAvatar } from "@/components/player/PlayerAvatar";
import { TeamCrest } from "./TeamCrest";
import { TEAM_AGENT } from "@/lib/csAssets";
import { MapIcon } from "./MapIcon";

const PHASE: Record<string, { label: string; tone: "live" | "brass" | "danger" | "neutral" }> = {
  warmup: { label: "Aquecimento", tone: "neutral" },
  freezetime: { label: "Freezetime", tone: "brass" },
  live: { label: "Rodada em andamento", tone: "live" },
  bomb: { label: "Bomba plantada", tone: "danger" },
  halftime: { label: "Intervalo", tone: "brass" },
  ended: { label: "Partida encerrada", tone: "neutral" },
};

/** Um lado do placar: brasão oficial, nome e quantos seguem vivos. */
function TeamSide({
  team,
  alive,
  mirrored = false,
}: {
  team: "CT" | "T";
  alive: number;
  mirrored?: boolean;
}) {
  const ring = team === "CT" ? "ring-ct/40" : "ring-t/40";

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3 sm:gap-4",
        mirrored ? "flex-row-reverse" : "flex-row",
      )}
    >
      <span className="relative inline-block shrink-0">
        <img
          src={TEAM_AGENT[team]}
          alt=""
          aria-hidden="true"
          draggable={false}
          className={cn(
            "size-16 select-none rounded-xs border border-line-soft bg-panel-2 object-cover object-top ring-1 sm:size-24",
            ring,
          )}
        />
        <TeamCrest
          team={team}
          className={cn(
            "absolute -bottom-2 size-6 rounded-full bg-void ring-1 ring-line-soft sm:size-8",
            mirrored ? "-left-1.5" : "-right-1.5",
          )}
        />
      </span>
      <div className={cn("min-w-0", mirrored && "text-right")}>
        <p
          className={cn(
            "t-eyebrow truncate text-[8.5px] sm:text-[9.5px]",
            team === "CT" ? "text-ct" : "text-t",
          )}
        >
          {team === "CT" ? "Counter-Terrorists" : "Terrorists"}
        </p>
        <p className="t-num mt-1 text-[11px] text-ink-3">{alive} vivos</p>
      </div>
    </div>
  );
}

export function LiveMatch({
  match,
  className,
}: {
  match: LiveMatchModel;
  className?: string;
}) {
  const ctRef = useValueFlash<HTMLSpanElement>(match.ctScore);
  const tRef = useValueFlash<HTMLSpanElement>(match.tScore);

  const ctAlive = match.players.filter((p) => p.team === "CT" && p.alive).length;
  const tAlive = match.players.filter((p) => p.team === "T" && p.alive).length;
  const phase = PHASE[match.phase] ?? PHASE.live!;
  const urgent = match.phase === "bomb" || (match.phase === "live" && match.clock <= 20);

  const star = useMemo(
    () => [...match.players].sort((a, b) => b.score - a.score)[0] ?? null,
    [match.players],
  );

  return (
    <Panel hud className={cn("overflow-hidden", className)}>
      <PanelHeader
        label="Partida ao vivo"
        accent="brass"
        actions={
          <>
            <span className="mr-1 hidden items-center gap-2 sm:flex">
              <MapIcon map={match.map} decorative className="size-5" />
              <span className="t-num text-[11px] text-ink-2">{mapLabel(match.map)}</span>
            </span>
            <Badge tone={phase.tone === "neutral" ? "neutral" : phase.tone}>
              {match.phase === "bomb" ? <Bomb className="size-3" /> : null}
              {phase.label}
            </Badge>
          </>
        }
      />

      <div className="relative overflow-hidden">
        {/* Marca d'água do mapa. Fraca de propósito: a 0.055 a coroa e o nome
            do mapa cruzavam os números do placar e disputavam a leitura. Aqui
            ela é textura, e a arte do mapa aparece de verdade na placa abaixo. */}
        <MapIcon
          map={match.map}
          decorative
          className="pointer-events-none absolute left-1/2 top-1/2 size-[280px] -translate-x-1/2 -translate-y-1/2 opacity-[0.035] [mask-image:radial-gradient(closest-side,#000,transparent)] sm:size-[360px]"
        />

        {/* Placar: brasão de cada lado, números no meio. */}
        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-6 sm:gap-6 sm:px-6 sm:py-7">
          <TeamSide team="CT" alive={ctAlive} />

          <div className="flex flex-col items-center">
            <div className="flex items-baseline gap-3 sm:gap-4">
              <span
                ref={ctRef}
                className="t-display text-[46px] leading-none tabular-nums text-ct sm:text-[68px]"
              >
                {match.ctScore}
              </span>
              <span className="t-display text-[20px] text-ink-4 sm:text-[26px]">:</span>
              <span
                ref={tRef}
                className="t-display text-[46px] leading-none tabular-nums text-t sm:text-[68px]"
              >
                {match.tScore}
              </span>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <span className="t-eyebrow whitespace-nowrap text-[9px]">
                Rodada {match.round}/{match.maxRounds}
              </span>
              <span className="h-3 w-px bg-line" aria-hidden="true" />
              <span
                className={cn(
                  "t-num flex items-center gap-1.5 text-[14px] tabular-nums transition-colors",
                  urgent ? "text-danger" : "text-ink",
                )}
              >
                <Timer className="size-3.5" />
                {formatClock(match.clock)}
              </span>
            </div>
          </div>

          <TeamSide team="T" alive={tAlive} mirrored />
        </div>

      </div>

      <div className="grid gap-3 border-t border-line-soft p-4 sm:grid-cols-2 sm:p-5">
        <div className="flex items-center gap-3 rounded-xs border border-line-soft bg-panel-2/50 p-2.5">
          <MapIcon map={match.map} className="size-12 shrink-0" />
          <span className="min-w-0">
            <span className="t-eyebrow block text-[8.5px]">Mapa atual</span>
            <span className="t-title mt-1 block truncate text-[15px] text-ink">
              {mapLabel(match.map)}
            </span>
            <span className="t-num mt-0.5 block text-[10.5px] text-ink-4">
              {match.players.length} em jogo
            </span>
          </span>
        </div>

        {star ? (
          <Link
            to={"/jogadores/" + star.steamId64}
            className="group flex items-center gap-3 rounded-xs border border-line-soft bg-panel-2/50 p-2.5 transition-colors hover:border-brass/40"
          >
            <PlayerAvatar seed={star.avatarSeed} size="md" team={star.team} />
            <span className="min-w-0 flex-1">
              <span className="t-eyebrow block text-[8.5px] text-brass">Destaque da partida</span>
              <span className="mt-1 block truncate text-[13px] font-medium text-ink">
                {star.nickname}
              </span>
              <span className="t-num mt-0.5 block text-[10.5px] text-ink-4">
                {star.kills} K · {star.assists} A · {star.deaths} D · {star.mvps} MVP
              </span>
            </span>
          </Link>
        ) : null}
      </div>
    </Panel>
  );
}
