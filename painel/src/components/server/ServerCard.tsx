import { Timer, Users } from "lucide-react";
import type { RealServer } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatDuration, mapLabel } from "@/lib/format";
import { mapBackground } from "@/lib/csAssets";
import { Badge, PulseDot } from "@/components/ui/Badge";
import { Meter } from "@/components/ui/Meter";
import { RealConnectButton } from "./RealConnectButton";

export function ServerCard({ server, className }: { server: RealServer; className?: string }) {
  const full = server.players >= server.maxPlayers;
  const backdrop = mapBackground(server.map);

  return (
    <article
      className={cn(
        "panel group flex flex-col overflow-hidden",
        "transition-[border-color,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "hover:-translate-y-0.5 hover:border-line",
        className,
      )}
    >
      {/* Mesma placa de identificação por foto do mapa dos cards de demo —
          o mapa deixa de ser só texto, aparece de verdade quando existe. */}
      <div className="relative h-28 shrink-0 overflow-hidden bg-abyss">
        {backdrop ? (
          <img
            src={backdrop}
            alt=""
            draggable={false}
            className="absolute inset-0 size-full select-none object-cover [filter:contrast(1.05)_saturate(1.15)]"
          />
        ) : (
          <span className="t-display absolute -right-1 -top-2 select-none text-[64px] leading-none text-ink opacity-[0.06]">
            {mapLabel(server.map)}
          </span>
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgb(4 4 3 / 0.6) 0%, transparent 24%, transparent 45%, var(--color-abyss) 96%)",
          }}
        />
        <div className="relative z-10 flex h-full flex-col justify-between p-3">
          <div className="flex items-start gap-2">
            <PulseDot tone="live" className="mt-1 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="t-title truncate text-[12px] text-ink">{server.name}</p>
              <p className="t-num truncate text-[9.5px] text-ink-3">
                {server.host}:{server.port}
              </p>
            </div>
            <Badge tone="live" className="shrink-0">
              Online
            </Badge>
          </div>
          <p className="t-display truncate text-[19px] text-ink">{mapLabel(server.map)}</p>
        </div>
      </div>

      <div className="px-4 py-3.5">
        <div className="flex items-center gap-2">
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
