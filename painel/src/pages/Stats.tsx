import type { ReactNode } from "react";
import { Bomb, Crosshair, Flame, Shield, ShieldCheck, Swords, Trophy } from "lucide-react";
import { usePageEnter, useScrollReveal } from "@/hooks/useGsap";
import { useResource } from "@/hooks/useResource";
import { api } from "@/api/client";
import { GC, STALE } from "@/lib/queryClient";
import type { LeaderEntry, Leaderboards, ServerStats } from "@/data/types";
import { formatCompact, formatDecimal, formatNumber, mapLabel, timeAgo, weaponLabel } from "@/lib/format";
import { SectionTitle, Panel } from "@/components/ui/Panel";
import { StatCard } from "@/components/ui/StatCard";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { PlayerAvatar } from "@/components/player/PlayerAvatar";
import { FlameIcon } from "@/components/ui/FlameIcon";
import { SkullIcon } from "@/components/ui/SkullIcon";
import { ReticleIcon } from "@/components/ui/ReticleIcon";
import { C4Icon } from "@/components/ui/C4Icon";
import { RankedBars, SplitBar } from "@/components/charts/Bars";

/**
 * Números somados de todo o histórico do servidor, vindos do HLstatsX.
 *
 * Esta tela é sobre o SERVIDOR, não sobre jogadores, e isso é uma decisão,
 * não um esquecimento: o `mode=playerinfo` do HLstatsX desta rede trava,
 * então "quem matou mais com a AK" não é obtenível — um pódio aqui teria
 * que ser estimado. O rodapé explica isso ao leitor.
 */
export default function Stats() {
  const scope = usePageEnter<HTMLDivElement>();
  const revealScope = useScrollReveal<HTMLDivElement>();
  const resource = useResource<ServerStats>(["server-stats"], () => api.serverStats(), {
    staleTime: STALE.serverStats,
    // Sai da tela e volta sem recarregar: a busca é cara e o dado é histórico.
    gcTime: GC.caro,
  });
  /**
   * Chamada à parte de propósito: o pódio vem do plugin e cobre um período
   * diferente dos totais acima. Se ela falhar, a página inteira não pode
   * cair — por isso não entra no `if (error)` do recurso principal.
   */
  const podios = useResource<Leaderboards>(["leaderboards"], () => api.leaderboards(), {
    staleTime: STALE.leaderboards,
    gcTime: GC.caro,
  });

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
        <LoadingState label="Somando o histórico do servidor" />
      </Panel>
    );
  }

  const stats = resource.data;
  const armas = stats.weapons.slice(0, 12);
  const maisLetal = armas[0];

  /**
   * Proporção de headshot só faz sentido com volume: numa arma de 12 abates
   * um acerto a mais muda o número em 8 pontos. O corte evita um pódio
   * decidido por acaso.
   */
  const precisao = stats.weapons
    .filter((w) => w.headshotRatio !== null && w.kills >= 200)
    .sort((a, b) => (b.headshotRatio ?? 0) - (a.headshotRatio ?? 0))
    .slice(0, 8);

  // `null` em qualquer parcela contamina a soma: não dá pra somar o que não se sabe.
  const somar = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b);
  const vitoriasCt = somar(stats.roundOutcomes.ctWipedTs, stats.roundOutcomes.ctDefused);
  const vitoriasT = somar(stats.roundOutcomes.tWipedCts, stats.roundOutcomes.tBombed);

  return (
    <div ref={scope} className="space-y-5">
      <div data-enter>
        <SectionTitle
          eyebrow="Arquivo"
          title="Estatísticas"
          description="O que o servidor acumulou desde que começou a registrar: abates, armas, bombas e o equilíbrio entre os lados."
        />
      </div>

      <div data-enter className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Mortes registradas" value={stats.totalKills} icon={<SkullIcon className="size-5" />} />
        <StatCard
          label="Headshots"
          value={stats.totalHeadshots}
          icon={<ReticleIcon className="size-5" />}
          tone="brass"
          hint={
            stats.headshotRate === null
              ? undefined
              : formatDecimal(stats.headshotRate * 100, 1) + "% dos abates"
          }
        />
        {stats.bomb.planted === null ? null : (
          <StatCard
            label="Bombas plantadas"
            value={stats.bomb.planted}
            icon={<C4Icon className="size-5" />}
            hint={
              stats.bomb.defused === null
                ? undefined
                : formatNumber(stats.bomb.defused) + " desarmadas"
            }
          />
        )}
        {maisLetal ? (
          <StatCard
            label={"Arma mais letal · " + weaponLabel(maisLetal.code, maisLetal.name)}
            value={maisLetal.kills}
            icon={<FlameIcon className="size-5" />}
            format={formatCompact}
            hint={formatDecimal(maisLetal.shareOfKills * 100, 1) + "% de todos os abates"}
          />
        ) : null}
      </div>

      <div ref={revealScope} className="space-y-5">
        <SecaoPodios dados={podios.data} />

        <div data-reveal className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
          <ChartFrame
            title="Abates por arma"
            caption="Soma de todo o histórico do servidor, não de uma partida."
          >
            <RankedBars
              data={armas.map((w) => ({ label: weaponLabel(w.code, w.name), value: w.kills }))}
              format={formatCompact}
            />
          </ChartFrame>

          <ChartFrame
            title="Quem acerta mais na cabeça"
            caption="Proporção de headshots de cada arma. Só armas com 200 ou mais abates — abaixo disso o número oscila demais para significar algo."
          >
            <RankedBars
              data={precisao.map((w) => ({
                label: weaponLabel(w.code, w.name),
                value: Math.round((w.headshotRatio ?? 0) * 100),
              }))}
              format={(v) => v + "%"}
            />
          </ChartFrame>
        </div>

        <div data-reveal className="grid gap-5 xl:grid-cols-[1fr_1.25fr]">
          <ChartFrame
            title="Equilíbrio entre os lados"
            caption="Conta apenas rounds decididos por eliminação, bomba ou defuse. Round encerrado por tempo não aparece nesta fonte, então o total não é o número de rounds jogados."
          >
            {vitoriasCt === null || vitoriasT === null ? (
              <p className="text-[12px] text-ink-3">
                A fonte não publica desfecho de round nesta instalação.
              </p>
            ) : (
              <>
                <SplitBar
                  left={{ label: "Counter-Terrorists", value: vitoriasCt }}
                  right={{ label: "Terrorists", value: vitoriasT }}
                />
                <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-2 text-[11.5px]">
                  <Linha rotulo="Eliminando o time" valor={stats.roundOutcomes.ctWipedTs} />
                  <Linha rotulo="Eliminando o time" valor={stats.roundOutcomes.tWipedCts} />
                  <Linha rotulo="Desarmando" valor={stats.roundOutcomes.ctDefused} />
                  <Linha rotulo="Explodindo" valor={stats.roundOutcomes.tBombed} />
                </dl>
              </>
            )}
          </ChartFrame>

          <ChartFrame
            title="Mapas mais mortais"
            caption="Abates registrados em cada mapa desde o início."
          >
            <RankedBars
              data={stats.maps.slice(0, 10).map((m) => ({ label: m.map, value: m.kills }))}
              format={formatCompact}
              labelFormat={mapLabel}
            />
          </ChartFrame>
        </div>

        <div data-reveal className="grid gap-5 md:grid-cols-2">
          <Painel titulo="Sequências de abate" legenda="Multi-kills dentro de um round">
            <Item rotulo="Dois abates" valor={stats.multiKills.double} icone={<Swords />} />
            <Item rotulo="Três abates" valor={stats.multiKills.triple} icone={<Swords />} />
            <Item rotulo="Quatro abates" valor={stats.multiKills.quadruple} icone={<Flame />} />
            <Item rotulo="Rampage (cinco)" valor={stats.multiKills.rampage} icone={<Flame />} />
            <Item rotulo="Mega Kill (seis)" valor={stats.multiKills.megaKill} icone={<Flame />} />
          </Painel>

          <Painel titulo="Destaques" legenda="Reconhecimentos que o servidor registra">
            <Item rotulo="Round MVP" valor={stats.highlights.mvp} icone={<Shield />} />
            <Item rotulo="Dominações" valor={stats.highlights.domination} icone={<Swords />} />
            <Item rotulo="Vinganças" valor={stats.highlights.revenge} icone={<Swords />} />
            <Item rotulo="Bomba carregada" valor={stats.bomb.pickedUp} icone={<Bomb />} />
            <Item rotulo="Bomba largada" valor={stats.bomb.dropped} icone={<Bomb />} />
          </Painel>
        </div>

        <p data-reveal className="px-1 text-[11.5px] leading-relaxed text-ink-3">
          Os totais acima vêm do HLstatsX desta rede e somam o histórico
          inteiro do servidor. Os pódios por jogador vêm de outra fonte, com
          outro alcance: o perfil individual do HLstatsX não responde nesta
          instalação, então quem conta é um plugin no próprio servidor — e ele
          só sabe do que aconteceu depois que entrou no ar.
        </p>
      </div>
    </div>
  );
}

function Painel({
  titulo,
  legenda,
  children,
}: {
  titulo: string;
  legenda: string;
  children: ReactNode;
}) {
  return (
    <ChartFrame title={titulo} caption={legenda}>
      <dl className="-mx-4 -mb-1 divide-y divide-line-soft">{children}</dl>
    </ChartFrame>
  );
}

function Item({
  rotulo,
  valor,
  icone,
}: {
  rotulo: string;
  valor: number | null;
  icone: ReactNode;
}) {
  // Ausente na fonte = a linha some. Mostrar "0" afirmaria que nunca ocorreu.
  if (valor === null) return null;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="grid size-7 shrink-0 place-items-center rounded-[3px] bg-raised/60 text-brass [&_svg]:size-3.5">
        {icone}
      </span>
      <dt className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">{rotulo}</dt>
      <dd className="t-num text-[13px] tabular-nums text-ink">{formatNumber(valor)}</dd>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="truncate text-ink-3">{rotulo}</dt>
      <dd className="t-num tabular-nums text-ink-2">
        {valor === null ? "—" : formatNumber(valor)}
      </dd>
    </div>
  );
}

/**
 * Pódios por arma e por ação. Fonte e período diferentes do bloco de cima,
 * e a tela diz isso na cara: sem o aviso, o leitor somaria "17 mil abates
 * com a Deagle" (histórico) com "3 abates do fulano" (desde ontem) e
 * concluiria que algo quebrou.
 */
function SecaoPodios({ dados }: { dados: Leaderboards | null }) {
  // Ainda carregando, indisponível, ou plugin recém-instalado sem nada
  // contado: some em vez de mostrar pódio vazio.
  if (!dados || dados.playersCounted === 0) return null;

  const acoes = [
    { titulo: "Mais abates", icone: <Trophy />, lista: dados.topKillers },
    { titulo: "Mais headshots", icone: <Crosshair />, lista: dados.topHeadshots },
    { titulo: "Mais bombas plantadas", icone: <Bomb />, lista: dados.topPlanters },
    { titulo: "Mais defuses", icone: <ShieldCheck />, lista: dados.topDefusers },
  ].filter((a) => a.lista.length > 0);

  return (
    <>
      <div data-reveal className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1 pt-2">
        <h2 className="t-display text-[15px] text-ink">Quem manda em cada coisa</h2>
        <p className="text-[11.5px] text-ink-3">
          {dados.since ? "Contando desde " + timeAgo(dados.since) : "Contagem recém-iniciada"}
          {" · "}
          {formatNumber(dados.playersCounted)}{" "}
          {dados.playersCounted === 1 ? "jogador" : "jogadores"}
        </p>
      </div>

      {acoes.length > 0 ? (
        <div data-reveal className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {acoes.map((a) => (
            <ChartFrame key={a.titulo} title={a.titulo}>
              <Podio entradas={a.lista} />
            </ChartFrame>
          ))}
        </div>
      ) : null}

      {dados.weapons.length > 0 ? (
        <div data-reveal className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {dados.weapons.slice(0, 9).map((w) => (
            <ChartFrame
              key={w.weapon}
              title={weaponLabel(w.weapon, w.weapon)}
              caption={formatNumber(w.total) + " abates no período"}
            >
              <Podio entradas={w.top} />
            </ChartFrame>
          ))}
        </div>
      ) : null}
    </>
  );
}

function Podio({ entradas }: { entradas: LeaderEntry[] }) {
  return (
    <ol className="space-y-2">
      {entradas.map((e, i) => {
        const lider = i === 0;
        return (
          <li
            key={e.steamId64}
            className={
              "flex items-center gap-2.5 rounded-[3px] px-1.5 py-1 " +
              (lider ? "bg-brass/10" : "")
            }
          >
            <span
              className={
                "t-num w-3.5 shrink-0 text-right text-[11px] tabular-nums " +
                (lider ? "text-brass" : "text-ink-4")
              }
            >
              {i + 1}
            </span>
            <PlayerAvatar
              seed={e.steamId64}
              nickname={e.nickname}
              size={lider ? "sm" : "xs"}
              avatarUrl={e.avatarUrl}
            />
            <span
              className={
                "min-w-0 flex-1 truncate " +
                (lider ? "text-[13px] text-ink" : "text-[12.5px] text-ink-2")
              }
            >
              {e.nickname}
            </span>
            <span
              className={
                "t-num tabular-nums " + (lider ? "text-[14px] text-brass" : "text-[12.5px] text-ink")
              }
            >
              {formatNumber(e.value)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
