import { useState } from "react";
import { Grid2x2, List } from "lucide-react";
import { usePageEnter } from "@/hooks/useGsap";
import { useResource } from "@/hooks/useResource";
import { api, type Page } from "@/api/client";
import type { Demo } from "@/data/types";
import { UNIQUE_MAPS } from "@/data/seed";
import { mapLabel } from "@/lib/format";
import { cn } from "@/lib/cn";
import { SectionTitle, Panel } from "@/components/ui/Panel";
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

export default function Demos() {
  const scope = usePageEnter<HTMLDivElement>();
  const [query, setQuery] = useState("");
  const [map, setMap] = useState("all");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"grid" | "list">("grid");

  const resource = useResource<Page<Demo>>(
    () => api.demos({ query, map, page, pageSize: view === "grid" ? 9 : 14 }),
    [query, map, page, view],
  );

  const demos = resource.data?.items ?? [];

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

      <div data-enter>
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

          {resource.data ? (
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
