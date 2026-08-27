import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Clapperboard } from "lucide-react";
import { usePageEnter } from "@/hooks/useGsap";
import { useResource } from "@/hooks/useResource";
import { api } from "@/api/client";
import type { MatchDetail as MatchModel } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatDateTime, formatDuration, mapLabel, mapPrefix } from "@/lib/format";
import { roundsWonBy } from "@/data/matches";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { RoundStrip, RoundStripLegend } from "@/components/match/RoundStrip";
import { Scoreboard } from "@/components/match/Scoreboard";
import { PlayerAvatar } from "@/components/player/PlayerAvatar";
import { SplitBar } from "@/components/charts/Bars";

export default function MatchDetail() {
  const { id = "" } = useParams();
  const scope = usePageEnter<HTMLDivElement>();
  const resource = useResource<MatchModel>(["match", id], () => api.match(id));

  if (resource.status === "error") {
    return (
      <Panel>
        <ErrorState
          title="Partida não encontrada"
          hint="O identificador pode estar incorreto ou a partida saiu do arquivo."
          onRetry={resource.reload}
        />
      </Panel>
    );
  }

  if (!resource.data) {
    return (
      <Panel>
        <LoadingState label="Carregando partida" />
      </Panel>
    );
  }

  const match = resource.data;
  const ctWon = match.winner === "CT";
  const bombRounds = match.rounds.filter((r) => r.reason === "bomb").length;
  const defuseRounds = match.rounds.filter((r) => r.reason === "defuse").length;

  return (
    <div ref={scope} className="space-y-5">
      <div data-enter className="flex flex-wrap items-center gap-3">
        <Link
          to="/partidas"
          className="t-eyebrow flex items-center gap-1.5 text-[9px] text-ink-3 transition-colors hover:text-brass"
        >
          <ArrowLeft className="size-3.5" />
          Histórico
        </Link>
        <span className="t-num text-[10.5px] text-ink-4">/ {match.id}</span>
      </div>

      <div data-enter>
        <Panel hud className="overflow-hidden">
          <PanelHeader label="Partida encerrada" accent="brass" hint={mapPrefix(match.map)} />

          <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:p-5">
            <div className="min-w-0">
              <h1 className="t-display text-[32px] text-ink sm:text-[40px]">{mapLabel(match.map)}</h1>
              <p className="t-num mt-2 text-[11.5px] text-ink-4">
                {formatDateTime(match.playedAt)} · {match.serverName} ·{" "}
                {formatDuration(match.durationSec)} · {match.playersCount} jogadores
              </p>

              <div className="mt-5 flex items-baseline gap-3">
                <span className={cn("t-display text-[42px] tabular-nums", ctWon ? "text-ct" : "text-ct/40")}>
                  {match.ctScore}
                </span>
                <span className="t-display text-[20px] text-ink-4">:</span>
                <span className={cn("t-display text-[42px] tabular-nums", ctWon ? "text-t/40" : "text-t")}>
                  {match.tScore}
                </span>
                <Badge tone={ctWon ? "ct" : "t"} className="ml-2">
                  {ctWon ? "CT venceu" : "T venceu"}
                </Badge>
              </div>

              <div className="mt-5">
                <RoundStrip rounds={match.rounds} maxRounds={match.rounds.length} />
                <RoundStripLegend className="mt-2.5" />
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xs border border-line-soft bg-panel-2/50 p-3.5">
                <p className="t-eyebrow text-brass">MVP</p>
                <Link
                  to={"/jogadores/" + match.mvp.steamId64}
                  className="mt-2.5 flex items-center gap-3 transition-opacity hover:opacity-80"
                >
                  <PlayerAvatar seed={match.mvp.avatarSeed} nickname={match.mvp.nickname} size="md" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-medium text-ink">
                      {match.mvp.nickname}
                    </span>
                    <span className="t-num block truncate text-[10px] text-ink-4">
                      {match.mvp.steamId}
                    </span>
                  </span>
                </Link>
              </div>

              <SplitBar
                left={{ label: "Rodadas CT", value: roundsWonBy(match.rounds, "CT") }}
                right={{ label: "Rodadas T", value: roundsWonBy(match.rounds, "T") }}
              />

              {match.demoId ? (
                <LinkButton to={"/demos/" + match.demoId} icon={<Clapperboard />} block variant="primary">
                  Abrir demo
                </LinkButton>
              ) : (
                <p className="t-num rounded-xs border border-dashed border-line px-3 py-2.5 text-center text-[11px] text-ink-4">
                  Sem gravação para esta partida
                </p>
              )}
            </div>
          </div>

          <dl className="grid gap-px border-t border-line-soft bg-line-soft/50 sm:grid-cols-4">
            <Meta label="Rodadas jogadas" value={String(match.rounds.length)} />
            <Meta label="Bombas explodidas" value={String(bombRounds)} />
            <Meta label="Desarmes" value={String(defuseRounds)} />
            <Meta label="Duração" value={formatDuration(match.durationSec)} />
          </dl>
        </Panel>
      </div>

      <div data-enter>
        <Panel className="overflow-hidden">
          <PanelHeader label="Placar final" accent="ct" />
          <Scoreboard
            players={match.scoreboard}
            ctScore={match.ctScore}
            tScore={match.tScore}
            final
          />
        </Panel>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-panel px-4 py-3">
      <dt className="t-eyebrow text-[8.5px]">{label}</dt>
      <dd className="t-num mt-1.5 text-[13px] text-ink-2">{value}</dd>
    </div>
  );
}
