import { cn } from "@/lib/cn";
import { mapIcon } from "@/lib/csAssets";
import { mapLabel, mapPrefix } from "@/lib/format";

/**
 * Ícone oficial do mapa quando existe. A rotação clássica do Source tem vários
 * mapas que nunca ganharam ícone no CS:GO, então o fallback é uma placa com o
 * prefixo (DE / CS) — nunca um buraco no layout.
 */
export function MapIcon({
  map,
  className,
  decorative = false,
}: {
  map: string;
  className?: string;
  decorative?: boolean;
}) {
  const src = mapIcon(map);

  if (src) {
    return (
      <img
        src={src}
        alt={decorative ? "" : mapLabel(map)}
        aria-hidden={decorative || undefined}
        draggable={false}
        className={cn("size-6 shrink-0 select-none object-contain", className)}
      />
    );
  }

  return (
    <span
      aria-hidden={decorative || undefined}
      className={cn(
        "t-num grid size-6 shrink-0 place-items-center rounded-xs border border-line bg-panel-2 text-[8px] text-ink-3",
        className,
      )}
    >
      {mapPrefix(map)}
    </span>
  );
}
