import {
  Bomb,
  Clock,
  Crosshair,
  HardDrive,
  Skull,
  Swords,
  Target,
  Users,
} from "lucide-react";
import { usePageEnter, useScrollReveal } from "@/hooks/useGsap";
import { useResource } from "@/hooks/useResource";
import { api } from "@/api/client";
import type { NetworkStats } from "@/data/types";
import {
  formatBytes,
  formatCompact,
  formatDecimal,
  formatNumber,
  mapLabel,
} from "@/lib/format";
import { SectionTitle, Panel, PanelHeader } from "@/components/ui/Panel";
import { StatCard } from "@/components/ui/StatCard";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { TrendArea } from "@/components/charts/TrendArea";
import { BarColumns, RankedBars } from "@/components/charts/Bars";

export default function Stats() {
  const scope = usePageEnter<HTMLDivElement>();
  const revealScope = useScrollReveal<HTMLDivElement>();
  const resource = useResource<NetworkStats>(() => api.stats(), []);

  if (resource.status === "error") {
    return (
      <Panel>
        <ErrorState onRetry={resource.reload} />
      </Panel>
    );
  }

  if (!resource.data) {
    return (
      <Panel>
        <LoadingState label="Agregando estatísticas da rede" />
      </Panel>
    );
  }

  const stats = resource.data;

  return (
    <div ref={scope} className="space-y-5">
      <div data-enter>
        <SectionTitle
          eyebrow="Números da rede"
          title="Estatísticas"
          description="Tudo que a rede Lendas acumulou desde o primeiro servidor no ar. Os gráficos cobrem as últimas 24 horas e as duas últimas semanas."
        />
      </div>

      <div data-enter className="grid grid-cols-2 gap-3 lg:grid-cols-4 2xl:grid-cols-8">
        <StatCard label="Jogadores" value={stats.playersTotal} icon={<Users />} />
        <StatCard label="Online agora" value={stats.playersOnline} tone="brass" icon={<Users />} />
        <StatCard label="Partidas" value={stats.matches} icon={<Swords />} />
        <StatCard label="Rodadas" value={stats.rounds} icon={<Target />} />
        <StatCard label="Kills" value={stats.kills} icon={<Crosshair />} />
        <StatCard
          label="Headshots"
          value={stats.headshots}
          icon={<Skull />}
          hint={formatDecimal((stats.headshots / Math.max(1, stats.kills)) * 100, 1) + "% dos abates"}
        />
        <StatCard label="Bombas plantadas" value={stats.bombsPlanted} icon={<Bomb />} />
        <StatCard
          label="Horas no ar"
          value={stats.uptimeHours}
          icon={<Clock />}
          format={(v) => formatCompact(v)}
        />
      </div>

      <div ref={revealScope} className="space-y-5">
        <div data-reveal>
          <ChartFrame
            title="Jogadores conectados por hora"
            caption="Soma de todos os servidores da rede nas últimas 24 horas."
          >
            <TrendArea data={stats.playersByHour} unit="jogadores" tickEvery={3} />
          </ChartFrame>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <div data-reveal>
            <ChartFrame
              title="Partidas encerradas por dia"
              caption="Últimas duas semanas, todos os modos."
            >
              <BarColumns data={stats.matchesByDay} />
            </ChartFrame>
          </div>

          <div data-reveal>
            <ChartFrame title="Mapas mais jogados" caption="Partidas registradas por mapa.">
              <RankedBars data={stats.mapShare} labelFormat={mapLabel} />
            </ChartFrame>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div data-reveal>
            <ChartFrame title="Abates por arma" caption="Histórico completo da rede.">
              <RankedBars
                data={stats.weaponShare}
                format={formatCompact}
                labelFormat={(label) => label.toUpperCase()}
              />
            </ChartFrame>
          </div>

          <div data-reveal>
            <Panel className="h-full overflow-hidden">
              <PanelHeader label="Recordes" accent="brass" />
              <dl className="divide-y divide-line-soft">
                <Record
                  label="Mapa mais jogado"
                  value={mapLabel(stats.topMap.map)}
                  hint={formatNumber(stats.topMap.matches) + " partidas"}
                />
                <Record
                  label="Jogador mais ativo"
                  value={stats.mostActive.nickname}
                  hint={formatNumber(stats.mostActive.hours) + " horas conectado"}
                />
                <Record
                  label="Maior K/D"
                  value={stats.bestKd.nickname}
                  hint={formatDecimal(stats.bestKd.kd) + " de razao"}
                />
                <Record
                  label="Maior sequência de vitórias"
                  value={stats.longestStreak.nickname}
                  hint={stats.longestStreak.wins + " partidas seguidas"}
                />
                <Record
                  label="Armazenamento de demos"
                  value={formatBytes(stats.bytesStored)}
                  hint={formatNumber(stats.demosStored) + " arquivos"}
                  icon={<HardDrive />}
                />
              </dl>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}

function Record({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <dt className="t-eyebrow text-[8.5px]">{label}</dt>
        <dd className="mt-1.5 truncate text-[14px] font-medium text-ink">{value}</dd>
        <p className="t-num mt-0.5 text-[10.5px] text-ink-4">{hint}</p>
      </div>
      {icon ? <span className="shrink-0 text-ink-4 [&_svg]:size-4">{icon}</span> : null}
    </div>
  );
}
