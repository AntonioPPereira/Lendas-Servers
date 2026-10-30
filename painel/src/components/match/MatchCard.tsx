import { Link } from "react-router-dom";
import { Clapperboard, Clock, Users } from "lucide-react";
import type { MatchDetail } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatDateTime, formatDuration, mapLabel, mapPrefix } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { RoundStrip } from "./RoundStrip";

export function MatchCard({ match, className }: { match: MatchDetail; className?: string }) {
  const ctWon = match.winner === "CT";

  return (
    <Link
      to={"/partidas/" + match.id}
      className={cn(
        "panel row-interactive grid items-center gap-4 px-4 py-3.5",
        "grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[150px_120px_minmax(0,1fr)_auto]",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="t-eyebrow text-[8.5px]">{mapPrefix(match.map)}</p>
        <p className="t-title mt-1 truncate text-[14px] text-ink">{mapLabel(match.map)}</p>
        <p className="t-num mt-1 text-[10px] text-ink-4">{match.id}</p>
      </div>

      <div className="hidden items-baseline gap-1.5 lg:flex">
        <span className={cn("t-display text-[22px] tabular-nums", ctWon ? "text-ct" : "text-ct/40")}>
          {match.ctScore}
        </span>
        <span className="text-[12px] text-ink-4">:</span>
        <span className={cn("t-display text-[22px] tabular-nums", ctWon ? "text-t/40" : "text-t")}>
          {match.tScore}
        </span>
      </div>

      <div className="hidden min-w-0 lg:block">
        <RoundStrip rounds={match.rounds} maxRounds={match.rounds.length} size="sm" />
        <p className="t-num mt-2 text-[10.5px] text-ink-4">
          {formatDateTime(match.playedAt)} · {match.serverName}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <div className="flex items-center gap-2 lg:hidden">
          <span className={cn("t-display text-[18px] tabular-nums", ctWon ? "text-ct" : "text-ct/40")}>
            {match.ctScore}
          </span>
          <span className="text-[11px] text-ink-4">:</span>
          <span className={cn("t-display text-[18px] tabular-nums", ctWon ? "text-t/40" : "text-t")}>
            {match.tScore}
          </span>
        </div>

        <div className="flex items-center gap-3 text-ink-4">
          <span className="t-num flex items-center gap-1 text-[10.5px]">
            <Clock className="size-3" />
            {formatDuration(match.durationSec)}
          </span>
          <span className="t-num flex items-center gap-1 text-[10.5px]">
            <Users className="size-3" />
            {match.playersCount}
          </span>
        </div>

        {match.demoId ? (
          <Badge tone="brass" icon={<Clapperboard />}>
            Demo
          </Badge>
        ) : (
          <Badge tone="neutral">Sem demo</Badge>
        )}
      </div>
    </Link>
  );
}
