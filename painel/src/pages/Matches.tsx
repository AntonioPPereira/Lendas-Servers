import { useState } from "react";
import { Link } from "react-router-dom";
import { Film, Swords } from "lucide-react";
import { usePageEnter } from "@/hooks/useGsap";
import { useResource } from "@/hooks/useResource";
import { api, type ArchiveEntry, type ArchivePage } from "@/api/client";
import { formatBytes, formatDateTime, formatPeriod, mapLabel, timeAgo } from "@/lib/format";
import { Panel, SectionTitle } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { FilterBar, Select } from "@/components/ui/Field";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";
import { Pagination } from "@/components/ui/Pagination";
import { MapIcon } from "@/components/match/MapIcon";
import { cn } from "@/lib/cn";

/**
 * Arquivo da rede: partidas e gravações no mesmo lugar.
 *
 * As duas coisas viviam em abas separadas, e separar não ajudava ninguém —
 * quem procura uma partida quer o placar E a demo dela. Agora é uma lista
 * só, onde cada linha declara o que tem.
 *
 * A mistura é real e a tela não a esconde: só existe partida a partir do
 * dia em que o `lendas_matches` subiu. Tudo o que foi jogado antes existe
 * apenas como gravação, e são 587 arquivos — some da história se a lista
 * mostrasse só o que tem placar.
 */
export default function Matches() {
  const scope = usePageEnter<HTMLDivElement>();
  const [map, setMap] = useState("all");
  const [page, setPage] = useState(1);
  /**
   * Vazio = deixa o backend escolher o mês mais recente COM conteúdo. Não
   * assumimos o mês do calendário: virada de mês deixaria o arquivo
   * aparentemente vazio até alguém jogar.
   */
  const [periodo, setPeriodo] = useState("");

  const resource = useResource<ArchivePage>(
    ["arquivo", map, page, periodo],
    () => api.archive({ map, page, pageSize: 12, ...(periodo ? { period: periodo } : {}) }),
    { keepPrevious: true },
  );
  const mapas = useResource<string[]>(["arquivo-mapas"], () => api.archiveMaps());

  const itens = resource.data?.items ?? [];
  const opcoes = [
    { value: "all", label: "Todos os mapas" },
    ...(mapas.data ?? []).map((m) => ({ value: m, label: mapLabel(m) })),
  ];

  return (
    <div ref={scope} className="space-y-5">
      <div data-enter>
        <SectionTitle eyebrow="Arquivo" title="Partidas" />
      </div>

      <div data-enter>
        <Panel flush className="overflow-hidden">
          <FilterBar>
            <Select
              label="Mapa"
              value={map}
              onChange={(next: string) => {
                setMap(next);
                setPage(1);
              }}
              options={opcoes}
              className="w-full sm:w-64"
            />
            {resource.data && resource.data.periods.length > 1 ? (
              <Select
                label="Mês"
                value={resource.data.period}
                onChange={(next: string) => {
                  setPeriodo(next);
                  setPage(1);
                }}
                options={resource.data.periods.map((p) => ({ value: p, label: formatPeriod(p) }))}
                className="w-full sm:w-44"
              />
            ) : null}
            {resource.data ? (
              /* Diz a composição do que está na tela, em vez de deixar o
                 leitor concluir sozinho que faltam placares. */
              <span className="ml-auto text-[12px] text-ink-3">
                {resource.data.withScore} com placar · {resource.data.total - resource.data.withScore}{" "}
                só gravação
              </span>
            ) : null}
          </FilterBar>

          {resource.status === "error" ? (
            <ErrorState onRetry={resource.reload} />
          ) : resource.status === "loading" && itens.length === 0 ? (
            <SkeletonRows rows={8} />
          ) : itens.length === 0 ? (
            <EmptyState
              icon={<Swords />}
              title="Nada no arquivo"
              hint="Nenhuma partida ou gravação neste recorte."
            />
          ) : (
            <ul>
              {itens.map((item) => (
                <ArchiveRow key={item.id} item={item} />
              ))}
            </ul>
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

function ArchiveRow({ item }: { item: ArchiveEntry }) {
  const partida = item.kind === "match";
  /**
   * Partida abre o detalhe com placar e Tab; gravação órfã vai direto pra
   * página da demo, que é tudo que existe dela. Um destino só, com metade
   * da tela vazia, seria pior que dois destinos honestos.
   */
  const destino = partida ? "/partidas/" + item.id : "/demos/" + item.id;

  return (
    <li className="border-b border-line-soft last:border-b-0">
      <Link
        to={destino}
        className="row-interactive grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-3 md:grid-cols-[auto_minmax(0,1fr)_150px_150px_auto] md:gap-4"
      >
        <MapIcon map={item.map} className="size-9 shrink-0 rounded-xs" decorative />

        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-medium text-ink">
            {mapLabel(item.map)}
          </span>
          <span className="t-num block truncate text-[11px] text-ink-4">
            {formatDateTime(item.startedAt)}
          </span>
        </span>

        {/* Linha de gravação deixa a coluna vazia em vez de escrever "sem
            placar": o selo à direita já diz o que ela é, e repetir isso em
            cada uma das 579 linhas vira ruído, não informação. */}
        <span className="hidden justify-self-start md:block">
          {partida ? (
            <Placar ct={item.ctScore ?? 0} t={item.tScore ?? 0} rounds={item.roundCount ?? 0} />
          ) : null}
        </span>

        <span className="hidden justify-self-start md:block">
          {item.demo ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-3">
              <Film className="size-3.5 text-ink-4" />
              {formatBytes(item.demo.size)}
            </span>
          ) : (
            <span className="text-[12px] text-ink-4">Sem gravação</span>
          )}
        </span>

        <span className="flex shrink-0 items-center gap-3 justify-self-end">
          <span className="t-num hidden text-[11.5px] text-ink-3 sm:block">
            {timeAgo(item.startedAt)}
          </span>
          <Badge tone={partida ? "brass" : "neutral"}>{partida ? "Partida" : "Gravação"}</Badge>
        </span>
      </Link>
    </li>
  );
}

/**
 * Placar nas cores dos times, com o vencedor em destaque. O lado que perdeu
 * recua — num placar, saber quem ganhou de relance vale mais que ler os
 * dois números com o mesmo peso.
 */
function Placar({ ct, t, rounds }: { ct: number; t: number; rounds: number }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className={cn("t-num text-[16px]", ct >= t ? "text-ct-hi" : "text-ink-4")}>{ct}</span>
      <span className="text-[12px] text-ink-4">×</span>
      <span className={cn("t-num text-[16px]", t >= ct ? "text-t-hi" : "text-ink-4")}>{t}</span>
      <span className="ml-1 text-[11px] text-ink-4">{rounds} rounds</span>
    </span>
  );
}
