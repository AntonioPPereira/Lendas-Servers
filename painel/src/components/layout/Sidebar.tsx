import { NavLink } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/cn";
import { config } from "@/lib/config";
import { mapLabel } from "@/lib/format";
import { useRealServers, pickPrimaryServer } from "@/hooks/useRealServers";
import { NAV_GROUPS } from "./nav";
import { BrandMark } from "./BrandMark";
import { Meter } from "@/components/ui/Meter";
import { PulseDot } from "@/components/ui/Badge";
import { RealConnectButton } from "@/components/server/RealConnectButton";

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNavigate?: () => void;
  className?: string;
}

export function Sidebar({ collapsed, onToggleCollapse, onNavigate, className }: SidebarProps) {
  const realServers = useRealServers();
  const servers = realServers.data ?? [];
  const primary = pickPrimaryServer(servers);
  const onlinePlayers = servers.reduce((total, server) => total + server.players, 0);

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-line-soft bg-panel/80 backdrop-blur-sm",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-14 shrink-0 items-center gap-2.5 border-b border-line-soft",
          collapsed ? "justify-center px-2" : "px-4",
        )}
      >
        <BrandMark className="size-9" />
        {collapsed ? null : (
          <div className="min-w-0">
            <p className="t-display text-[15px] leading-none text-ink">{config.brand.name}</p>
            <p className="t-eyebrow mt-1 text-[9px] text-ink-4">{config.brand.suffix}</p>
          </div>
        )}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-5 last:mb-0">
            {collapsed ? (
              <div className="mx-auto mb-2 h-px w-6 bg-line-soft" />
            ) : (
              <p
                className={cn(
                  "t-eyebrow px-4 pb-2 text-[9.5px]",
                  group.label === "Ao vivo" ? "text-live/80" : "text-ink-3",
                )}
              >
                {group.label}
              </p>
            )}

            <ul className={cn("space-y-0.5", collapsed ? "px-2" : "px-2")}>
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        "group relative flex h-10 items-center rounded-xs text-[13.5px] transition-colors duration-150",
                        collapsed ? "justify-center px-0" : "gap-2.5 px-2.5",
                        isActive
                          ? "bg-raised/80 text-ink"
                          : "text-ink-2 hover:bg-raised/45 hover:text-ink",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={cn(
                            "absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-brass transition-transform duration-200",
                            isActive ? "scale-y-100" : "scale-y-0",
                          )}
                          aria-hidden="true"
                        />
                        <item.icon
                          className={cn(
                            "size-[18px] shrink-0 transition-colors",
                            isActive ? "text-brass" : "text-ink-3 group-hover:text-ink-2",
                          )}
                        />
                        {collapsed ? null : (
                          <span className={cn("truncate", item.maintenance && "text-ink-3")}>
                            {item.label}
                          </span>
                        )}
                        {item.live && !collapsed ? (
                          <span className="t-num ml-auto text-[10.5px] text-ink-3">
                            {onlinePlayers}
                          </span>
                        ) : null}
                        {/* Seção em obra: a marca fica no menu pra ninguém
                            descobrir só depois de clicar. Recolhido não cabe
                            texto, então vira um ponto no lugar do ícone. */}
                        {item.maintenance && !collapsed ? (
                          <span className="t-eyebrow ml-auto shrink-0 rounded-xs border border-warn/25 bg-warn/10 px-1.5 py-0.5 text-[8.5px] text-warn">
                            Obra
                          </span>
                        ) : null}
                        {item.maintenance && collapsed ? (
                          <span
                            className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-warn/70"
                            aria-hidden="true"
                          />
                        ) : null}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-line-soft p-2">
        {!primary ? null : collapsed ? (
          <div className="flex flex-col items-center gap-2 py-1">
            <PulseDot />
            <span className="t-num text-[10px] text-ink-3">{primary.players}</span>
          </div>
        ) : (
          <div className="rounded-xs border border-line-soft bg-panel-2/60 p-3">
            <div className="flex items-center gap-2">
              <PulseDot />
              <p className="t-eyebrow truncate text-[9px] text-ink-3">{primary.name}</p>
              <span className="t-num ml-auto shrink-0 text-[10.5px] text-ink-2">
                {primary.players}/{primary.maxPlayers}
              </span>
            </div>
            <p className="t-title mt-2 text-[12px] text-ink">{mapLabel(primary.map)}</p>
            <Meter
              value={primary.players}
              max={primary.maxPlayers}
              tone="brass"
              className="mt-2"
              height={3}
            />
            <RealConnectButton
              host={primary.host}
              port={primary.port}
              size="sm"
              block
              className="mt-3"
            />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-line-soft p-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          className={cn(
            "mt-px hidden h-8 w-full items-center rounded-xs text-[11.5px] text-ink-4 transition-colors hover:text-ink-2 lg:flex",
            collapsed ? "justify-center" : "gap-2.5 px-2.5",
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <>
              <PanelLeftClose className="size-4" />
              <span>Recolher</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
