import { useEffect, useMemo, useRef, useState } from "react";
import type { TrendPoint } from "@/data/types";
import { cn } from "@/lib/cn";
import { gsap, prefersReducedMotion } from "@/lib/motion";
import { formatNumber } from "@/lib/format";
import { ChartTooltip } from "./ChartFrame";

interface TrendAreaProps {
  data: TrendPoint[];
  unit?: string;
  height?: number;
  className?: string;
  /** Labels every nth tick on the x axis. */
  tickEvery?: number;
}

/**
 * One series over time. Single measure, single axis, crosshair readout.
 * Text sits in HTML above the plot so it never inherits the SVG stretch.
 */
export function TrendArea({
  data,
  unit = "",
  height = 210,
  className,
  tickEvery = 4,
}: TrendAreaProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const line = useRef<SVGPathElement>(null);
  const fill = useRef<SVGPathElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const { linePath, areaPath, max, peakIndex } = useMemo(() => {
    const values = data.map((d) => d.value);
    const top = Math.max(...values, 1);
    const ceiling = Math.ceil(top / 10) * 10;
    const step = 100 / Math.max(1, data.length - 1);
    const points = data.map((d, i) => [i * step, 100 - (d.value / ceiling) * 92] as const);
    const path = points.map(([x, y], i) => (i === 0 ? "M" : "L") + x + " " + y).join(" ");
    return {
      linePath: path,
      areaPath: path + " L100 100 L0 100 Z",
      max: ceiling,
      peakIndex: values.indexOf(top),
    };
  }, [data]);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const path = line.current;
    if (!path) return;
    const length = path.getTotalLength();

    const tl = gsap.timeline();
    tl.fromTo(
      path,
      { strokeDasharray: length, strokeDashoffset: length },
      { strokeDashoffset: 0, duration: 1.05, ease: "power2.inOut" },
    );
    tl.fromTo(fill.current, { opacity: 0 }, { opacity: 1, duration: 0.6 }, 0.25);

    return () => {
      tl.kill();
    };
  }, [linePath]);

  function onMove(event: React.PointerEvent<HTMLDivElement>) {
    const box = wrap.current?.getBoundingClientRect();
    if (!box || data.length < 2) return;
    const ratio = (event.clientX - box.left) / box.width;
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(ratio * (data.length - 1)))));
  }

  const active = hover === null ? null : data[hover];
  const activeX = hover === null ? 0 : (hover / Math.max(1, data.length - 1)) * 100;
  const activeY = active ? 100 - (active.value / max) * 92 : 0;

  return (
    <div className={cn("relative", className)}>
      <div className="flex">
        {/* Y ticks: three, recessive, aligned to the plot box. */}
        <div
          className="relative w-9 shrink-0"
          style={{ height }}
          aria-hidden="true"
        >
          {[max, Math.round(max / 2), 0].map((value, i) => (
            <span
              key={value + "-" + i}
              className="t-num absolute right-2 -translate-y-1/2 text-[9.5px] text-ink-4"
              style={{ top: (i === 0 ? 8 : i === 1 ? 50 : 92) + "%" }}
            >
              {formatNumber(value)}
            </span>
          ))}
        </div>

        <div
          ref={wrap}
          className="relative min-w-0 flex-1 cursor-crosshair"
          style={{ height }}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="size-full overflow-visible"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-chart-brass)" stopOpacity="0.24" />
                <stop offset="100%" stopColor="var(--color-chart-brass)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {[8, 50, 92].map((y) => (
              <line
                key={y}
                x1="0"
                y1={y}
                x2="100"
                y2={y}
                stroke="var(--color-line-soft)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            <path ref={fill} d={areaPath} fill="url(#trend-fill)" />
            <path
              ref={line}
              d={linePath}
              fill="none"
              stroke="var(--color-brass)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />

            {hover !== null ? (
              <>
                <line
                  x1={activeX}
                  y1="0"
                  x2={activeX}
                  y2="100"
                  stroke="var(--color-line)"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  cx={activeX}
                  cy={activeY}
                  r="4"
                  fill="var(--color-brass)"
                  stroke="var(--color-panel)"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            ) : null}
          </svg>

          {/* Peak is the one point worth naming without a hover. */}
          {data[peakIndex] ? (
            <span
              className="t-num pointer-events-none absolute -translate-x-1/2 -translate-y-full text-[10px] text-brass"
              style={{
                left: (peakIndex / Math.max(1, data.length - 1)) * 100 + "%",
                top: 100 - (data[peakIndex]!.value / max) * 92 + "%",
              }}
            >
              {formatNumber(data[peakIndex]!.value)}
            </span>
          ) : null}

          {active ? (
            <ChartTooltip
              visible
              x={(activeX / 100) * (wrap.current?.clientWidth ?? 0)}
              y={(activeY / 100) * height}
              title={active.label}
              value={formatNumber(active.value) + (unit ? " " + unit : "")}
            />
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex pl-9">
        <div className="flex min-w-0 flex-1 justify-between">
          {data.map((point, i) =>
            i % tickEvery === 0 ? (
              <span key={point.label + i} className="t-num text-[9.5px] text-ink-4">
                {point.label}
              </span>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}
