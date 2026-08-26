import { Bomb, Menu, Search, Timer } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatClock, mapLabel } from "@/lib/format";
import { useConnection, useLiveMatch } from "@/realtime/store";
import { useValueFlash } from "@/hooks/useCountUp";
import { useRealServers, pickPrimaryServer } from "@/hooks/useRealServers";
import { Badge, PulseDot } from "@/components/ui/Badge";
import { RealConnectButton } from "@/components/server/RealConnectButton";
import { TeamCrest } from "@/components/match/TeamCrest";

const PHASE: Record<string, { label: string; tone: "live" | "brass" | "danger" | "neutral" }> = {
  warmup: { label: "Aquecimento", tone: "neutral" },
  freezetime: { label: "Freezetime", tone: "brass" },
  live: { label: "Em andamento", tone: "live" },
  bomb: { label: "Bomba plantada", tone: "danger" },
  halftime: { label: "Intervalo", tone: "brass" },
  ended: { label: "Encerrada", tone: "neutral" },
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
  const phase = PHASE[match.phase] ?? PHASE.live!;

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-line-soft bg-base/90 px-3 backdrop-blur-md sm:px-4">
      {/* Fio de assinatura — o mesmo latão usado em todo cabeçalho de painel,
          só que aqui na barra que aparece em toda rota, não só uma vez. */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brass/40 to-transparent"
        aria-hidden="true"
      />

      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Abrir navegação"
        className="grid size-9 shrink-0 place-items-center rounded-xs border border-line-soft text-ink-3 transition-colors hover:text-ink lg:hidden"
      >
        <Menu className="size-4" />
      </button>

      {/* Identificação — uma placa só, não fragmentos soltos com pipes. */}
      <div className="flex min-w-0 items-center gap-2 rounded-xs border border-line-soft bg-panel-2/50 py-1 pl-1.5 pr-2.5">
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
        {primary ? (
          <>
            <span className="hidden h-3 w-px bg-line/70 md:block" aria-hidden="true" />
            <span className="t-num hidden truncate text-[11px] text-ink-2 md:block">
              {primary.name}
            </span>
          </>
        ) : null}
      </div>

      {/* Placar — a mesma composição brasão+número+brasão do placar ao vivo,
          só em miniatura, pra ler como o MESMO placar em qualquer lugar do
          site em vez de um widget de dashboard reinventado aqui. */}
      <div className="flex min-w-0 flex-1 items-center justify-center gap-2 sm:gap-3">
        <span className="t-title hidden truncate text-[11px] text-ink-3 lg:block">
          {mapLabel(match.map)}
        </span>

        <div className="flex items-center gap-2 rounded-xs border border-line-soft bg-panel-2/60 px-2.5 py-1">
          <TeamCrest team="CT" className="size-4 shrink-0" />
          <span ref={ctRef} className="t-display text-[16px] tabular-nums text-ct">
            {match.ctScore}
          </span>
          <span className="text-[11px] text-ink-4">:</span>
          <span ref={tRef} className="t-display text-[16px] tabular-nums text-t">
            {match.tScore}
          </span>
          <TeamCrest team="T" className="size-4 shrink-0" />

          <span className="mx-0.5 hidden h-3 w-px bg-line/70 sm:block" aria-hidden="true" />

          <span className="hidden items-baseline gap-1 sm:flex">
            <Timer className={cn("size-3", urgent ? "text-brass-ember" : "text-ink-4")} />
            <span
              className={cn(
                "t-num text-[11px] tabular-nums transition-colors",
                urgent ? "text-brass-ember" : "text-ink-2",
              )}
            >
              {formatClock(match.clock)}
            </span>
          </span>
        </div>

        <Badge tone={phase.tone === "neutral" ? "neutral" : phase.tone} className="hidden lg:inline-flex">
          {match.phase === "bomb" ? <Bomb className="size-2.5" /> : null}
          R{match.round} · {phase.label}
        </Badge>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {primary ? (
          <span className="t-num hidden text-[11px] text-ink-2 md:block">
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
