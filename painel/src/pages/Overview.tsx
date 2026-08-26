import { Link } from "react-router-dom";
import { ArrowUpRight, Trophy } from "lucide-react";
import { usePageEnter } from "@/hooks/useGsap";
import { useConnection, useLiveMatch } from "@/realtime/store";
import { useResource } from "@/hooks/useResource";
import { api, type Page } from "@/api/client";
import type { RankedPlayer } from "@/data/types";
import { useRealActivity } from "@/hooks/useRealActivity";
import { cn } from "@/lib/cn";
import { asset } from "@/lib/csAssets";
import { formatDecimal, formatNumber } from "@/lib/format";
import { LinkButton } from "@/components/ui/Button";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/States";
import { LiveMatch } from "@/components/match/LiveMatch";
import { Scoreboard } from "@/components/match/Scoreboard";
import { RoundStrip } from "@/components/match/RoundStrip";
import { ActivityTimeline } from "@/components/activity/ActivityTimeline";
import { PlayerAvatar } from "@/components/player/PlayerAvatar";

/** Referência estável — evita recriar array a cada render sem dado ainda. */
const EMPTY_TOP: RankedPlayer[] = [];

export default function Overview() {
  const scope = usePageEnter<HTMLDivElement>();
  const match = useLiveMatch();
  const activity = useRealActivity();
  const connection = useConnection();
  // Top 10 fechado: número redondo que a comunidade entende de cara, e
  // preenche a coluna ao lado da Atividade (que rola bem mais longa) sem
  // deixar o painel oco embaixo.
  const topRanking = useResource<Page<RankedPlayer>>(() => api.ranking({ page: 1, pageSize: 10 }), []);
  const topPlayers = topRanking.data?.items ?? EMPTY_TOP;

  const booting = connection === "connecting";

  return (
    <div ref={scope} className="space-y-6">
      {/* Abertura enxuta — sem parágrafo de boilerplate nem uma caixa de
          status separada repetindo o que o topo e a sidebar já mostram. A
          partida ao vivo é a primeira coisa de peso na tela, não a terceira. */}
      <div data-enter className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="t-eyebrow text-brass">Central do servidor</p>
          <h1 className="t-display mt-1 text-[26px] text-ink sm:text-[30px]">Visão geral</h1>
        </div>
        <LinkButton to="/servidores" trailing={<ArrowUpRight />}>
          Ver servidores
        </LinkButton>
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

        {/* Cartaz da rede, ao lado do placar. Leva ao Ranking porque é
            exatamente o que ele anuncia — a premiação do topo. */}
        <div data-enter className="relative min-w-0">
          <span
            aria-hidden="true"
            className="brand-aura pointer-events-none absolute -inset-8 rounded-lg blur-3xl"
          />
          <Link
            to="/ranking"
            className="brand-banner panel group relative block h-full overflow-hidden p-0"
          >
            <img
              src={asset("/brand/lendas-premium.jpg")}
              alt="LENDASCS, Counter-Strike: Source — premiação de R$ 50,00 para quem estiver no topo do rank."
              draggable={false}
              className="size-full select-none object-cover transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.02]"
            />
            <span aria-hidden="true" className="brand-sweep pointer-events-none absolute inset-0 rounded-md" />
          </Link>
        </div>
      </div>

      {/* "Últimas partidas" morava na coluna da direita aqui, alimentado por
          MATCHES (dado gerado). Saiu junto com a rota de Partidas indo pra
          manutenção — a Visão geral é a primeira tela que alguém vê, e não
          podia ser justamente ela a mostrar placar inventado. A Atividade
          desceu pro lugar dele, e o Topo passou a fechar a coluna do placar. */}
      {/* Quem manda na altura desta linha é o Topo, que tem altura fixa (10
          linhas). A Atividade é longa e variável, então a coluna dela sai do
          fluxo no xl (o filho vira absolute) e não empurra a linha pra
          baixo — ela passa a preencher exatamente a altura do Topo e rola
          por dentro. É isso que deixa os dois painéis terminando na mesma
          linha sem nenhum vão morto, em vez de um esticar atrás do outro. */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div data-enter className="min-w-0">
          <Panel hud className="overflow-hidden">
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
            <div>
              {topRanking.status === "error" ? (
                <ErrorState
                  title="Ranking indisponível"
                  hint="O HLstatsX não respondeu."
                  onRetry={topRanking.reload}
                  className="py-8"
                />
              ) : topRanking.status === "loading" && topPlayers.length === 0 ? (
                <LoadingState label="Consultando HLstatsX" className="py-8" />
              ) : topPlayers.length === 0 ? (
                <EmptyState title="Nenhum jogador rankeado ainda" className="py-8" />
              ) : (
                <ul>
                  {topPlayers.map((player) => {
                    const ratio = player.kd ?? 0;
                    return (
                      <li key={player.id}>
                        <Link
                          to={"/jogadores/" + player.id}
                          className="row-interactive flex items-center gap-3 px-4 py-2.5"
                        >
                          <span
                            className={cn(
                              "t-num w-6 text-[12px]",
                              player.rank <= 3 ? "text-brass" : "text-ink-4",
                            )}
                          >
                            {String(player.rank).padStart(2, "0")}
                          </span>
                          {player.rank === 1 ? (
                            <Trophy className="size-3.5 shrink-0 text-brass" />
                          ) : null}
                          <PlayerAvatar seed={player.id} nickname={player.nickname} avatarUrl={player.avatarUrl} size="sm" />
                          <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                            {player.nickname}
                          </span>
                          <span
                            className={cn(
                              "t-num text-[11.5px]",
                              ratio >= 1.2 ? "text-brass" : ratio >= 1 ? "text-ink-2" : "text-ink-4",
                            )}
                          >
                            {formatDecimal(ratio)} K/D
                          </span>
                          <span className="t-num w-16 text-right text-[12px] text-ink">
                            {formatNumber(player.skill)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Panel>
        </div>

        <div data-enter className="relative min-w-0">
          <div className="xl:absolute xl:inset-0">
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
      </div>
    </div>
  );
}
