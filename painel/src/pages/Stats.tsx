import type { ReactNode } from "react";
import { Bomb, Crosshair, Flame, Shield, Skull, Swords } from "lucide-react";
import { usePageEnter, useScrollReveal } from "@/hooks/useGsap";
import { useResource } from "@/hooks/useResource";
import { api } from "@/api/client";
import type { ServerStats } from "@/data/types";
import { formatCompact, formatDecimal, formatNumber, mapLabel, weaponLabel } from "@/lib/format";
import { SectionTitle, Panel } from "@/components/ui/Panel";
import { StatCard } from "@/components/ui/StatCard";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { ChartFrame } from "@/components/charts/ChartFrame";
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
    staleTime: 5 * 60_000,
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
        <StatCard label="Mortes registradas" value={stats.totalKills} icon={<Skull />} />
        <StatCard
          label="Headshots"
          value={stats.totalHeadshots}
          icon={<Crosshair />}
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
            icon={<Bomb />}
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
            icon={<Flame />}
            format={formatCompact}
            hint={formatDecimal(maisLetal.shareOfKills * 100, 1) + "% de todos os abates"}
          />
        ) : null}
      </div>

      <div ref={revealScope} className="space-y-5">
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
          Os números vêm do HLstatsX desta rede e somam o histórico inteiro do
          servidor. Não há recorte por jogador nesta tela: o perfil individual
          do HLstatsX não responde de forma confiável nesta instalação, então
          um pódio de “quem matou mais com cada arma” teria que ser estimado —
          preferimos não mostrar a inventar.
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
