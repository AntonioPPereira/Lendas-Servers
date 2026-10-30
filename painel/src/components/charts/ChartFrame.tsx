import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Shared chrome: title, single-series caption, and the plot slot. */
export function ChartFrame({
  title,
  caption,
  legend,
  children,
  className,
}: {
  title: string;
  caption?: string;
  legend?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn("panel flex flex-col p-4", className)}>
      <figcaption className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="t-title text-[12px] text-ink">{title}</h3>
          {caption ? <p className="mt-1 text-[11.5px] text-ink-4">{caption}</p> : null}
        </div>
        {legend}
      </figcaption>
      {children}
    </figure>
  );
}

export function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2 rounded-[1px]" style={{ background: color }} aria-hidden="true" />
      <span className="t-eyebrow text-[9px] text-ink-3">{label}</span>
    </span>
  );
}

export function ChartTooltip({
  x,
  y,
  title,
  value,
  visible,
}: {
  x: number;
  y: number;
  title: string;
  value: string;
  visible: boolean;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xs border border-line bg-void/95 px-2 py-1.5 transition-opacity duration-100",
        visible ? "opacity-100" : "opacity-0",
      )}
      style={{ left: x, top: y - 10 }}
      role="tooltip"
    >
      <p className="t-eyebrow text-[9px] text-ink-4">{title}</p>
      <p className="t-num mt-0.5 text-[12px] text-ink">{value}</p>
    </div>
  );
}
