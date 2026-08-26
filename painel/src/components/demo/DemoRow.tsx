import { Link } from "react-router-dom";
import { Download, Link2 } from "lucide-react";
import type { Demo } from "@/data/types";
import { formatBytes, mapLabel } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { useDemoActions } from "./DemoCard";

export function DemoListHeader() {
  return (
    <div className="hidden grid-cols-[minmax(0,1.6fr)_120px_96px_96px] gap-3 border-b border-line-soft px-4 py-2 lg:grid">
      <span className="t-eyebrow text-[8.5px]">Arquivo</span>
      <span className="t-eyebrow text-[8.5px]">Gravada em</span>
      <span className="t-eyebrow text-right text-[8.5px]">Tamanho</span>
      <span className="t-eyebrow text-right text-[8.5px]">Ações</span>
    </div>
  );
}

export function DemoRow({ demo }: { demo: Demo }) {
  const actions = useDemoActions();

  return (
    <div className="row-interactive grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 lg:grid-cols-[minmax(0,1.6fr)_120px_96px_96px]">
      <Link to={"/demos/" + demo.id} className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="t-title truncate text-[12.5px] text-ink">{mapLabel(demo.map)}</span>
        </span>
        <span className="t-num mt-0.5 block truncate text-[10.5px] text-ink-4">
          {demo.filename} · {demo.server}
        </span>
      </Link>

      <span className="t-num hidden text-[11.5px] text-ink-3 lg:block">
        {demo.date} · {demo.time}
      </span>

      <span className="t-num hidden text-right text-[11.5px] text-ink-3 lg:block">
        {formatBytes(demo.sizeBytes)}
      </span>

      <span className="flex shrink-0 items-center justify-end gap-1.5">
        <Button
          size="sm"
          variant="quiet"
          onClick={() => actions.copyLink(demo)}
          aria-label="Copiar link da demo"
        >
          <Link2 />
        </Button>
        <Button size="sm" variant="outline" icon={<Download />} onClick={() => actions.download(demo)}>
          Baixar
        </Button>
      </span>
    </div>
  );
}
