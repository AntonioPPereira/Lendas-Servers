import { useMemo } from "react";
import type { LivePlayer, Team } from "@/data/types";
import { cn } from "@/lib/cn";
import { SCOREBOARD_COLUMNS, ScoreboardRow } from "./ScoreboardRow";
import { TeamCrest } from "./TeamCrest";
import { EmptyState } from "@/components/ui/States";

interface TeamColumnProps {
  team: Exclude<Team, "SPEC">;
  label: string;
  score: number;
  players: LivePlayer[];
  /** Archived matches have no living players and no ping worth reading. */
  final?: boolean;
}

function TeamColumn({ team, label, score, players, final = false }: TeamColumnProps) {
  const sorted = useMemo(
    () => [...players].sort((a, b) => b.score - a.score || b.kills - a.kills),
    [players],
  );
  const alive = sorted.filter((p) => p.alive).length;

  return (
    <div className="relative min-w-0 flex-1 overflow-hidden">
      {/* Brasa do lado: azul no CT, laranja no T, ancorada na borda externa.
          Fica atrás de tudo (z-0) e o conteúdo sobe pra z-10. */}
      <span
        aria-hidden="true"
        className={cn("side-fire z-0", team === "CT" ? "side-fire-ct" : "side-fire-t")}
      />

      <header
        className={cn(
          "relative z-10 flex items-center gap-2.5 border-b px-3 py-2",
          team === "CT" ? "border-ct/25 bg-ct/[0.06]" : "border-t/25 bg-t/[0.06]",
        )}
      >
        <TeamCrest team={team} className="size-7 shrink-0" />
        <h3 className={cn("t-title text-[11.5px]", team === "CT" ? "text-ct-hi" : "text-t-hi")}>
          {label}
        </h3>
        <span className="t-num ml-auto text-[10.5px] text-ink-4">
          {final ? sorted.length + " jogadores" : alive + "/" + sorted.length + " vivos"}
        </span>
        <span
          className={cn(
            "t-display text-[18px] tabular-nums",
            team === "CT" ? "text-ct" : "text-t",
          )}
        >
          {score}
        </span>
      </header>

      <div className={cn("relative z-10 grid gap-2 border-b border-line-soft px-3 py-1.5", SCOREBOARD_COLUMNS)}>
        <span />
        <span className="t-eyebrow text-[8.5px]">Jogador</span>
        <span className="t-eyebrow text-center text-[8.5px]">K</span>
        <span className="t-eyebrow text-center text-[8.5px]">D</span>
        <span className="t-eyebrow text-right text-[8.5px]">Score</span>
        <span className="t-eyebrow hidden text-right text-[8.5px] sm:block">Ping</span>
      </div>

      <div className="relative z-10 divide-y divide-line-soft/60">
        {sorted.length === 0 ? (
          <EmptyState title="Sem jogadores neste time" className="py-10" />
        ) : (
          sorted.map((player, index) => (
            <ScoreboardRow
              key={player.steamId64}
              player={player}
              rank={index + 1}
              final={final}
              leader={index === 0}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface ScoreboardProps {
  players: LivePlayer[];
  ctScore: number;
  tScore: number;
  /** Renders the archived form: no alive counter, no health hairline. */
  final?: boolean;
  className?: string;
}

export function Scoreboard({ players, ctScore, tScore, final, className }: ScoreboardProps) {
  const ct = players.filter((p) => p.team === "CT");
  const t = players.filter((p) => p.team === "T");

  return (
    <div className={cn("flex flex-col lg:flex-row", className)}>
      <TeamColumn team="CT" label="Counter-Terrorists" score={ctScore} players={ct} final={final} />
      <div className="h-px w-full shrink-0 bg-line-soft lg:h-auto lg:w-px" aria-hidden="true" />
      <TeamColumn team="T" label="Terrorists" score={tScore} players={t} final={final} />
    </div>
  );
}
