import { useMemo, useState } from "react";
import { Activity as ActivityIcon, Pause, Play } from "lucide-react";
import { usePageEnter } from "@/hooks/useGsap";
import { useRealActivity } from "@/hooks/useRealActivity";
import type { ActivityEvent, ActivityKind } from "@/data/types";
import { SectionTitle, Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { FilterBar, Segmented } from "@/components/ui/Field";
import { PulseDot } from "@/components/ui/Badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { ActivityTimeline } from "@/components/activity/ActivityTimeline";

/** Referência estável: evita recriar o array a cada render enquanto carrega. */
const EMPTY_EVENTS: ActivityEvent[] = [];

type Lens = "all" | ActivityKind;

const LENSES: Array<{ value: Lens; label: string }> = [
  { value: "all", label: "Tudo" },
  { value: "join", label: "Entradas" },
  { value: "leave", label: "Saídas" },
  { value: "blocked", label: "Barrados" },
];

export default function Activity() {
  const scope = usePageEnter<HTMLDivElement>();
  const resource = useRealActivity();
  const live = resource.data ?? EMPTY_EVENTS;
  const [lens, setLens] = useState<Lens>("all");
  const [paused, setPaused] = useState(false);
  const [frozen, setFrozen] = useState<ActivityEvent[]>([]);

  const source = paused ? frozen : live;

  const events = useMemo(
    () => (lens === "all" ? source : source.filter((event) => event.kind === lens)),
    [source, lens],
  );

  function togglePause() {
    if (!paused) setFrozen(live);
    setPaused((value) => !value);
  }

  return (
    <div ref={scope} className="space-y-5">
      <div data-enter>
        <SectionTitle
          eyebrow="Feed do servidor"
          title="Atividade ao vivo"
          actions={
            <Button
              icon={paused ? <Play /> : <Pause />}
              onClick={togglePause}
              variant={paused ? "primary" : "outline"}
            >
              {paused ? "Retomar" : "Pausar"}
            </Button>
          }
        />
      </div>

      <div data-enter>
        <Panel flush className="overflow-hidden">
          <FilterBar>
            <Segmented options={LENSES} value={lens} onChange={setLens} />
            <span className="ml-auto flex items-center gap-2">
              <PulseDot tone={paused ? "brass" : "live"} still={paused} />
              <span className="t-eyebrow text-[9px]">
                {paused ? "Feed pausado" : "Recebendo eventos"}
              </span>
            </span>
          </FilterBar>

          {resource.status === "error" ? (
            <ErrorState
              title="Não foi possível carregar a atividade"
              hint="O servidor de arquivos (SFTP), de onde vêm os logs do filtro de requisitos, está indisponível no momento. Tente novamente em instantes."
              onRetry={resource.reload}
            />
          ) : resource.status === "loading" && live.length === 0 ? (
            <LoadingState label="Consultando o filtro de requisitos" />
          ) : events.length === 0 ? (
            <EmptyState
              icon={<ActivityIcon />}
              title="Nada aconteceu ainda neste filtro"
              hint="Assim que o servidor emitir um evento deste tipo, ele aparece aqui."
            />
          ) : (
            <div className="px-4 py-3">
              <ActivityTimeline events={events} limit={60} />
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
