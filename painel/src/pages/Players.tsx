import { useState } from "react";
import { Users } from "lucide-react";
import { usePageEnter } from "@/hooks/useGsap";
import { useResource } from "@/hooks/useResource";
import { api, type PlayersPage } from "@/api/client";
import { formatNumber } from "@/lib/format";
import { SectionTitle, Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { FilterBar, SearchBar } from "@/components/ui/Field";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { Pagination } from "@/components/ui/Pagination";
import { PlayerCard } from "@/components/player/PlayerCard";

export default function Players() {
  const scope = usePageEnter<HTMLDivElement>();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const resource = useResource<PlayersPage>(
    () => api.players({ query, page, pageSize: 24 }),
    [query, page],
  );

  const players = resource.data?.items ?? [];

  return (
    <div ref={scope} className="space-y-5">
      <div data-enter>
        <SectionTitle
          eyebrow="Diretório"
          title="Jogadores"
          description="Ranking real do HLstatsX. Busque por nickname para abrir o perfil — o identificador é o ID interno do HLstatsX, não o Steam ID."
        />
      </div>

      <div data-enter className="grid gap-px overflow-hidden rounded-md bg-line-soft/50 sm:grid-cols-3">
        <Summary label="Jogadores rankeados" value={formatNumber(resource.data?.total ?? 0)} />
        <Summary label="Kills acumuladas" value={formatNumber(resource.data?.totalKills ?? 0)} />
        <Summary label="Headshots acumulados" value={formatNumber(resource.data?.totalHeadshots ?? 0)} />
      </div>

      <div data-enter>
        <Panel flush className="overflow-hidden">
          <FilterBar>
            <SearchBar
              value={query}
              onValueChange={(value) => {
                setQuery(value);
                setPage(1);
              }}
              placeholder="Buscar por nickname"
              shortcut
              className="ml-auto w-full lg:w-80"
            />
          </FilterBar>

          {resource.status === "error" ? (
            <ErrorState
              title="Não foi possível carregar os jogadores"
              hint="O HLstatsX não respondeu. Tente novamente em alguns segundos."
              onRetry={resource.reload}
            />
          ) : resource.status === "loading" && players.length === 0 ? (
            <LoadingState label="Carregando perfis" />
          ) : players.length === 0 ? (
            <EmptyState
              icon={<Users />}
              title="Nenhum jogador encontrado"
              hint="Tente outro nickname."
              action={
                <Button size="sm" onClick={() => setQuery("")}>
                  Limpar busca
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {players.map((player) => (
                <PlayerCard key={player.id} player={player} />
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

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-panel px-4 py-3.5">
      <p className="t-eyebrow text-[8.5px]">{label}</p>
      <p className="t-display mt-2 text-[22px] tabular-nums text-ink">{value}</p>
    </div>
  );
}
