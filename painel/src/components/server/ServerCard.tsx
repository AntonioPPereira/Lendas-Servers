import { Timer, Users } from "lucide-react";
import type { RealServer } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatDuration, mapLabel, mapPrefix } from "@/lib/format";
import { Badge, PulseDot } from "@/components/ui/Badge";
import { Meter } from "@/components/ui/Meter";
import { RealConnectButton } from "./RealConnectButton";

export function ServerCard({ server, className }: { server: RealServer; className?: string }) {
  const full = server.players >= server.maxPlayers;

  return (
    <article
      className={cn(
        "panel group flex flex-col overflow-hidden",
        "transition-[border-color,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "hover:-translate-y-0.5 hover:border-line",
        className,
      )}
    >
      <header className="flex items-center gap-2.5 border-b border-line-soft px-4 py-3">
        <PulseDot tone="live" />
        <div className="min-w-0 flex-1">
          <h3 className="t-title truncate text-[12.5px] text-ink">{server.name}</h3>
          <p className="t-num mt-0.5 truncate text-[10px] text-ink-4">
            {server.host}:{server.port}
          </p>
        </div>
        <Badge tone="live">Online</Badge>
      </header>

      <div className="px-4 py-3.5">
        <p className="t-eyebrow text-[9px]">{mapPrefix(server.map)}</p>
        <p className="t-display mt-1 truncate text-[22px] text-ink">{mapLabel(server.map)}</p>

        <div className="mt-3 flex items-center gap-2">
          <Users className="size-3.5 shrink-0 text-ink-4" />
          <span className="t-num text-[12px] text-ink-2">
            {server.players}
            <span className="text-ink-4">/{server.maxPlayers}</span>
          </span>
          {full ? <Badge tone="warn">Lotado</Badge> : null}
        </div>
        <Meter
          value={server.players}
          max={server.maxPlayers}
          segments={server.maxPlayers > 16 ? 8 : 4}
          tone={full ? "danger" : "brass"}
          className="mt-2"
        />

        {server.mapPlaytimeSeconds !== null ? (
          <div className="mt-3 flex items-center gap-2 text-ink-4">
            <Timer className="size-3.5 shrink-0" />
            <span className="t-num text-[11px]">{formatDuration(server.mapPlaytimeSeconds)} neste mapa</span>
          </div>
        ) : null}
      </div>

      <div className="mt-auto border-t border-line-soft p-3">
        <RealConnectButton host={server.host} port={server.port} block />
      </div>
    </article>
  );
}
