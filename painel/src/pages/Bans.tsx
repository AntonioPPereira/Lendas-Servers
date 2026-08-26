import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { usePageEnter } from "@/hooks/useGsap";
import { useResource } from "@/hooks/useResource";
import { api, type Page } from "@/api/client";
import type { Ban, BanState } from "@/data/types";
import { BANS } from "@/data/bans";
import { formatNumber } from "@/lib/format";
import { SectionTitle, Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { FilterBar, SearchBar, Segmented } from "@/components/ui/Field";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";
import { Pagination } from "@/components/ui/Pagination";
import { BanRow } from "@/components/ban/BanRow";

type StateFilter = BanState | "all";

const COUNTS = {
  all: BANS.length,
  active: BANS.filter((b) => b.state === "active").length,
  expired: BANS.filter((b) => b.state === "expired").length,
  permanent: BANS.filter((b) => b.state === "permanent").length,
};

const FILTERS = [
  { value: "all" as const, label: "Todos", count: COUNTS.all },
  { value: "active" as const, label: "Ativos", count: COUNTS.active },
  { value: "permanent" as const, label: "Permanentes", count: COUNTS.permanent },
  { value: "expired" as const, label: "Expirados", count: COUNTS.expired },
];

export default function Bans() {
  const scope = usePageEnter<HTMLDivElement>();
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState<StateFilter>("all");
  const [page, setPage] = useState(1);
  const query = params.get("q") ?? "";

  const resource = useResource<Page<Ban>>(
    () => api.bans({ query, state, page, pageSize: 12 }),
    [query, state, page],
  );

  const bans = resource.data?.items ?? [];

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
          description="Todas as punições aplicadas na rede, com motivo, administrador responsável e prazo. Abra um registro para ver os detalhes completos."
        />
      </div>

      <div data-enter className="grid gap-px overflow-hidden rounded-md bg-line-soft/50 sm:grid-cols-3">
        <Summary label="Registros" value={formatNumber(COUNTS.all)} />
        <Summary label="Punições ativas" value={formatNumber(COUNTS.active)} tone="danger" />
        <Summary label="Permanentes" value={formatNumber(COUNTS.permanent)} tone="danger" />
      </div>

      <div data-enter>
        <Panel flush className="overflow-hidden">
          <FilterBar>
            <Segmented options={FILTERS} value={state} onChange={(next) => { setState(next); setPage(1); }} />
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
