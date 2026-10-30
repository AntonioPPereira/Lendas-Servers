import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "brass" | "ct" | "t" | "live" | "danger" | "warn" | "info";

const TONES: Record<Tone, string> = {
  neutral: "border-line text-ink-3",
  brass: "border-brass/35 bg-brass/10 text-brass",
  ct: "border-ct/35 bg-ct/10 text-ct-hi",
  t: "border-t/35 bg-t/12 text-t-hi",
  live: "border-live/35 bg-live/10 text-live",
  danger: "border-danger/40 bg-danger/12 text-danger",
  warn: "border-warn/35 bg-warn/10 text-warn",
  info: "border-info/35 bg-info/10 text-info",
};

export function Badge({
  tone = "neutral",
  children,
  className,
  icon,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-xs border px-1.5 py-0.5",
        "font-mono text-[10px] font-medium uppercase tracking-[0.12em]",
        TONES[tone],
        className,
      )}
    >
      {icon ? <span className="[&_svg]:size-[11px]">{icon}</span> : null}
      {children}
    </span>
  );
}

/** Live indicator: a dot plus an expanding ring, CSS-only so it never
 *  competes with the GSAP timelines for main-thread time. */
export function PulseDot({
  tone = "live",
  className,
  still = false,
}: {
  tone?: "live" | "brass" | "danger" | "ink";
  className?: string;
  still?: boolean;
}) {
  const color = {
    live: "bg-live",
    brass: "bg-brass",
    danger: "bg-danger",
    ink: "bg-ink-4",
  }[tone];

  return (
    <span className={cn("relative inline-flex size-2 shrink-0", className)} aria-hidden="true">
      <span className={cn("absolute inset-0 rounded-full", color)} />
      {still ? null : (
        <>
          <span
            className={cn("absolute inset-0 rounded-full", color)}
            style={{ animation: "pulse-live 2.4s ease-in-out infinite" }}
          />
          <span
            className={cn("absolute inset-0 rounded-full", color)}
            style={{ animation: "ring-live 2.4s ease-out infinite" }}
          />
        </>
      )}
    </span>
  );
}

export function TeamTag({ team, className }: { team: "CT" | "T" | "SPEC"; className?: string }) {
  if (team === "SPEC") {
    return (
      <span className={cn("font-mono text-[10px] tracking-[0.16em] text-ink-4", className)}>
        SPEC
      </span>
    );
  }
  return (
    <span
      className={cn(
        "font-mono text-[10px] font-semibold tracking-[0.16em]",
        team === "CT" ? "text-ct" : "text-t",
        className,
      )}
    >
      {team}
    </span>
  );
}
