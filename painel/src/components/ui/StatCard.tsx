import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useCountUp } from "@/hooks/useCountUp";
import { formatNumber } from "@/lib/format";

interface StatCardProps {
  label: string;
  value: number;
  format?: (value: number) => string;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "brass" | "ct" | "t" | "danger";
  className?: string;
  children?: ReactNode;
}

const TONE_TEXT = {
  default: "text-ink",
  brass: "text-brass",
  ct: "text-ct-hi",
  t: "text-t-hi",
  danger: "text-danger",
};

export function StatCard({
  label,
  value,
  format = formatNumber,
  hint,
  icon,
  tone = "default",
  className,
  children,
}: StatCardProps) {
  const ref = useCountUp<HTMLSpanElement>(value, { format });

  return (
    <article
      className={cn(
        "panel group relative overflow-hidden px-4 py-3.5",
        "transition-[border-color,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "hover:-translate-y-px hover:border-line",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="t-eyebrow">{label}</p>
        {icon ? (
          <span className="shrink-0 text-ink-4 transition-colors group-hover:text-brass [&_svg]:size-4">
            {icon}
          </span>
        ) : null}
      </div>

      <p className={cn("t-display mt-2.5 text-[27px] tabular-nums", TONE_TEXT[tone])}>
        <span ref={ref}>0</span>
      </p>

      {hint ? <p className="mt-1 text-[11.5px] text-ink-4">{hint}</p> : null}
      {children}
    </article>
  );
}
