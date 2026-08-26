import { useState } from "react";
import { Swords } from "lucide-react";
import { usePageEnter } from "@/hooks/useGsap";
import { useResource } from "@/hooks/useResource";
import { api, type Page } from "@/api/client";
import type { MatchDetail } from "@/data/types";
import { UNIQUE_MAPS } from "@/data/seed";
import { mapLabel } from "@/lib/format";
import { SectionTitle, Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { FilterBar, Select } from "@/components/ui/Field";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";
import { Pagination } from "@/components/ui/Pagination";
import { MatchCard } from "@/components/match/MatchCard";
import { RoundStripLegend } from "@/components/match/RoundStrip";

const MAP_OPTIONS = [
  { value: "all", label: "Todos os mapas" },
  ...UNIQUE_MAPS.map((map) => ({ value: map, label: mapLabel(map) })),
];

export default function Matches() {
  const scope = usePageEnter<HTMLDivElement>();
  const [map, setMap] = useState("all");
  const [page, setPage] = useState(1);

  const resource = useResource<Page<MatchDetail>>(
    () => api.matches({ map, page, pageSize: 12 }),
    [map, page],
  );

  const matches = resource.data?.items ?? [];

  return (
    <div ref={scope} className="space-y-5">
      <div data-enter>
        <SectionTitle
          eyebrow="Arquivo"
          title="Histórico de partidas"
          description="Toda partida encerrada na rede, com placar, histórico de rodadas e link para a gravação quando existir."
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
              className="w-[180px]"
            />
            <RoundStripLegend className="ml-auto" />
          </FilterBar>

          {resource.status === "error" ? (
            <ErrorState onRetry={resource.reload} />
          ) : resource.status === "loading" && matches.length === 0 ? (
            <SkeletonRows rows={7} />
          ) : matches.length === 0 ? (
            <EmptyState
              icon={<Swords />}
              title="Nenhuma partida neste mapa"
              hint="Escolha outro mapa para ver o histórico completo da rede."
              action={
                <Button size="sm" onClick={() => setMap("all")}>
                  Ver todos os mapas
                </Button>
              }
            />
          ) : (
            <div className="space-y-2 p-3">
              {matches.map((match) => (
                <MatchCard key={match.id} match={match} />
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
