import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Trophy } from "lucide-react";
import { usePageEnter } from "@/hooks/useGsap";
import { useResource } from "@/hooks/useResource";
import { api } from "@/api/client";
import type { RankedPlayer } from "@/data/types";
import { formatDecimal, formatNumber, formatPercent, formatPlaytime } from "@/lib/format";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { Meter } from "@/components/ui/Meter";
import { StatCard } from "@/components/ui/StatCard";
import { PlayerAvatar } from "@/components/player/PlayerAvatar";

export default function PlayerProfile() {
  const { id = "" } = useParams();
  const scope = usePageEnter<HTMLDivElement>();
  const resource = useResource<RankedPlayer>(() => api.player(id), [id]);

  if (resource.status === "error") {
    return (
      <Panel>
        <ErrorState
          title="Jogador não encontrado"
          hint="Confira o link ou procure pelo nickname no diretório."
          onRetry={resource.reload}
        />
      </Panel>
    );
  }

  if (!resource.data) {
    return (
      <Panel>
        <LoadingState label="Carregando perfil" />
      </Panel>
    );
  }

  const player = resource.data;
  const kd = player.kd ?? 0;
  const accuracy = player.accuracy ?? 0;
  const hsRate = player.hsRate ?? 0;

  return (
    <div ref={scope} className="space-y-5">
      <div data-enter className="flex flex-wrap items-center gap-3">
        <Link
          to="/jogadores"
          className="t-eyebrow flex items-center gap-1.5 text-[9px] text-ink-3 transition-colors hover:text-brass"
        >
          <ArrowLeft className="size-3.5" />
          Jogadores
        </Link>
        <span className="t-num text-[10.5px] text-ink-4">/ HLstatsX #{player.id}</span>
      </div>

      <div data-enter>
        <Panel className="overflow-hidden">
          <div className="flex flex-col gap-5 p-4 sm:flex-row sm:items-center sm:p-5">
            <PlayerAvatar seed={player.id} nickname={player.nickname} avatarUrl={player.avatarUrl} size="xl" />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="t-display text-[28px] text-ink sm:text-[34px]">{player.nickname}</h1>
                <Badge tone="neutral">{player.country?.name ?? "País desconhecido"}</Badge>
              </div>

              <p className="t-num mt-2 text-[11.5px] text-ink-4">
                ID interno do HLstatsX: {player.id} — esta instalação não expõe Steam ID de forma
                confiável (ver nota abaixo)
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
              <div className="flex items-center gap-2">
                <Trophy className={cnRank(player.rank)} />
                <span className="t-display text-[26px] text-ink">#{player.rank}</span>
                <span className="t-eyebrow text-[9px]">no ranking</span>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div data-enter className="grid gap-3 grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard label="Skill" value={player.skill} tone="brass" />
        <StatCard label="K/D" value={kd} format={(v) => formatDecimal(v)} />
        <StatCard label="Kills" value={player.kills} />
        <StatCard label="Deaths" value={player.deaths} />
        <StatCard label="Precisão" value={accuracy} format={(v) => formatPercent(v, 1)} />
        <StatCard
          label="Conexão"
          value={player.connectionTimeMinutes ?? 0}
          format={(v) => formatPlaytime(v)}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div data-enter className="min-w-0">
          <Panel className="overflow-hidden">
            <PanelHeader label="Histórico de partidas" accent="ct" />
            <div className="p-5 text-center">
              <p className="t-title text-[13px] text-ink-2">Dado não disponível</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-ink-4">
                O HLstatsX desta instalação não expõe histórico de partidas por jogador — só
                estatísticas acumuladas. Isso exigiria o plugin SourceMod (reportando cada partida
                ao vivo) ou um parser de demo, nenhum dos dois implementado ainda.
              </p>
            </div>
          </Panel>
        </div>

        <div data-enter className="min-w-0 space-y-5">
          <Panel className="overflow-hidden">
            <PanelHeader label="Mapas favoritos" accent="brass" />
            <div className="p-5 text-center">
              <p className="t-title text-[13px] text-ink-2">Dado não disponível</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-ink-4">
                O HLstatsX não expõe um recorte de estatísticas por mapa por jogador nesta
                instalação.
              </p>
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader label="Desempenho" accent="ct" />
            <div className="space-y-4 p-4">
              <Ratio
                label="Precisão"
                value={accuracy}
                hint={formatPercent(accuracy, 1) + " de acerto nos tiros"}
              />
              <Ratio
                label="Headshots por abate"
                value={hsRate * 100}
                hint={formatNumber(player.headshots) + " de " + formatNumber(player.kills)}
                tone="ct"
              />

              <dl className="grid grid-cols-2 gap-4 border-t border-line-soft pt-4">
                <Fact label="País" value={player.country?.name ?? "Desconhecido"} />
                <Fact label="ID HLstatsX" value={player.id} />
                <Fact label="Kills" value={formatNumber(player.kills)} />
                <Fact label="Mortes" value={formatNumber(player.deaths)} />
                <Fact label="Headshots" value={formatNumber(player.headshots)} />
                <Fact label="Tempo de conexão" value={formatPlaytime(player.connectionTimeMinutes ?? 0)} />
              </dl>
            </div>
          </Panel>

          <LinkButton to="/ranking" block>
            Ver posição no ranking
          </LinkButton>
        </div>
      </div>
    </div>
  );
}

function cnRank(rank: number): string {
  return rank <= 3 ? "size-4 text-brass" : "size-4 text-ink-4";
}

function Ratio({
  label,
  value,
  hint,
  tone = "brass",
}: {
  label: string;
  value: number;
  hint: string;
  tone?: "brass" | "ct";
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="t-eyebrow text-[8.5px]">{label}</span>
        <span className="t-num text-[12.5px] tabular-nums text-ink">{formatPercent(value, 1)}</span>
      </div>
      <Meter value={value} max={100} height={3} tone={tone} className="mt-1.5" />
      <p className="t-num mt-1 text-[10px] text-ink-4">{hint}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="t-eyebrow text-[8.5px]">{label}</dt>
      <dd className="t-num mt-1 text-[12.5px] text-ink-2">{value}</dd>
    </div>
  );
}
