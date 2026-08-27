import { useLayoutEffect, useRef, useState } from "react";
import { usePageEnter } from "@/hooks/useGsap";
import { STALE } from "@/lib/queryClient";
import { useResource } from "@/hooks/useResource";
import { api, type RankingPage } from "@/api/client";
import { Flip, gsap, prefersReducedMotion } from "@/lib/motion";
import { SectionTitle, Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { FilterBar, SearchBar } from "@/components/ui/Field";
import { EmptyState, ErrorState, LoadingState, SkeletonRows } from "@/components/ui/States";
import { Pagination } from "@/components/ui/Pagination";
import { Podium } from "@/components/ranking/Podium";
import { RankingHeader, RankingRow } from "@/components/ranking/RankingTable";

export default function Ranking() {
  const scope = usePageEnter<HTMLDivElement>();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const flipState = useRef<Flip.FlipState | null>(null);
  const resource = useResource<RankingPage>(
    ["ranking", query, page],
    () => api.ranking({ query, page }),
    // keepPrevious: trocar de página mantém a tabela atual na tela em vez de
    // piscar esqueleto e sacudir o layout inteiro a cada clique.
    { staleTime: STALE.ranking, keepPrevious: true },
  );

  /** Capture geometry before the list re-sorts, so rows travel to their new rank. */
  function withReorder(change: () => void) {
    if (!prefersReducedMotion()) {
      flipState.current = Flip.getState("[data-flip-id]");
    }
    setPage(1);
    change();
  }

  useLayoutEffect(() => {
    const state = flipState.current;
    if (!state) return;
    flipState.current = null;

    Flip.from(state, {
      duration: 0.55,
      ease: "power2.inOut",
      stagger: 0.012,
      absolute: true,
      onEnter: (elements) => gsap.fromTo(elements, { opacity: 0 }, { opacity: 1, duration: 0.3 }),
      onLeave: (elements) => gsap.to(elements, { opacity: 0, duration: 0.2 }),
    });
  }, [resource.data]);

  const rows = resource.data?.items ?? [];
  const comparedTo = resource.data?.comparedTo
    ? new Date(resource.data.comparedTo).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null;
  const showPodium = page === 1 && query.trim() === "" && rows.length >= 3;
  // Primeira carga: o HLstatsX não tem API, então o backend percorre várias
  // páginas de HTML e isso leva segundos. Sem um aviso explícito a tela fica
  // só com esqueletos mudos e ninguém sabe se travou.
  const firstLoad = resource.status === "loading" && rows.length === 0;

  return (
    <div ref={scope} className="space-y-5">
      <div data-enter>
        <SectionTitle
          eyebrow="Ladder da comunidade"
          title="Ranking"
          description="Classificação por skill do HLstatsX, acumulado desde o primeiro registro — a fonte não separa por período ou temporada."
        />
      </div>

      {showPodium ? (
        <div data-enter>
          <Podium players={rows.slice(0, 3)} />
        </div>
      ) : firstLoad ? (
        // Reserva o lugar do pódio enquanto carrega, senão a tabela sobe e
        // depois é empurrada pra baixo quando os três primeiros chegam.
        <div data-enter>
          <Panel hud className="overflow-hidden">
            <LoadingState label="Montando o pódio" className="py-14" />
          </Panel>
        </div>
      ) : null}

      <div data-enter>
        <Panel flush className="overflow-hidden">
          <FilterBar>
            {/* Variação sem origem não quer dizer nada — o painel sempre diz
                desde quando as setas estão contando. */}
            {comparedTo ? (
              <span className="t-eyebrow text-[8.5px] text-ink-4">
                Variação desde {comparedTo}
              </span>
            ) : null}
            <SearchBar
              value={query}
              onValueChange={(value) => withReorder(() => setQuery(value))}
              placeholder="Buscar por nickname"
              shortcut
              className="ml-auto w-full lg:w-72"
            />
          </FilterBar>

          {resource.status === "error" ? (
            <ErrorState
              title="Não foi possível carregar o ranking"
              hint="O HLstatsX não respondeu. Tente novamente em alguns segundos."
              onRetry={resource.reload}
            />
          ) : (
            <>
              <RankingHeader />

              {firstLoad ? (
                <>
                  <LoadingState label="Consultando o ranking no HLstatsX" className="py-6" />
                  <SkeletonRows rows={8} />
                </>
              ) : rows.length === 0 ? (
                <EmptyState
                  title="Nenhum jogador encontrado"
                  hint="Limpe a busca para ver a tabela completa."
                  action={
                    <Button size="sm" onClick={() => withReorder(() => setQuery(""))}>
                      Limpar busca
                    </Button>
                  }
                />
              ) : (
                <div className="divide-y divide-line-soft">
                  {rows.map((player) => (
                    <RankingRow key={player.id} player={player} />
                  ))}
                </div>
              )}

              {resource.data ? (
                <Pagination
                  page={resource.data.page}
                  pageSize={resource.data.pageSize}
                  total={resource.data.total}
                  onChange={setPage}
                  className="border-t border-line-soft"
                />
              ) : null}
            </>
          )}

          {resource.refreshing ? (
            <LoadingState label="Recalculando ranking" className="py-6" />
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
