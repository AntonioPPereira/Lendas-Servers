import { Link } from "react-router-dom";
import type { RankedPlayer } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatDecimal, formatNumber, formatPercent, formatPlaytime } from "@/lib/format";
import { PlayerAvatar } from "./PlayerAvatar";
import { Meter } from "@/components/ui/Meter";

export function PlayerCard({ player, className }: { player: RankedPlayer; className?: string }) {
  const ratio = player.kd ?? 0;
  const accuracy = player.accuracy ?? 0;

  return (
    <Link
      to={"/jogadores/" + player.id}
      className={cn(
        "panel group flex flex-col p-4",
        "transition-[border-color,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "hover:-translate-y-0.5 hover:border-line",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <PlayerAvatar seed={player.id} nickname={player.nickname} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-ink">{player.nickname}</p>
          <p className="t-num mt-1 truncate text-[10.5px] text-ink-4">
            {player.country?.name ?? "País desconhecido"}
          </p>
        </div>
        <span className="t-num shrink-0 text-[12px] text-brass">#{player.rank}</span>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        <div>
          <dt className="t-eyebrow text-[8.5px]">K/D</dt>
          <dd className="t-num mt-1 text-[14px] tabular-nums text-ink">{formatDecimal(ratio)}</dd>
        </div>
        <div>
          <dt className="t-eyebrow text-[8.5px]">Kills</dt>
          <dd className="t-num mt-1 text-[14px] tabular-nums text-ink-2">
            {formatNumber(player.kills)}
          </dd>
        </div>
        <div>
          <dt className="t-eyebrow text-[8.5px]">Conexão</dt>
          <dd className="t-num mt-1 text-[14px] tabular-nums text-ink-2">
            {formatPlaytime(player.connectionTimeMinutes ?? 0)}
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <span className="t-eyebrow text-[8.5px]">Precisão</span>
          <span className="t-num text-[11px] text-ink-2">{formatPercent(accuracy)}</span>
        </div>
        <Meter value={accuracy} max={100} height={3} tone="ct" className="mt-1.5" />
      </div>
    </Link>
  );
}
