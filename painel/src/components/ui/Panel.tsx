import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface PanelProps {
  children: ReactNode;
  className?: string;
  /** Adds the HUD corner brackets. Reserved for live readouts. */
  hud?: boolean;
  flush?: boolean;
}

export function Panel({ children, className, hud = false, flush = false }: PanelProps) {
  return (
    <section className={cn(flush ? "panel-flush" : "panel", hud && "hud-frame", className)}>
      {children}
    </section>
  );
}

interface PanelHeaderProps {
  label: string;
  hint?: string;
  actions?: ReactNode;
  className?: string;
  accent?: "brass" | "ct" | "t" | "danger" | "none";
}

export function PanelHeader({
  label,
  hint,
  actions,
  className,
  accent = "none",
}: PanelHeaderProps) {
  const accentClass = {
    brass: "bg-brass",
    ct: "bg-ct",
    t: "bg-t",
    danger: "bg-danger",
    none: "bg-ink-4",
  }[accent];

  return (
    <header
      className={cn(
        "flex min-h-[46px] items-center gap-3 border-b border-line-soft px-4 py-2.5",
        className,
      )}
    >
      <span className={cn("h-3 w-[2px] shrink-0", accentClass)} aria-hidden="true" />
      <h2 className="t-eyebrow whitespace-nowrap text-ink-2">{label}</h2>
      {hint ? <span className="t-num hidden truncate text-[11px] text-ink-4 sm:block">{hint}</span> : null}
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

interface SectionTitleProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function SectionTitle({
  eyebrow,
  title,
  description,
  actions,
  className,
}: SectionTitleProps) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="t-eyebrow mb-2 text-brass">{eyebrow}</p> : null}
        <h1 className="t-display text-[26px] text-ink sm:text-[32px]">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-[68ch] text-[13px] leading-relaxed text-ink-3">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("hairline my-4", className)} aria-hidden="true" />;
}
