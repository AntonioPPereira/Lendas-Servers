import { useMemo } from "react";
import { cn } from "@/lib/cn";

/**
 * A glyph, not a chart: no axes, no tooltip. It answers one question at a
 * glance — is this server filling up or emptying out.
 */
export function Sparkline({
  values,
  className,
  tone = "brass",
}: {
  values: number[];
  className?: string;
  tone?: "brass" | "ct" | "ink";
}) {
  const { line, area } = useMemo(() => {
    if (values.length < 2) return { line: "", area: "" };
    const max = Math.max(...values, 1);
    const step = 100 / (values.length - 1);
    const points = values.map((value, i) => [i * step, 30 - (value / max) * 26]);
    const path = points.map(([x, y], i) => (i === 0 ? "M" : "L") + x + " " + y).join(" ");
    return { line: path, area: path + " L100 30 L0 30 Z" };
  }, [values]);

  const stroke =
    tone === "brass" ? "var(--color-brass)" : tone === "ct" ? "var(--color-ct)" : "var(--color-ink-3)";

  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      className={cn("h-7 w-full", className)}
      aria-hidden="true"
    >
      <path d={area} fill={stroke} opacity="0.1" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
