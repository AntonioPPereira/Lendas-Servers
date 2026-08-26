import { Menu, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatClock, mapLabel } from "@/lib/format";
import { useConnection, useLiveMatch } from "@/realtime/store";
import { useValueFlash } from "@/hooks/useCountUp";
import { useRealServers, pickPrimaryServer } from "@/hooks/useRealServers";
import { PulseDot } from "@/components/ui/Badge";
import { RealConnectButton } from "@/components/server/RealConnectButton";

const PHASE_LABEL: Record<string, string> = {
  warmup: "Aquecimento",
  freezetime: "Freezetime",
  live: "Em andamento",
  bomb: "Bomba plantada",
  halftime: "Intervalo",
  ended: "Encerrada",
};

/**
 * The broadcast strip. It is the one element present on every route, so it
 * carries the single fact a player always wants: what is happening right now.
 */
export function SignalBar({
  onOpenMenu,
  onOpenSearch,
}: {
  onOpenMenu: () => void;
  onOpenSearch: () => void;
}) {
  const match = useLiveMatch();
  const connection = useConnection();
  const realServers = useRealServers();
  const primary = pickPrimaryServer(realServers.data ?? []);

  const ctRef = useValueFlash<HTMLSpanElement>(match.ctScore);
  const tRef = useValueFlash<HTMLSpanElement>(match.tScore);

  const connected = connection === "live";
  const urgent = match.phase === "bomb" || (match.phase === "live" && match.clock <= 20);

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-line-soft bg-base/88 px-3 backdrop-blur-md sm:px-4">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Abrir navegação"
        className="grid size-9 shrink-0 place-items-center rounded-xs border border-line-soft text-ink-3 transition-colors hover:text-ink lg:hidden"
      >
        <Menu className="size-4" />
      </button>

      <div className="flex min-w-0 items-center gap-2.5">
        <PulseDot tone={connected ? "live" : "ink"} still={!connected} />
        <span
          className={cn(
            "t-eyebrow hidden text-[9px] sm:block",
            connected ? "text-live" : "text-ink-4",
          )}
        >
          {connection === "live"
            ? "Ao vivo"
            : connection === "connecting"
              ? "Conectando"
              : connection === "reconnecting"
                ? "Reconectando"
                : "Pausado"}
        </span>
        <span className="hidden h-3 w-px bg-line md:block" aria-hidden="true" />
        {primary ? (
          <span className="t-num hidden truncate text-[11px] text-ink-3 md:block">
            {primary.name}
          </span>
        ) : null}
      </div>

      {/* Score readout — the hierarchy peak of the whole strip. */}
      <div className="flex min-w-0 flex-1 items-center justify-center gap-3 sm:gap-4">
        <span className="t-title hidden truncate text-[12px] text-ink-2 sm:block">
          {mapLabel(match.map)}
        </span>

        <div className="flex items-center gap-2 rounded-xs border border-line-soft bg-panel-2/70 px-2.5 py-1">
          <span ref={ctRef} className="t-display text-[16px] tabular-nums text-ct">
            {match.ctScore}
          </span>
          <span className="text-[11px] text-ink-4">:</span>
          <span ref={tRef} className="t-display text-[16px] tabular-nums text-t">
            {match.tScore}
          </span>
        </div>

        <div className="flex items-baseline gap-1.5">
          <span className="t-eyebrow hidden text-[9px] sm:block">R{match.round}</span>
          <span
            className={cn(
              "t-num text-[12px] tabular-nums transition-colors",
              urgent ? "text-danger" : "text-ink-2",
            )}
          >
            {formatClock(match.clock)}
          </span>
        </div>

        <span className="t-eyebrow hidden text-[9px] text-ink-4 lg:block">
          {PHASE_LABEL[match.phase] ?? match.phase}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {primary ? (
          <span className="t-num hidden text-[11px] text-ink-3 md:block">
            {primary.players}/{primary.maxPlayers}
          </span>
        ) : null}

        <button
          type="button"
          onClick={onOpenSearch}
          className="group flex h-9 items-center gap-2 rounded-xs border border-line-soft bg-panel-2/60 px-2.5 text-ink-4 transition-colors hover:border-line hover:text-ink-2"
          aria-label="Buscar na comunidade"
        >
          <Search className="size-3.5" />
          <span className="hidden text-[12px] xl:block">Buscar</span>
          <kbd className="hidden rounded-xs border border-line-soft px-1 font-mono text-[10px] xl:block">
            Ctrl K
          </kbd>
        </button>

        {primary ? (
          <RealConnectButton
            host={primary.host}
            port={primary.port}
            size="md"
            className="hidden sm:inline-flex"
          />
        ) : null}
      </div>
    </header>
  );
}
