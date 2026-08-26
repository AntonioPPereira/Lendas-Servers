import { memo } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp } from "lucide-react";
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

/**
 * Variação desde a linha de base do ranking (de hora em hora, no backend).
 * Não renderiza nada quando é zero ou `null`: "sem mudança" e "ainda não dá
 * pra comparar" não merecem ocupar espaço nem virar um "0" que o jogador
 * leria como informação.
 */
function Delta({ value, className }: { value: number | null | undefined; className?: string }) {
  if (value == null || value === 0) return null;
  const up = value > 0;
  const Icon = up ? ChevronUp : ChevronDown;
  return (
    <span
      className={cn(
        "t-num inline-flex items-center gap-px text-[9.5px] tabular-nums leading-none",
        up ? "text-live" : "text-danger",
        className,
      )}
      title={
        (up ? "Subiu " : "Caiu ") + formatNumber(Math.abs(value)) + " desde a última atualização"
      }
    >
      <Icon className="size-2.5 shrink-0" aria-hidden="true" />
      {formatNumber(Math.abs(value))}
    </span>
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
      <span>
        <span
          className={cn(
            "t-num block text-[12px] tabular-nums",
            player.rank <= 3 ? "text-brass" : "text-ink-4",
          )}
        >
          {String(player.rank).padStart(2, "0")}
        </span>
        <Delta value={player.rankDelta} className="mt-0.5" />
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

      <span className="text-right">
        <span className="t-num block text-[12.5px] tabular-nums text-ink">
          {formatNumber(player.skill)}
        </span>
        <Delta value={player.skillDelta} className="mt-0.5" />
      </span>
    </Link>
  );
});
