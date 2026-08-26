import type { RealServer } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatDuration, mapLabel } from "@/lib/format";
import { copyText } from "@/lib/clipboard";
import { Copy } from "lucide-react";
import { Meter } from "@/components/ui/Meter";
import { PulseDot } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";

function Row({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-baseline gap-2 py-1.5", className)}>
      <span className="t-eyebrow shrink-0 text-[9px] text-ink-4">{label}</span>
      <span className="leader min-w-4 flex-1" aria-hidden="true" />
      <span className="t-num min-w-0 shrink-0 text-[13px] text-ink">{children}</span>
    </div>
  );
}

/**
 * Mesma leitura em estilo console do `ServerStatus` mock, mas alimentada
 * pelo `RealServer` (HLstatsX) — sem ping, região ou uptime de processo,
 * campos que essa fonte não expõe.
 */
export function RealServerStatus({
  server,
  className,
}: {
  server: RealServer;
  className?: string;
}) {
  const toast = useToast();
  const address = `${server.host}:${server.port}`;

  async function copyAddress() {
    const ok = await copyText(address);
    if (ok) toast.success("Endereço copiado", address);
    else toast.error("Não foi possível copiar o endereço");
  }

  return (
    <div className={cn("panel overflow-hidden", className)}>
      <div className="flex items-center gap-2 border-b border-line-soft px-4 py-2">
        <PulseDot tone="live" />
        <span className="t-num text-[11px] text-ink-3">status</span>
        <span className="t-num truncate text-[11px] text-ink-4">· {server.name}</span>
      </div>

      <div className="grid gap-x-8 px-4 py-2.5 font-mono sm:grid-cols-2 xl:grid-cols-3">
        <Row label="status">
          <span className="text-live">online</span>
        </Row>

        <Row label="map">{mapLabel(server.map)}</Row>

        <Row label="players">
          {server.players}
          <span className="text-ink-4">/{server.maxPlayers}</span>
        </Row>

        {server.mapPlaytimeSeconds !== null ? (
          <Row label="no mapa">{formatDuration(server.mapPlaytimeSeconds)}</Row>
        ) : null}

        <button type="button" onClick={copyAddress} className="group text-left">
          <Row label="connect" className="group-hover:[&_.leader]:border-brass/50">
            <span className="inline-flex items-center gap-1.5 text-ink-2 group-hover:text-brass">
              {address}
              <Copy className="size-3 shrink-0" />
            </span>
          </Row>
        </button>
      </div>

      <div className="border-t border-line-soft px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="t-eyebrow text-[8.5px] text-ink-4">Lotação</span>
          <span className="t-num text-[10.5px] text-ink-3">
            {server.players} / {server.maxPlayers}
          </span>
        </div>
        <Meter value={server.players} max={server.maxPlayers} height={3} className="mt-1.5" />
      </div>
    </div>
  );
}
