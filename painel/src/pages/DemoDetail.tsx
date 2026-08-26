import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, Link2, PlayCircle } from "lucide-react";
import { usePageEnter } from "@/hooks/useGsap";
import { useResource } from "@/hooks/useResource";
import { api } from "@/api/client";
import type { Demo } from "@/data/types";
import { formatBytes, mapLabel, mapPrefix } from "@/lib/format";
import { mapBackground } from "@/lib/csAssets";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { useDemoActions } from "@/components/demo/DemoCard";

export default function DemoDetail() {
  const { id = "" } = useParams();
  const scope = usePageEnter<HTMLDivElement>();
  const actions = useDemoActions();

  const demo = useResource<Demo>(() => api.demo(id), [id]);

  if (demo.status === "error") {
    return (
      <Panel>
        <ErrorState
          title="Demo não encontrada"
          hint="O arquivo pode ter sido removido do servidor ou o link está incorreto."
          onRetry={demo.reload}
        />
      </Panel>
    );
  }

  if (!demo.data) {
    return (
      <Panel>
        <LoadingState label="Consultando o servidor de demos" />
      </Panel>
    );
  }

  const file = demo.data;
  const backdrop = mapBackground(file.map);

  return (
    <div ref={scope} className="space-y-5">
      <div data-enter className="flex flex-wrap items-center gap-3">
        <Link
          to="/demos"
          className="t-eyebrow flex items-center gap-1.5 text-[9px] text-ink-3 transition-colors hover:text-brass"
        >
          <ArrowLeft className="size-3.5" />
          Biblioteca
        </Link>
        <span className="t-num text-[10.5px] text-ink-4">/ {file.id}</span>
      </div>

      <div data-enter>
        <Panel hud className="overflow-hidden">
          <div className="relative overflow-hidden">
            {/* Mesma placa de identificação por foto do mapa, num tamanho
                maior — a página de uma demo é o lugar de mais espaço pra
                mostrar de verdade onde aquela partida aconteceu. */}
            <div className="absolute inset-0" aria-hidden="true">
              {backdrop ? (
                <img
                  src={backdrop}
                  alt=""
                  draggable={false}
                  className="absolute inset-0 size-full select-none object-cover opacity-80 [filter:contrast(1.05)_saturate(1.15)]"
                />
              ) : (
                <span className="t-display absolute -right-2 -top-4 select-none text-[120px] leading-none text-ink opacity-[0.05]">
                  {mapLabel(file.map)}
                </span>
              )}
              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(180deg, rgb(4 4 3 / 0.55) 0%, rgb(4 4 3 / 0.3) 45%, var(--color-abyss) 96%)" }}
              />
            </div>

            <div className="relative">
              <PanelHeader label="Gravação" accent="brass" hint={mapPrefix(file.map)} />

              <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:p-5">
                <div className="min-w-0 [text-shadow:0_1px_4px_rgb(0_0_0_/_0.85)]">
                  <h1 className="t-display text-[32px] text-ink sm:text-[40px]">{mapLabel(file.map)}</h1>
                  <p className="t-num mt-2 break-all text-[11.5px] text-ink-3">{file.filename}</p>
                  <p className="t-num mt-4 text-[13px] text-ink-2">
                    Gravada em {file.date} às {file.time}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col gap-2 lg:w-[220px]">
                  <Button
                    variant="primary"
                    size="lg"
                    icon={<Download />}
                    block
                    onClick={() => actions.download(file)}
                  >
                    Baixar demo
                  </Button>
                  <Button icon={<Link2 />} block onClick={() => actions.copyLink(file)}>
                    Copiar link
                  </Button>

                  <div className="mt-2 rounded-xs border border-dashed border-line bg-panel-2/40 p-3">
                    <p className="t-eyebrow flex items-center gap-1.5 text-[8.5px] text-ink-4">
                      <PlayCircle className="size-3" />
                      Reprodução no navegador
                    </p>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-ink-4">
                      Um arquivo .dem não é um vídeo — não existe player de navegador pra ele. Baixe e
                      rode <span className="t-num text-ink-3">playdemo {file.filename}</span> no
                      console do Counter-Strike: Source.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <dl className="grid gap-px border-t border-line-soft bg-line-soft/50 sm:grid-cols-4">
            <Meta label="Mapa" value={mapLabel(file.map)} />
            <Meta label="Tamanho" value={formatBytes(file.sizeBytes)} />
            <Meta label="Gravada em" value={`${file.date} · ${file.time}`} />
            <Meta label="Servidor" value={file.server} />
          </dl>
        </Panel>
      </div>

      <div data-enter>
        <Panel className="p-4">
          <p className="t-eyebrow text-ink-4">Placar, rounds e MVP</p>
          <p className="mt-2 max-w-[62ch] text-[12px] leading-relaxed text-ink-4">
            Esta gravação ainda não está associada a um registro de partida — o vínculo depende do
            plugin SourceMod (que reporta o placar em tempo real) ou de um parser do próprio
            arquivo .dem, nenhum dos dois implementado ainda. O que este arquivo prova é só o que o
            filesystem confirma: nome, mapa, data/hora e tamanho, acima.
          </p>
        </Panel>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-panel px-4 py-3">
      <dt className="t-eyebrow text-[8.5px]">{label}</dt>
      <dd className="t-num mt-1.5 truncate text-[12.5px] text-ink-2">{value}</dd>
    </div>
  );
}
