import { Link } from "react-router-dom";
import { Calendar, Download, HardDrive, Link2 } from "lucide-react";
import type { Demo } from "@/data/types";
import { cn } from "@/lib/cn";
import { demoDownloadUrl } from "@/api/client";
import { formatBytes, mapLabel, mapPrefix } from "@/lib/format";
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

  return (
    <article
      className={cn(
        "panel group flex flex-col overflow-hidden",
        "transition-[border-color,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "hover:-translate-y-0.5 hover:border-line",
        className,
      )}
    >
      <header className="flex items-center gap-2 border-b border-line-soft px-3.5 py-2.5">
        <span className="t-eyebrow text-[9px] text-ink-4">{mapPrefix(demo.map)}</span>
        <span className="h-3 w-px bg-line" aria-hidden="true" />
        <span className="t-num min-w-0 flex-1 truncate text-[10.5px] text-ink-4">{demo.server}</span>
      </header>

      <Link to={"/demos/" + demo.id} className="flex-1 px-3.5 py-3.5">
        <p className="t-display text-[24px] text-ink">{mapLabel(demo.map)}</p>
        <p className="t-num mt-2 truncate text-[10.5px] text-ink-4">{demo.filename}</p>

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
