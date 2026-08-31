import { Link, useParams } from "react-router-dom";
import { ArrowLeft, LogIn, LogOut, ShieldX, Trophy } from "lucide-react";
import { usePageEnter } from "@/hooks/useGsap";
import { STALE } from "@/lib/queryClient";
import { useResource } from "@/hooks/useResource";
import { api } from "@/api/client";
import type { ActivityEvent, RankedPlayer } from "@/data/types";
import {
  formatDateTime,
  formatDecimal,
  formatNumber,
  formatPercent,
  formatPlaytime,
  timeAgo,
} from "@/lib/format";
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
  const resource = useResource<RankedPlayer>(["player", id], () => api.player(id), {
    staleTime: STALE.ranking,
  });

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

              {/* Sem "ver nota abaixo": a nota era o painel de indisponibilidade
                  que saiu da página, e a referência ficou apontando pro vazio. */}
              <p className="t-num mt-2 text-[11.5px] text-ink-3">
                ID interno do HLstatsX: {player.id} · esta instalação não expõe Steam ID
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
          <Sessions nickname={player.nickname} />
        </div>

        <div data-enter className="min-w-0 space-y-5">
          <Panel className="overflow-hidden">
            <PanelHeader label="Desempenho" accent="ct" />
            <div className="space-y-5 p-4">
              <Duel kills={player.kills} deaths={player.deaths} kd={kd} />
              <Ratio label="Precisão" value={accuracy} hint="dos tiros disparados acertaram" />
              <Ratio
                label="Headshots"
                value={hsRate * 100}
                hint={
                  formatNumber(player.headshots) +
                  " dos " +
                  formatNumber(player.kills) +
                  " abates foram na cabeça"
                }
                tone="ct"
              />
              <Pace kills={player.kills} minutes={player.connectionTimeMinutes ?? 0} />
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

/**
 * Passagens reais pelo servidor, lidas do log do `lendas_steamfilter`.
 *
 * NÃO é histórico de partidas, e por isso não se chama assim: partida com
 * placar e rodadas não existe como dado nesta rede — o HLstatsX só guarda
 * acumulados, e nada registra o resultado de cada partida. O que existe de
 * verdade é quando a pessoa entrou, quando saiu e quanto tempo ficou.
 *
 * O casamento é por nickname porque o HLstatsX desta instalação não expõe
 * Steam ID (auditado; ver server/README.md) — mesmo caminho que o ranking
 * usa pra achar os avatares. Dois jogadores com o mesmo nick apareceriam
 * juntos: é limitação da fonte, não escolha.
 */
function Sessions({ nickname }: { nickname: string }) {
  const resource = useResource<ActivityEvent[]>(
    ["sessoes", nickname],
    () => api.activity({ actor: nickname, limit: 40 }),
  );

  const eventos = resource.data ?? [];

  return (
    <Panel className="overflow-hidden">
      <PanelHeader label="Passagens pelo servidor" accent="ct" />

      {resource.status === "error" ? (
        <div className="p-5 text-center">
          <p className="t-title text-[13px] text-ink-2">Não foi possível ler o registro</p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">
            O log do servidor não respondeu. Nada aqui é estimado — sem ele, a lista fica vazia.
          </p>
        </div>
      ) : eventos.length === 0 ? (
        <div className="p-5 text-center">
          <p className="t-title text-[13px] text-ink-2">Nenhuma passagem registrada</p>
          <p className="mx-auto mt-1.5 max-w-[54ch] text-[12.5px] leading-relaxed text-ink-3">
            O registro cobre os últimos dois dias de log do servidor. Quem não entrou nesse
            período não aparece aqui — e isso nada diz sobre o histórico completo, que a fonte
            não guarda.
          </p>
        </div>
      ) : (
        <ul>
          {toSessions(eventos).map((evento) => (
            <SessionRow key={evento.id} event={evento} online={evento === eventos[0]} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

/**
 * O log traz entrada e saída como linhas separadas, mas uma passagem pelo
 * servidor é UMA coisa — e a linha de saída já carrega tudo que ela tem a
 * dizer: quando terminou e quanto durou. Mostrar as duas empilhava o mesmo
 * fato duas vezes e dobrava o tamanho da lista sem acrescentar nada.
 *
 * A entrada só sobrevive quando é o evento mais recente do jogador: aí ela
 * não é metade de um par, é uma passagem que ainda não terminou.
 */
function toSessions(eventos: readonly ActivityEvent[]): ActivityEvent[] {
  return eventos.filter(
    (evento, i) => evento.kind !== "join" || i === 0,
  );
}

const SESSION_ICON = { join: LogIn, leave: LogOut, blocked: ShieldX };
const SESSION_TINT = { join: "text-live", leave: "text-ink-3", blocked: "text-danger" };
const SESSION_LABEL = {
  join: "Entrou no servidor",
  leave: "Saiu do servidor",
  blocked: "Foi barrado ao entrar",
};

function SessionRow({ event, online }: { event: ActivityEvent; online: boolean }) {
  const Icon = SESSION_ICON[event.kind];
  /**
   * "Ainda no servidor" é leitura do registro, não consulta ao servidor: a
   * entrada é o último evento dele e nenhuma saída veio depois. Se o
   * jogador tiver caído sem o plugin registrar, isto fica desatualizado —
   * daí o texto dizer o que o registro mostra, e não afirmar presença.
   */
  const emAndamento = event.kind === "join" && online;

  return (
    <li className="flex items-center gap-3 border-b border-line-soft px-4 py-2.5 last:border-b-0">
      <Icon className={"size-4 shrink-0 " + SESSION_TINT[event.kind]} aria-hidden="true" />

      <span className="min-w-0 flex-1 text-[13px] text-ink-2">
        {emAndamento ? "Entrou — sem saída registrada" : SESSION_LABEL[event.kind]}
        {/* A duração vem do plugin, que guarda a hora da aprovação — não é
            conta feita aqui em cima do horário do evento. */}
        {event.detail ? (
          <span className={event.kind === "blocked" ? "text-danger" : "text-ink-3"}>
            {event.kind === "leave" ? " — ficou " + event.detail : " — " + event.detail}
          </span>
        ) : null}
      </span>

      <span className="shrink-0 text-right">
        <span className="t-num block text-[11.5px] text-ink-3">{timeAgo(event.at)}</span>
        <span className="t-num mt-0.5 block text-[10.5px] text-ink-4">
          {formatDateTime(event.at)}
        </span>
      </span>
    </li>
  );
}

/**
 * Abates contra mortes numa barra só, partida no ponto real entre os dois.
 *
 * Uma barra de progresso comum não serviria aqui: não existe "máximo" de
 * abates pra medir contra, e inventar um teto daria uma porcentagem sem
 * significado. O que importa é a proporção entre os dois lados — e as
 * cores são as dos próprios times do jogo, não uma paleta de gráfico.
 */
function Duel({ kills, deaths, kd }: { kills: number; deaths: number; kd: number }) {
  const total = Math.max(1, kills + deaths);
  const parteAbates = (kills / total) * 100;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="t-eyebrow text-[9px]">Abates × mortes</span>
        <span className="t-num text-[13px] text-ink">
          {formatDecimal(kd)} <span className="text-ink-4">K/D</span>
        </span>
      </div>

      <div className="mt-2 flex h-[7px] w-full overflow-hidden rounded-full bg-raised/70">
        <span
          className="bg-gradient-to-r from-ct-dim to-ct"
          style={{ width: parteAbates + "%" }}
          aria-hidden="true"
        />
        <span className="flex-1 bg-gradient-to-l from-t to-t/50" aria-hidden="true" />
      </div>

      <div className="mt-1.5 flex items-baseline justify-between">
        <span className="t-num text-[12px] text-ct-hi">{formatNumber(kills)} abates</span>
        <span className="t-num text-[12px] text-t-hi">{formatNumber(deaths)} mortes</span>
      </div>
    </div>
  );
}

/**
 * Ritmo: abates por hora conectada. Sai de dois números que já estão na
 * página e diz o que nenhum deles diz sozinho — 519 abates é muito ou
 * pouco dependendo de terem saído em 30h ou em 300h.
 */
function Pace({ kills, minutes }: { kills: number; minutes: number }) {
  // Sem tempo registrado não há ritmo; um "0/h" seria invenção.
  if (minutes <= 0) return null;

  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-line-soft pt-4">
      <span className="t-eyebrow text-[9px]">Ritmo</span>
      <span className="t-num text-[13px] text-ink">
        {formatDecimal(kills / (minutes / 60))} <span className="text-ink-4">abates por hora</span>
      </span>
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
        <span className="t-eyebrow text-[9px]">{label}</span>
        {/* O número é o assunto, então ele lidera. Antes eram 12,5px
            disputando atenção com um rótulo de 8,5px e uma barra de 3px, e
            o conjunto lia como enfeite em vez de informação. */}
        <span className="t-num text-[17px] tabular-nums text-ink">{formatPercent(value, 1)}</span>
      </div>
      <Meter value={value} max={100} height={7} tone={tone} className="mt-2" />
      <p className="mt-1.5 text-[12px] text-ink-3">{hint}</p>
    </div>
  );
}
