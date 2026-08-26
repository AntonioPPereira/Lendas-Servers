import { memo } from "react";
import { Link } from "react-router-dom";
import type { RankedPlayer } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatDecimal, formatNumber, formatPercent, formatPlaytime } from "@/lib/format";
import { PlayerAvatar } from "@/components/player/PlayerAvatar";
import { Meter } from "@/components/ui/Meter";

const COLUMNS =
  "grid-cols-[44px_minmax(0,1fr)_58px_58px] md:grid-cols-[44px_minmax(0,1fr)_62px_62px_62px_92px_74px_78px]";

export function RankingHeader() {
  return (
    <div className={cn("grid gap-2 border-b border-line-soft px-3 py-2", COLUMNS)}>
      <span className="t-eyebrow text-[8.5px]">#</span>
      <span className="t-eyebrow text-[8.5px]">Jogador</span>
      <span className="t-eyebrow hidden text-right text-[8.5px] md:block">Kills</span>
      <span className="t-eyebrow hidden text-right text-[8.5px] md:block">Deaths</span>
      <span className="t-eyebrow text-right text-[8.5px]">K/D</span>
      <span className="t-eyebrow hidden text-right text-[8.5px] md:block">Precisão</span>
      <span className="t-eyebrow hidden text-right text-[8.5px] md:block">Conexão</span>
      <span className="t-eyebrow text-right text-[8.5px]">Skill</span>
    </div>
  );
}

export const RankingRow = memo(function RankingRow({ player }: { player: RankedPlayer }) {
  const ratio = player.kd ?? 0;
  const accuracy = player.accuracy ?? 0;

  return (
    <Link
      to={"/jogadores/" + player.id}
      data-flip-id={player.id}
      className={cn("row-interactive grid items-center gap-2 px-3 py-2.5", COLUMNS)}
    >
      <span
        className={cn(
          "t-num text-[12px] tabular-nums",
          player.rank <= 3 ? "text-brass" : "text-ink-4",
        )}
      >
        {String(player.rank).padStart(2, "0")}
      </span>

      <span className="flex min-w-0 items-center gap-2.5">
        <PlayerAvatar seed={player.id} nickname={player.nickname} avatarUrl={player.avatarUrl} size="sm" />
        <span className="min-w-0">
          <span className="block truncate text-[12.5px] text-ink">{player.nickname}</span>
          <span className="t-num block truncate text-[10px] text-ink-4">
            {player.country?.name ?? "País desconhecido"}
          </span>
        </span>
      </span>

      <span className="t-num hidden text-right text-[12px] tabular-nums text-ink-2 md:block">
        {formatNumber(player.kills)}
      </span>
      <span className="t-num hidden text-right text-[12px] tabular-nums text-ink-3 md:block">
        {formatNumber(player.deaths)}
      </span>
      <span
        className={cn(
          "t-num text-right text-[12px] tabular-nums",
          ratio >= 1.2 ? "text-brass" : ratio >= 1 ? "text-ink" : "text-ink-3",
        )}
      >
        {formatDecimal(ratio)}
      </span>

      <span className="hidden md:block">
        <span className="t-num block text-right text-[11.5px] tabular-nums text-ink-2">
          {formatPercent(accuracy)}
        </span>
        <Meter value={accuracy} max={100} height={2} tone="ct" className="mt-1" />
      </span>

      <span className="t-num hidden text-right text-[11.5px] tabular-nums text-ink-3 md:block">
        {formatPlaytime(player.connectionTimeMinutes ?? 0)}
      </span>

      <span className="t-num text-right text-[12.5px] tabular-nums text-ink">
        {formatNumber(player.skill)}
      </span>
    </Link>
  );
});
