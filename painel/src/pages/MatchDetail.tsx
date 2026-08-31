import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, Film } from "lucide-react";
import { usePageEnter } from "@/hooks/useGsap";
import { useResource } from "@/hooks/useResource";
import { api, demoDownloadUrl, type MatchDetailReal, type MatchPlayer } from "@/api/client";
import type { RoundResult } from "@/data/types";
import { formatBytes, formatDateTime, formatDuration, mapLabel } from "@/lib/format";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { LinkButton } from "@/components/ui/Button";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { MapIcon } from "@/components/match/MapIcon";
import { RoundTimeline } from "@/components/match/RoundTimeline";
import { PlayerAvatar } from "@/components/player/PlayerAvatar";
import { cn } from "@/lib/cn";

export default function MatchDetail() {
  const { id = "" } = useParams();
  const scope = usePageEnter<HTMLDivElement>();
  const resource = useResource<MatchDetailReal>(["partida", id], () => api.match(id));

  if (resource.status === "error") {
    return (
      <Panel>
        <ErrorState
          title="Partida não encontrada"
          hint="O arquivo cobre as partidas registradas pelo servidor. Confira o link."
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

  const partida = resource.data;
  const ct = partida.players.filter((p) => p.team === "CT");
  const t = partida.players.filter((p) => p.team === "T");
  /**
   * Quem terminou no espectador não pertence a nenhum dos dois lados, mas
   * jogou — entra numa seção própria em vez de ser jogado num time onde
   * não estava.
   */
  const spec = partida.players.filter((p) => p.team === "SPEC");

  return (
    <div ref={scope} className="space-y-5">
      <div data-enter>
        <Link
          to="/partidas"
          className="t-eyebrow inline-flex items-center gap-1.5 text-[9px] text-ink-3 transition-colors hover:text-brass"
        >
          <ArrowLeft className="size-3.5" />
          Partidas
        </Link>
      </div>

      <div data-enter>
        <Panel className="overflow-hidden">
          <div className="flex flex-col gap-5 p-4 sm:flex-row sm:items-center sm:p-5">
            <MapIcon map={partida.map} className="size-16 shrink-0 rounded-sm" decorative />

            <div className="min-w-0 flex-1">
              <h1 className="t-display text-[26px] text-ink sm:text-[30px]">
                {mapLabel(partida.map)}
              </h1>
              <p className="t-num mt-1.5 text-[11.5px] text-ink-3">
                {formatDateTime(partida.startedAt)}
                {partida.endedAt ? " · durou " + duracao(partida) : ""}
              </p>
            </div>

            {/* O placar é o herói da tela: é o que a pessoa veio ver. */}
            <div className="flex shrink-0 items-center gap-4">
              <Lado rotulo="CT" valor={partida.ctScore ?? 0} venceu={(partida.ctScore ?? 0) >= (partida.tScore ?? 0)} tone="ct" />
              <span className="t-display text-[20px] text-ink-4">×</span>
              <Lado rotulo="TR" valor={partida.tScore ?? 0} venceu={(partida.tScore ?? 0) >= (partida.ctScore ?? 0)} tone="t" />
            </div>
          </div>

          {partida.demo ? (
            <div className="flex flex-wrap items-center gap-3 border-t border-line-soft px-4 py-3 sm:px-5">
              <Film className="size-4 text-ink-4" />
              <span className="t-num min-w-0 flex-1 truncate text-[12px] text-ink-3">
                {partida.demo.filename} · {formatBytes(partida.demo.size)}
              </span>
              <LinkButton to={demoDownloadUrl(partida.demo.id)} size="sm">
                <Download className="size-3.5" />
                Baixar demo
              </LinkButton>
            </div>
          ) : (
            <p className="border-t border-line-soft px-4 py-3 text-[12px] text-ink-4 sm:px-5">
              Sem gravação para esta partida — o SourceTV pode não ter gravado, ou o arquivo já
              foi removido. O placar acima continua valendo.
            </p>
          )}
        </Panel>
      </div>

      <div data-enter>
        <Panel className="overflow-hidden">
          <PanelHeader label="Rodadas" accent="brass" />
          <div className="p-4">
            {/* Lista MENOR que o placar significa que faltam rodadas — a
                linha do tempo desenharia 6 ícones pra uma partida de 18
                pontos, o que é pior que não desenhar nada. */}
            {faltamRodadas(partida) ? (
              <p className="text-[12.5px] text-ink-3">
                As rodadas desta partida não foram registradas por completo.
              </p>
            ) : (
              <>
                {/* O formato vem do servidor (`mp_maxrounds`) — hoje MR13.
                    Assim a linha do tempo mostra o tamanho real da partida
                    em vez de deduzir pelo que foi jogado. */}
                <RoundTimeline
                  rounds={partida.rounds.map(toRoundResult)}
                  maxRounds={Math.max(partida.maxRounds ?? 0, partida.rounds.length)}
                />
                {anuladas(partida) > 0 ? (
                  <p className="mt-3 text-[12px] text-ink-4">
                    Inclui {anuladas(partida)} rodadas anuladas por restart.
                  </p>
                ) : null}
              </>
            )}
          </div>
        </Panel>
      </div>

      <div data-enter className="grid gap-5 lg:grid-cols-2">
        <Time titulo="Counter-Terrorists" jogadores={ct} tone="ct" />
        <Time titulo="Terrorists" jogadores={t} tone="t" />
      </div>

      {spec.length > 0 ? (
        <div data-enter>
          <Time titulo="Terminaram no espectador" jogadores={spec} tone="neutral" />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Cada rodada dá um ponto a um lado, então a soma dos placares deveria bater
 * com o número de rodadas. As duas formas de não bater são DIFERENTES e a
 * tela precisa tratar cada uma:
 *
 * - rodadas a MAIS que pontos: houve restart, e as rodadas descartadas pelo
 *   servidor continuam na lista. A linha do tempo vale, com a ressalva;
 * - rodadas de MENOS: o registro está incompleto. Desenhar a linha do tempo
 *   aí é pior que não desenhar — ela mostraria 6 rodadas pra uma partida de
 *   18 pontos.
 *
 * Uma versão anterior tratava os dois casos com a mesma conta e imprimia
 * "Inclui -12 rodadas anuladas". Número negativo é código quebrado
 * aparecendo como se fosse informação.
 */
function anuladas(partida: MatchDetailReal): number {
  return Math.max(0, partida.rounds.length - ((partida.ctScore ?? 0) + (partida.tScore ?? 0)));
}

function faltamRodadas(partida: MatchDetailReal): boolean {
  return (partida.ctScore ?? 0) + (partida.tScore ?? 0) > partida.rounds.length;
}

/** O `RoundTimeline` já existe e fala o vocabulário do painel — só traduzir. */
function toRoundResult(round: MatchDetailReal["rounds"][number]): RoundResult {
  return { round: round.n, winner: round.winner, reason: round.reason };
}

function duracao(partida: MatchDetailReal): string {
  if (!partida.endedAt) return "";
  const segundos = Math.max(
    0,
    Math.round((new Date(partida.endedAt).getTime() - new Date(partida.startedAt).getTime()) / 1000),
  );
  return formatDuration(segundos);
}

function Lado({
  rotulo,
  valor,
  venceu,
  tone,
}: {
  rotulo: string;
  valor: number;
  venceu: boolean;
  tone: "ct" | "t";
}) {
  return (
    <div className="text-center">
      <p className={cn("t-eyebrow text-[9px]", tone === "ct" ? "text-ct" : "text-t")}>{rotulo}</p>
      <p
        className={cn(
          "t-display mt-1 text-[38px] leading-none",
          venceu ? (tone === "ct" ? "text-ct-hi" : "text-t-hi") : "text-ink-4",
        )}
      >
        {valor}
      </p>
    </div>
  );
}

/**
 * O Tab. Só abates e mortes porque é o que o CS:S tem — assistências e MVP
 * são do CS:GO, e uma coluna de zeros seria dado inventado com outro nome.
 */
function Time({
  titulo,
  jogadores,
  tone,
}: {
  titulo: string;
  jogadores: MatchPlayer[];
  tone: "ct" | "t" | "neutral";
}) {
  if (jogadores.length === 0) {
    return (
      <Panel className="overflow-hidden">
        <PanelHeader label={titulo} accent={tone === "neutral" ? "brass" : tone} />
        <p className="p-5 text-center text-[12.5px] text-ink-3">
          Ninguém terminou a partida deste lado.
        </p>
      </Panel>
    );
  }

  return (
    <Panel className="overflow-hidden">
      <PanelHeader label={titulo} accent={tone === "neutral" ? "brass" : tone} />

      <div className="grid grid-cols-[minmax(0,1fr)_56px_56px_56px] gap-3 border-b border-line-soft px-4 py-2">
        <span className="t-eyebrow text-[8.5px]">Jogador</span>
        <span className="t-eyebrow text-right text-[8.5px]">Abates</span>
        <span className="t-eyebrow text-right text-[8.5px]">Mortes</span>
        <span className="t-eyebrow text-right text-[8.5px]">K/D</span>
      </div>

      <ul>
        {jogadores.map((jogador) => (
          <li
            key={jogador.steamId64}
            className="grid grid-cols-[minmax(0,1fr)_56px_56px_56px] items-center gap-3 border-b border-line-soft px-4 py-2.5 last:border-b-0"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <PlayerAvatar seed={jogador.steamId64} nickname={jogador.name} size="sm" />
              <span className="truncate text-[13px] text-ink">{jogador.name}</span>
            </span>
            <span className="t-num text-right text-[13px] text-ink">{jogador.kills}</span>
            <span className="t-num text-right text-[13px] text-ink-3">{jogador.deaths}</span>
            {/* Sem morte nenhuma, K/D é o próprio número de abates — dividir
                por zero daria "Infinity" na tela. */}
            <span className="t-num text-right text-[13px] text-ink-2">
              {(jogador.kills / Math.max(1, jogador.deaths)).toFixed(2).replace(".", ",")}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
