import { useEffect, useRef, useState } from "react";
import type { TrendPoint } from "@/data/types";
import { cn } from "@/lib/cn";
import { gsap, prefersReducedMotion } from "@/lib/motion";
import { formatCompact, formatNumber, mapLabel } from "@/lib/format";
import { ChartTooltip } from "./ChartFrame";

/** Vertical columns for a count over a short, ordered window. */
export function BarColumns({
  data,
  height = 180,
  className,
}: {
  data: TrendPoint[];
  height?: number;
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 1);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const bars = wrap.current?.querySelectorAll("[data-bar]");
    if (!bars?.length) return;
    const tween = gsap.fromTo(
      bars,
      { scaleY: 0 },
      { scaleY: 1, duration: 0.55, ease: "power3.out", stagger: 0.025, transformOrigin: "50% 100%" },
    );
    return () => {
      tween.kill();
    };
  }, [data]);

  return (
    <div className={cn("relative", className)}>
      <div ref={wrap} className="flex items-end gap-[2px]" style={{ height }}>
        {data.map((point, index) => (
          <button
            key={point.label + index}
            type="button"
            onPointerEnter={() => setHover(index)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(index)}
            onBlur={() => setHover(null)}
            className="group flex h-full min-w-0 flex-1 items-end"
            aria-label={point.label + ": " + formatNumber(point.value)}
          >
            <span
              data-bar
              className={cn(
                "block w-full rounded-t-[4px] transition-colors",
                hover === index ? "bg-brass" : "bg-chart-brass",
              )}
              style={{ height: (point.value / max) * 100 + "%" }}
            />
          </button>
        ))}
      </div>

      <div className="mt-2 flex gap-[2px]">
        {data.map((point, index) => (
          <span
            key={point.label + index}
            className="t-num min-w-0 flex-1 text-center text-[9px] text-ink-4"
          >
            {index % 2 === 0 ? point.label : ""}
          </span>
        ))}
      </div>

      {hover !== null && data[hover] ? (
        <ChartTooltip
          visible
          x={((hover + 0.5) / data.length) * (wrap.current?.clientWidth ?? 0)}
          y={height - (data[hover]!.value / max) * height}
          title={data[hover]!.label}
          value={formatNumber(data[hover]!.value)}
        />
      ) : null}
    </div>
  );
}

/**
 * Ranked magnitude with long labels: horizontal bars, one hue, every bar
 * directly labelled because there are few enough to read at once.
 */
export function RankedBars({
  data,
  format = formatNumber,
  labelFormat,
  className,
}: {
  data: TrendPoint[];
  format?: (value: number) => string;
  labelFormat?: (label: string) => string;
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const max = Math.max(...data.map((d) => d.value), 1);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const bars = wrap.current?.querySelectorAll("[data-bar]");
    if (!bars?.length) return;
    const tween = gsap.fromTo(
      bars,
      { scaleX: 0 },
      { scaleX: 1, duration: 0.6, ease: "power3.out", stagger: 0.05, transformOrigin: "0% 50%" },
    );
    return () => {
      tween.kill();
    };
  }, [data]);

  return (
    <div ref={wrap} className={cn("space-y-2.5", className)}>
      {data.map((point) => (
        <div key={point.label} className="group grid grid-cols-[92px_1fr_56px] items-center gap-3">
          <span className="t-num truncate text-[11px] text-ink-2">
            {labelFormat ? labelFormat(point.label) : point.label}
          </span>
          <span className="h-2 min-w-0 rounded-[2px] bg-raised/60">
            <span
              data-bar
              className="block h-2 rounded-r-[4px] bg-chart-brass transition-colors group-hover:bg-brass"
              style={{ width: (point.value / max) * 100 + "%" }}
            />
          </span>
          <span className="t-num text-right text-[11px] tabular-nums text-ink-3">
            {format(point.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Two-category parts of a whole: one bar, a 2px gap, both sides labelled. */
export function SplitBar({
  left,
  right,
  className,
}: {
  left: { label: string; value: number };
  right: { label: string; value: number };
  className?: string;
}) {
  const total = Math.max(1, left.value + right.value);
  const leftPct = (left.value / total) * 100;

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="t-eyebrow text-[9px] text-chart-ct">{left.label}</span>
        <span className="t-eyebrow text-[9px] text-chart-t">{right.label}</span>
      </div>
      <div className="mt-2 flex h-2.5 gap-[2px]">
        <span
          className="block rounded-l-[2px] rounded-r-[4px] bg-chart-ct"
          style={{ width: leftPct + "%" }}
        />
        <span className="block flex-1 rounded-l-[4px] rounded-r-[2px] bg-chart-t" />
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        <span className="t-num text-[11.5px] text-ink-2">{formatCompact(left.value)}</span>
        <span className="t-num text-[11.5px] text-ink-2">{formatCompact(right.value)}</span>
      </div>
    </div>
  );
}

export const mapBarLabel = (label: string) => mapLabel(label);
