import { Link } from "react-router-dom";
import { Calendar, Download, HardDrive, Link2 } from "lucide-react";
import type { Demo } from "@/data/types";
import { cn } from "@/lib/cn";
import { demoDownloadUrl } from "@/api/client";
import { formatBytes, mapLabel, mapPrefix } from "@/lib/format";
import { mapBackground } from "@/lib/csAssets";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { copyText } from "@/lib/clipboard";

export function useDemoActions() {
  const toast = useToast();

  return {
    async copyLink(demo: Demo) {
      const url = new URL(demoDownloadUrl(demo.id), window.location.origin).toString();
      const ok = await copyText(url);
      if (ok) toast.success("Link copiado", demo.filename);
      else toast.error("Não foi possível copiar o link");
    },
    /** Navegação direta: o backend transmite o arquivo com os headers certos,
     *  o navegador cuida do resto. Nada de fetch + blob no cliente. */
    download(demo: Demo) {
      window.location.href = demoDownloadUrl(demo.id);
    },
  };
}

export function DemoCard({ demo, className }: { demo: Demo; className?: string }) {
  const actions = useDemoActions();
  const backdrop = mapBackground(demo.map);

  return (
    <article
      className={cn(
        "panel group flex flex-col overflow-hidden",
        "transition-[border-color,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "hover:-translate-y-0.5 hover:border-line",
        className,
      )}
    >
      {/* Placa de identificação: a foto do mapa (quando existe) carrega a
          informação real de onde essa gravação aconteceu, no lugar de um
          cabeçalho só de texto igual a todo o resto do site. */}
      <div className="relative h-24 shrink-0 overflow-hidden bg-abyss">
        {backdrop ? (
          <img
            src={backdrop}
            alt=""
            draggable={false}
            className="absolute inset-0 size-full select-none object-cover [filter:contrast(1.05)_saturate(1.15)]"
          />
        ) : (
          <span className="t-display absolute -right-1 -top-2 select-none text-[64px] leading-none text-ink opacity-[0.06]">
            {mapLabel(demo.map)}
          </span>
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgb(4 4 3 / 0.6) 0%, transparent 24%, transparent 45%, var(--color-abyss) 96%)",
          }}
        />
        <div className="relative z-10 flex h-full flex-col justify-between p-3">
          <span className="flex items-center gap-2">
            <span className="t-eyebrow text-[9px] text-ink-2">{mapPrefix(demo.map)}</span>
            <span className="h-3 w-px bg-line" aria-hidden="true" />
            <span className="t-num min-w-0 flex-1 truncate text-[10.5px] text-ink-3">{demo.server}</span>
          </span>
          <p className="t-display truncate text-[19px] text-ink">{mapLabel(demo.map)}</p>
        </div>
      </div>

      <Link to={"/demos/" + demo.id} className="flex-1 px-3.5 py-3">
        <p className="t-num truncate text-[10.5px] text-ink-4">{demo.filename}</p>

        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
          <Meta icon={<Calendar />} label={demo.date + " · " + demo.time} />
          <Meta icon={<HardDrive />} label={formatBytes(demo.sizeBytes)} />
        </dl>
      </Link>

      <div className="flex gap-1.5 border-t border-line-soft p-2.5">
        <Button
          size="sm"
          variant="outline"
          icon={<Download />}
          className="flex-1"
          onClick={() => actions.download(demo)}
        >
          Baixar
        </Button>
        <Button size="sm" onClick={() => actions.copyLink(demo)} aria-label="Copiar link">
          <Link2 />
        </Button>
      </div>
    </article>
  );
}

function Meta({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-ink-4">
      <span className="[&_svg]:size-3">{icon}</span>
      <span className="t-num truncate text-[10.5px]">{label}</span>
    </div>
  );
}
