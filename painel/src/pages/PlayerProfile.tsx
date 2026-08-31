import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Crosshair, Trophy } from "lucide-react";
import { usePageEnter } from "@/hooks/useGsap";
import { STALE } from "@/lib/queryClient";
import { useResource } from "@/hooks/useResource";
import { api, type PlayerWeapons } from "@/api/client";
import type { RankedPlayer } from "@/data/types";
import {
  formatDate,
  formatDecimal,
  formatNumber,
  formatPercent,
  formatPlaytime,
  weaponLabel,
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
          <Weapons id={player.id} />
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
 * Armas com que este jogador mais mata.
 *
 * Fonte diferente do resto da página, e a tela precisa dizer isso: skill,
 * abates e precisão vêm do HLstatsX, que nesta instalação NÃO entrega
 * recorte por arma por jogador. Quem conta arma é o plugin
 * `lendas_playerstats`, e ele só conta desde que subiu — daí a linha de
 * "desde". Sem ela, alguém compara estes números com os 4.140 abates do
 * cartão acima e conclui que o site está errado.
 */
function Weapons({ id }: { id: string }) {
  const resource = useResource<PlayerWeapons>(["armas-jogador", id], () => api.playerWeapons(id));
  const dados = resource.data;
  const todas = dados?.weapons ?? [];
  /**
   * Só as dez primeiras. A cauda de um jogador antigo tem umas vinte armas
   * com 1 ou 2 abates cada — ruído que empurra o resto da página pra baixo
   * sem dizer nada sobre o jeito dele jogar. O rodapé conta as que sobraram
   * pra ninguém achar que o painel escondeu abate.
   */
  const armas = todas.slice(0, 10);
  const restantes = todas.length - armas.length;
  const maior = armas[0]?.kills ?? 0;

  return (
    <Panel className="overflow-hidden">
      <PanelHeader label="Armas" accent="brass" />

      {resource.status === "error" || dados?.available === false ? (
        <Aviso titulo="Contagem indisponível">
          O plugin que conta abates por arma não respondeu. Nada aqui é estimado.
        </Aviso>
      ) : resource.status === "loading" && !dados ? (
        <div className="p-5">
          <LoadingState label="Carregando armas" />
        </div>
      ) : armas.length === 0 ? (
        <Aviso titulo="Nenhum abate contado ainda">
          A contagem por arma começou{" "}
          {dados?.since ? "em " + formatDate(dados.since) : "há pouco"} e vale só do servidor
          para cá. Os abates antigos deste jogador existem no total acima, mas ninguém registrou
          com qual arma.
        </Aviso>
      ) : (
        <>
          <ul className="divide-y divide-line-soft">
            {armas.map((arma) => (
              <li key={arma.weapon} className="px-4 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[13px] text-ink">
                    {weaponLabel(arma.weapon, arma.weapon)}
                  </span>
                  <span className="t-num shrink-0 text-[13px] text-ink">
                    {formatNumber(arma.kills)}{" "}
                    <span className="text-ink-4">{arma.kills === 1 ? "abate" : "abates"}</span>
                  </span>
                </div>
                {/* A barra compara com a arma MAIS usada deste jogador, não
                    com um teto inventado: o que interessa é o quanto ele
                    prefere uma sobre as outras. */}
                <Meter value={arma.kills} max={maior} height={5} tone="brass" className="mt-1.5" />
              </li>
            ))}
          </ul>

          <p className="border-t border-line-soft px-4 py-2.5 text-[11.5px] text-ink-3">
            <Crosshair className="mr-1.5 inline size-3.5 text-ink-4" aria-hidden="true" />
            {formatNumber(dados?.total ?? 0)} abates com {todas.length} armas
            {restantes > 0 ? " (" + restantes + " fora da lista)" : ""}
            {dados?.since ? ", contados desde " + formatDate(dados.since) : ""}. O total do perfil
            vem do HLstatsX e cobre desde sempre — os dois não batem, e não deveriam.
          </p>
        </>
      )}
    </Panel>
  );
}

function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="p-5 text-center">
      <p className="t-title text-[13px] text-ink-2">{titulo}</p>
      <p className="mx-auto mt-1.5 max-w-[52ch] text-[12.5px] leading-relaxed text-ink-3">
        {children}
      </p>
    </div>
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
