import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { gsap, prefersReducedMotion } from "@/lib/motion";

interface MeterProps {
  value: number;
  max: number;
  className?: string;
  tone?: "brass" | "ct" | "t" | "live" | "danger" | "ink";
  /** Draws slot ticks behind the fill, like a server browser capacity bar. */
  segments?: number;
  height?: number;
}

const TONE_FILL: Record<string, string> = {
  brass: "bg-gradient-to-r from-brass-lo to-brass",
  ct: "bg-gradient-to-r from-ct-dim to-ct",
  t: "bg-gradient-to-r from-t/50 to-t",
  live: "bg-gradient-to-r from-live/50 to-live",
  danger: "bg-gradient-to-r from-danger/50 to-danger",
  ink: "bg-ink-4",
};

export function Meter({
  value,
  max,
  className,
  tone = "brass",
  segments = 0,
  height = 4,
}: MeterProps) {
  const fill = useRef<HTMLSpanElement>(null);
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));

  useEffect(() => {
    const el = fill.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.style.width = pct + "%";
      return;
    }
    const tween = gsap.to(el, { width: pct + "%", duration: 0.7, ease: "power3.out" });
    return () => {
      tween.kill();
    };
  }, [pct]);

  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-full bg-raised/70", className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      {segments > 0 ? (
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, transparent 0 calc(100% / " +
              segments +
              " - 1px), var(--color-void) calc(100% / " +
              segments +
              " - 1px) calc(100% / " +
              segments +
              "))",
          }}
          aria-hidden="true"
        />
      ) : null}
      <span
        ref={fill}
        className={cn("absolute inset-y-0 left-0 w-0", TONE_FILL[tone])}
        aria-hidden="true"
      />
    </div>
  );
}
