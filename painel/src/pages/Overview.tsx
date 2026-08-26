import { Link } from "react-router-dom";
import { ArrowUpRight, Trophy } from "lucide-react";
import { usePageEnter } from "@/hooks/useGsap";
import { useConnection, useLiveMatch } from "@/realtime/store";
import { useRealServers, pickPrimaryServer } from "@/hooks/useRealServers";
import { useRealActivity } from "@/hooks/useRealActivity";
import { PLAYERS, kd } from "@/data/players";
import { MATCHES } from "@/data/matches";
import { formatDecimal, formatNumber } from "@/lib/format";
import { SectionTitle, Panel, PanelHeader } from "@/components/ui/Panel";
import { LinkButton } from "@/components/ui/Button";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { RealServerStatus } from "@/components/server/RealServerStatus";
import { LiveMatch } from "@/components/match/LiveMatch";
import { Scoreboard } from "@/components/match/Scoreboard";
import { RoundStrip } from "@/components/match/RoundStrip";
import { ActivityTimeline } from "@/components/activity/ActivityTimeline";
import { MatchCard } from "@/components/match/MatchCard";
import { PlayerAvatar } from "@/components/player/PlayerAvatar";

export default function Overview() {
  const scope = usePageEnter<HTMLDivElement>();
  const match = useLiveMatch();
  const realServers = useRealServers();
  const primaryServer = pickPrimaryServer(realServers.data ?? []);
  const activity = useRealActivity();
  const connection = useConnection();

  const topPlayers = PLAYERS.slice(0, 5);
  const recentMatches = MATCHES.slice(0, 4);
  const booting = connection === "connecting";

  return (
    <div ref={scope} className="space-y-5">
      <div data-enter>
        <SectionTitle
          eyebrow="Central do servidor"
          title="Visão geral"
          description="Tudo que está acontecendo na rede Lendas agora: status dos servidores, a partida em andamento e o que a comunidade acabou de fazer."
          actions={
            <LinkButton to="/servidores" trailing={<ArrowUpRight />}>
              Ver servidores
            </LinkButton>
          }
        />
      </div>

      <div data-enter>
        {realServers.status === "error" ? (
          <Panel>
            <PanelHeader label="Status do servidor" accent="brass" />
            <ErrorState
              title="Não foi possível carregar o status do servidor"
              hint="O HLstatsX não respondeu. Tente novamente em alguns segundos."
              onRetry={realServers.reload}
            />
          </Panel>
        ) : primaryServer ? (
          <RealServerStatus server={primaryServer} />
        ) : (
          <Panel>
            <PanelHeader label="Status do servidor" accent="brass" />
            <LoadingState label="Consultando HLstatsX" />
          </Panel>
        )}
      </div>

      <div data-enter>
        {booting ? (
          <Panel>
            <PanelHeader label="Partida ao vivo" accent="brass" />
            <LoadingState label="Sincronizando com o servidor" />
          </Panel>
        ) : (
          <LiveMatch match={match} />
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div data-enter className="min-w-0">
          <Panel className="overflow-hidden">
            <PanelHeader
              label="Placar ao vivo"
              accent="ct"
              hint={match.players.length + " conectados"}
            />
            <Scoreboard
              players={match.players}
              ctScore={match.ctScore}
              tScore={match.tScore}
            />
            <div className="border-t border-line-soft px-4 py-3.5 sm:px-5">
              <p className="t-eyebrow mb-2 text-[8.5px]">Rodadas</p>
              <RoundStrip rounds={match.rounds} maxRounds={match.maxRounds} />
            </div>
          </Panel>
        </div>

        <div data-enter className="min-w-0">
          <Panel className="flex h-full flex-col overflow-hidden">
            <PanelHeader
              label="Atividade ao vivo"
              accent="brass"
              actions={
                <Link
                  to="/atividade"
                  className="t-eyebrow text-[9px] text-ink-3 transition-colors hover:text-brass"
                >
                  Ver tudo
                </Link>
              }
            />
            <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-2">
              {activity.status === "error" ? (
                <ErrorState
                  title="Atividade indisponível"
                  hint="O servidor de arquivos (SFTP) está fora do ar no momento."
                  onRetry={activity.reload}
                  className="py-8"
                />
              ) : activity.status === "loading" && !activity.data ? (
                <LoadingState label="Consultando o filtro de requisitos" className="py-8" />
              ) : (
                <ActivityTimeline events={activity.data ?? []} limit={14} />
              )}
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div data-enter className="min-w-0">
          <Panel className="overflow-hidden">
            <PanelHeader
              label="Topo da comunidade"
              accent="brass"
              actions={
                <Link
                  to="/ranking"
                  className="t-eyebrow text-[9px] text-ink-3 transition-colors hover:text-brass"
                >
                  Ranking completo
                </Link>
              }
            />
            <ul className="divide-y divide-line-soft">
              {topPlayers.map((player) => (
                <li key={player.steamId64}>
                  <Link
                    to={"/jogadores/" + player.steamId64}
                    className="row-interactive flex items-center gap-3 px-4 py-2.5"
                  >
                    <span
                      className={
                        "t-num w-6 text-[12px] " +
                        (player.rank === 1 ? "text-brass" : "text-ink-4")
                      }
                    >
                      {String(player.rank).padStart(2, "0")}
                    </span>
                    {player.rank === 1 ? (
                      <Trophy className="size-3.5 shrink-0 text-brass" />
                    ) : null}
                    <PlayerAvatar
                      seed={player.avatarSeed}
                      nickname={player.nickname}
                      size="sm"
                      online={player.online}
                    />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                      {player.nickname}
                    </span>
                    <span className="t-num text-[11.5px] text-ink-3">
                      {formatDecimal(kd(player.stats))} K/D
                    </span>
                    <span className="t-num w-16 text-right text-[12px] text-ink-2">
                      {formatNumber(player.rating)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div data-enter className="min-w-0 space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="t-eyebrow">Últimas partidas</h2>
            <Link
              to="/partidas"
              className="t-eyebrow text-[9px] text-ink-3 transition-colors hover:text-brass"
            >
              Histórico
            </Link>
          </div>
          {recentMatches.map((entry) => (
            <MatchCard key={entry.id} match={entry} />
          ))}
        </div>
      </div>
    </div>
  );
}
