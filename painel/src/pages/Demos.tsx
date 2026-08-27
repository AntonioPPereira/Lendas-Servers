import { useState } from "react";
import { FolderOpen, Grid2x2, List } from "lucide-react";
import { useGsapScope, usePageEnter } from "@/hooks/useGsap";
import { gsap, prefersReducedMotion } from "@/lib/motion";
import { STALE } from "@/lib/queryClient";
import { useResource } from "@/hooks/useResource";
import { api, type DemoPeriods, type DemosPage } from "@/api/client";
import { UNIQUE_MAPS } from "@/data/seed";
import { formatPeriod, mapLabel } from "@/lib/format";
import { cn } from "@/lib/cn";
import { SectionTitle, Panel, PanelHeader } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { FilterBar, SearchBar, Select } from "@/components/ui/Field";
import { EmptyState, ErrorState, LoadingState, SkeletonRows } from "@/components/ui/States";
import { Pagination } from "@/components/ui/Pagination";
import { DemoCard } from "@/components/demo/DemoCard";
import { DemoListHeader, DemoRow } from "@/components/demo/DemoRow";

const MAP_OPTIONS = [
  { value: "all", label: "Todos os mapas" },
  ...UNIQUE_MAPS.map((map) => ({ value: map, label: mapLabel(map) })),
];

/** Página "vazia" pra quando nenhum mês foi escolhido ainda — nunca dispara o fetch de verdade. */
const NO_PERIOD_CHOSEN: DemosPage = { items: [], total: 0, page: 1, pageSize: 1, period: "" };

export default function Demos() {
  const scope = usePageEnter<HTMLDivElement>();
  const [query, setQuery] = useState("");
  const [map, setMap] = useState("all");
  // Fica indefinido até o jogador escolher uma pasta de mês — a lista só
  // abre depois disso, e só aí o backend é consultado (nunca varre nada
  // sozinho ao abrir a página).
  const [period, setPeriod] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"grid" | "list">("grid");

  const periods = useResource<DemoPeriods>(["demo-periods"], () => api.demoPeriods(), {
    staleTime: STALE.demos,
  });

  const resource = useResource<DemosPage>(
    ["demos", period, query, map, page, view],
    () =>
      period
        ? api.demos({ query, map, period, page, pageSize: view === "grid" ? 9 : 14 })
        : Promise.resolve(NO_PERIOD_CHOSEN),
    // enabled: nada é pedido antes do jogador escolher um mês — o backend
    // nunca varre o arquivo inteiro só porque alguém abriu a página.
    { staleTime: STALE.demos, enabled: period !== undefined, keepPrevious: true },
  );

  // A entrada da lista, só quando um mês é escolhido pela primeira vez —
  // "abre" de verdade, não fica montada e escondida por trás dos panos.
  const revealRef = useGsapScope<HTMLDivElement>(({ scope: el }) => {
    if (prefersReducedMotion()) return;
    gsap.fromTo(el, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" });
  }, [period]);

  const demos = resource.data?.items ?? [];
  const periodOptions = (periods.data?.items ?? []).map((p) => ({ value: p, label: formatPeriod(p) }));

  function resetFilters() {
    setQuery("");
    setMap("all");
    setPage(1);
  }

  return (
    <div ref={scope} className="space-y-5">
      <div data-enter>
        <SectionTitle
          eyebrow="Biblioteca"
          title="Demos"
          description="Todas as partidas gravadas na rede. Baixe o arquivo .dem e reproduza no próprio Counter-Strike: Source com playdemo."
        />
      </div>

      {/* Pastas por mês — o mesmo recorte "cstrike/demos/AAAA-MM" que existe
          de verdade no servidor, só que navegável em vez de um <select>.
          Superfície própria (não flutua sobre o fundo do site): sem isso o
          texto ficava ilegível em cima de qualquer foto de mapa mais clara. */}
      <div data-enter>
        <Panel hud className="overflow-hidden">
          <PanelHeader
            label="Arquivo por período"
            accent="brass"
            hint={periods.status === "loading" ? "Abrindo o arquivo" : "Escolha um mês pra abrir"}
          />

          {/* A lista de meses sai de um SFTP no servidor de jogo, o que leva
              alguns segundos na primeira vez. Sem estes três estados o painel
              ficava simplesmente vazio nesse intervalo, e quem abria a página
              não tinha como saber se estava carregando ou se não havia nada. */}
          {periods.status === "error" ? (
            <ErrorState
              title="Não foi possível listar os períodos"
              hint="O servidor de arquivos (SFTP) não respondeu."
              onRetry={periods.reload}
              className="py-10"
            />
          ) : periods.status === "loading" && periodOptions.length === 0 ? (
            <LoadingState label="Lendo as pastas de demo no servidor" className="py-10" />
          ) : periodOptions.length === 0 ? (
            <EmptyState
              title="Nenhum período gravado ainda"
              hint="Assim que a primeira demo for salva, o mês aparece aqui."
              icon={<FolderOpen />}
              className="py-10"
            />
          ) : (
          <div className="flex flex-wrap gap-3 p-4">
            {periodOptions.map(({ value, label }) => {
              const active = value === period;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setPeriod(value);
                    setPage(1);
                  }}
                  aria-pressed={active}
                  className={cn(
                    "group flex items-center gap-3 rounded-xs border px-4 py-3 transition-colors",
                    active
                      ? "border-brass/45 bg-panel-2 brass-edge"
                      : "border-line-soft bg-panel-2/50 hover:border-line hover:bg-panel-2",
                  )}
                >
                  <FolderOpen className={cn("size-5 shrink-0", active ? "text-brass" : "text-ink-4")} />
                  <span className="flex flex-col items-start leading-tight">
                    <span className={cn("t-title text-[14px] capitalize", active ? "text-ink" : "text-ink-2")}>
                      {label}
                    </span>
                    {value === periods.data?.current ? (
                      <span className="t-eyebrow mt-0.5 text-[7.5px] text-live">Mês atual</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
          )}
        </Panel>
      </div>

      {period ? (
        <div ref={revealRef}>
        <Panel flush className="overflow-hidden">
          <FilterBar>
            <Select
              label="Mapa"
              value={map}
              options={MAP_OPTIONS}
              onChange={(value) => {
                setMap(value);
                setPage(1);
              }}
              className="w-[168px]"
            />
            <SearchBar
              value={query}
              onValueChange={(value) => {
                setQuery(value);
                setPage(1);
              }}
              placeholder="Buscar por arquivo ou mapa"
              shortcut
              className="ml-auto w-full lg:w-72"
            />
            <div className="flex items-center gap-px rounded-xs border border-line-soft p-px">
              <ViewButton
                active={view === "grid"}
                onClick={() => setView("grid")}
                label="Ver em cards"
              >
                <Grid2x2 className="size-3.5" />
              </ViewButton>
              <ViewButton
                active={view === "list"}
                onClick={() => setView("list")}
                label="Ver em lista"
              >
                <List className="size-3.5" />
              </ViewButton>
            </div>
          </FilterBar>

          {resource.status === "error" ? (
            <ErrorState
              title="Não foi possível carregar as demos"
              hint="O servidor de arquivos não respondeu. Tente novamente em alguns segundos."
              onRetry={resource.reload}
            />
          ) : resource.status === "loading" && demos.length === 0 ? (
            view === "grid" ? (
              <LoadingState label="Abrindo a biblioteca" />
            ) : (
              <SkeletonRows rows={8} />
            )
          ) : demos.length === 0 ? (
            <EmptyState
              title="Nenhuma demo com esses filtros"
              hint="As gravações ficam disponíveis alguns minutos depois do fim da partida."
              action={
                <Button size="sm" onClick={resetFilters}>
                  Limpar filtros
                </Button>
              }
            />
          ) : view === "grid" ? (
            <div className="grid gap-4 p-4 md:grid-cols-2 2xl:grid-cols-3">
              {demos.map((demo) => (
                <DemoCard key={demo.id} demo={demo} />
              ))}
            </div>
          ) : (
            <>
              <DemoListHeader />
              <div className="divide-y divide-line-soft">
                {demos.map((demo) => (
                  <DemoRow key={demo.id} demo={demo} />
                ))}
              </div>
            </>
          )}

          {resource.data && resource.data.total > 0 ? (
            <Pagination
              page={resource.data.page}
              pageSize={resource.data.pageSize}
              total={resource.data.total}
              onChange={setPage}
              className="border-t border-line-soft"
            />
          ) : null}
        </Panel>
        </div>
      ) : null}
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "grid size-7 place-items-center rounded-xs transition-colors",
        active ? "bg-raised text-brass" : "text-ink-4 hover:text-ink-2",
      )}
    >
      {children}
    </button>
  );
}
