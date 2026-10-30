import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { usePageEnter } from "@/hooks/useGsap";
import { STALE } from "@/lib/queryClient";
import { SERVERS_KEY } from "@/hooks/useRealServers";
import { useResource } from "@/hooks/useResource";
import { api } from "@/api/client";
import type { RealServer } from "@/data/types";
import { formatNumber } from "@/lib/format";
import { SectionTitle, Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { SearchBar, Segmented, FilterBar } from "@/components/ui/Field";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { ServerCard } from "@/components/server/ServerCard";

type Filter = "all" | "populated" | "empty";

const FILTERS = [
  { value: "all" as const, label: "Todos" },
  { value: "populated" as const, label: "Com jogadores" },
  { value: "empty" as const, label: "Vazios" },
];

/** Referência estável: `resource.data ?? []` inline criaria um array novo a
 *  cada render e quebraria a memoização de `visible`/`totals` abaixo. */
const EMPTY_SERVERS: RealServer[] = [];

export default function Servers() {
  const scope = usePageEnter<HTMLDivElement>();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  // Mesma chave do useRealServers (topbar e sidebar): esta página entra
  // aproveitando o cache que já existe, sem uma segunda raspagem do HLstatsX.
  const resource = useResource<RealServer[]>(SERVERS_KEY, () => api.servers(), {
    staleTime: STALE.servers,
    refetchInterval: 15_000,
  });
  const servers = resource.data ?? EMPTY_SERVERS;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return servers.filter((server) => {
      if (filter === "populated" && server.players === 0) return false;
      if (filter === "empty" && server.players > 0) return false;
      if (!needle) return true;
      return server.name.toLowerCase().includes(needle) || server.map.includes(needle);
    });
  }, [servers, filter, query]);

  const totals = useMemo(
    () => ({
      players: servers.reduce((n, s) => n + s.players, 0),
      slots: servers.reduce((n, s) => n + s.maxPlayers, 0),
    }),
    [servers],
  );

  return (
    <div ref={scope} className="space-y-5">
      <div data-enter>
        <SectionTitle
          eyebrow="Infraestrutura"
          title="Servidores"
          actions={
            <Button icon={<RefreshCw />} onClick={resource.reload} disabled={resource.status === "loading"}>
              Atualizar
            </Button>
          }
        />
      </div>

      <div data-enter className="grid gap-px overflow-hidden rounded-md bg-line-soft/50 sm:grid-cols-3">
        <Summary label="Jogadores conectados" value={formatNumber(totals.players)} />
        <Summary label="Slots disponíveis" value={formatNumber(totals.slots - totals.players)} />
        <Summary label="Servidores monitorados" value={String(servers.length)} />
      </div>

      <div data-enter>
        <Panel flush className="overflow-hidden">
          <FilterBar>
            <Segmented options={FILTERS} value={filter} onChange={setFilter} />
            <SearchBar
              value={query}
              onValueChange={setQuery}
              placeholder="Filtrar por nome ou mapa"
              shortcut
              className="ml-auto w-full sm:w-72"
            />
          </FilterBar>

          {resource.status === "error" ? (
            <ErrorState
              title="Não foi possível carregar os servidores"
              hint="O HLstatsX não respondeu. Tente novamente em alguns segundos."
              onRetry={resource.reload}
            />
          ) : resource.status === "loading" && servers.length === 0 ? (
            <LoadingState label="Consultando HLstatsX" />
          ) : visible.length === 0 ? (
            <EmptyState
              title="Nenhum servidor com esse filtro"
              hint="Limpe a busca ou troque o filtro para ver a rede inteira."
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  Limpar filtros
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 p-4 md:grid-cols-2 2xl:grid-cols-3">
              {visible.map((server) => (
                <ServerCard key={server.id} server={server} />
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-panel px-4 py-3.5">
      <p className="t-eyebrow text-[8.5px]">{label}</p>
      <p className="t-display mt-2 text-[22px] tabular-nums text-ink">{value}</p>
    </div>
  );
}
