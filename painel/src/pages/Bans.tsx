import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { usePageEnter } from "@/hooks/useGsap";
import { useResource } from "@/hooks/useResource";
import { api, type BansSummary, type Page } from "@/api/client";
import type { Ban, BanState } from "@/data/types";
import { formatNumber } from "@/lib/format";
import { SectionTitle, Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { FilterBar, SearchBar, Segmented } from "@/components/ui/Field";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";
import { Pagination } from "@/components/ui/Pagination";
import { BanRow } from "@/components/ban/BanRow";

type StateFilter = BanState | "all";

export default function Bans() {
  const scope = usePageEnter<HTMLDivElement>();
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState<StateFilter>("all");
  const [page, setPage] = useState(1);
  const query = params.get("q") ?? "";

  const resource = useResource<Page<Ban>>(
    ["bans", query, state, page],
    () => api.bans({ query, state, page, pageSize: 12 }),
    { keepPrevious: true },
  );

  /**
   * Os contadores vêm de uma chamada própria porque a lista é paginada:
   * contar em cima de `resource` daria só o total da página atual.
   */
  const summary = useResource<BansSummary>(["bans-summary"], () => api.bansSummary());

  const bans = resource.data?.items ?? [];
  const counts = summary.data;

  const filters = [
    { value: "all" as const, label: "Todos", count: counts?.all },
    { value: "active" as const, label: "Ativos", count: counts?.active },
    { value: "permanent" as const, label: "Permanentes", count: counts?.permanent },
    { value: "expired" as const, label: "Expirados", count: counts?.expired },
  ];

  function setQuery(value: string) {
    setPage(1);
    setParams(value ? { q: value } : {}, { replace: true });
  }

  return (
    <div ref={scope} className="space-y-5">
      <div data-enter>
        <SectionTitle
          eyebrow="Registro público"
          title="Banimentos"
        />
      </div>

      <div data-enter className="grid gap-px overflow-hidden rounded-md bg-line-soft/50 sm:grid-cols-3">
        <Summary label="Registros" value={counts ? formatNumber(counts.all) : "—"} />
        <Summary label="Punições ativas" value={counts ? formatNumber(counts.active) : "—"} tone="danger" />
        <Summary label="Permanentes" value={counts ? formatNumber(counts.permanent) : "—"} tone="danger" />
      </div>

      <div data-enter>
        <Panel flush className="overflow-hidden">
          <FilterBar>
            <Segmented options={filters} value={state} onChange={(next) => { setState(next); setPage(1); }} />
            <SearchBar
              value={query}
              onValueChange={setQuery}
              placeholder="Buscar por nickname, Steam ID ou motivo"
              shortcut
              className="ml-auto w-full lg:w-80"
            />
          </FilterBar>

          {resource.status === "error" ? (
            <ErrorState onRetry={resource.reload} />
          ) : resource.status === "loading" && bans.length === 0 ? (
            <SkeletonRows rows={8} />
          ) : bans.length === 0 ? (
            <EmptyState
              icon={<ShieldAlert />}
              title="Nenhum registro encontrado"
              hint="Confira a grafia do nickname ou use o Steam ID completo."
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setState("all");
                  }}
                >
                  Limpar filtros
                </Button>
              }
            />
          ) : (
            <div>
              {bans.map((ban) => (
                <BanRow key={ban.id} ban={ban} />
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
        </Panel>
      </div>
    </div>
  );
}

function Summary({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="bg-panel px-4 py-3.5">
      <p className="t-eyebrow text-[8.5px]">{label}</p>
      <p
        className={
          "t-display mt-2 text-[22px] tabular-nums " +
          (tone === "danger" ? "text-danger" : "text-ink")
        }
      >
        {value}
      </p>
    </div>
  );
}
