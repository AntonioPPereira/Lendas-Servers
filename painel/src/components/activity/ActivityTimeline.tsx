import { useEffect, useRef } from "react";
import { LogIn, LogOut, ShieldX } from "lucide-react";
import type { ActivityEvent, ActivityKind } from "@/data/types";
import { cn } from "@/lib/cn";
import { gsap, prefersReducedMotion } from "@/lib/motion";
import { timeAgo } from "@/lib/format";

const ICONS: Record<ActivityKind, typeof LogIn> = {
  join: LogIn,
  leave: LogOut,
  blocked: ShieldX,
};

const TONES: Record<ActivityKind, string> = {
  join: "text-live",
  leave: "text-ink-4",
  blocked: "text-danger",
};

function teamClass(team?: string) {
  if (team === "CT") return "text-ct-hi";
  if (team === "T") return "text-t-hi";
  return "text-ink-2";
}

function EventBody({ event }: { event: ActivityEvent }) {
  switch (event.kind) {
    case "join":
      return (
        <span>
          <span className={cn("font-medium", teamClass(event.actorTeam))}>{event.actor}</span>{" "}
          <span className="text-ink-4">entrou no servidor</span>
        </span>
      );
    case "leave":
      return (
        <span>
          <span className="font-medium text-ink-3">{event.actor}</span>{" "}
          <span className="text-ink-4">saiu do servidor</span>{" "}
          {/* Quanto tempo ficou: é o que transforma uma saída em informação.
              Vem do plugin, que guarda o horário da aprovação — não é conta
              feita aqui em cima do horário do evento. */}
          {event.detail ? <span className="text-ink-4">— ficou {event.detail}</span> : null}
        </span>
      );
    case "blocked":
      return (
        <span>
          <span className="font-medium text-ink-3">{event.actor}</span>{" "}
          <span className="text-ink-4">foi barrado ao entrar</span>{" "}
          {event.detail ? <span className="text-danger">— {event.detail}</span> : null}
        </span>
      );
    default:
      return null;
  }
}

interface ActivityTimelineProps {
  events: ActivityEvent[];
  limit?: number;
  className?: string;
}

/**
 * New events enter from the top with a short slide; nothing below them moves,
 * so reading position is never lost while the feed is running.
 */
export function ActivityTimeline({ events, limit = 24, className }: ActivityTimelineProps) {
  const list = useRef<HTMLOListElement>(null);
  const topId = useRef<string | null>(null);
  const visible = events.slice(0, limit);

  const newestId = visible[0]?.id;

  useEffect(() => {
    if (!newestId || newestId === topId.current) return;
    const first = topId.current === null;
    topId.current = newestId;
    if (first || prefersReducedMotion()) return;

    const el = list.current?.firstElementChild;
    if (!el) return;

    const tl = gsap.timeline();
    tl.fromTo(el, { opacity: 0, y: -12 }, { opacity: 1, y: 0, duration: 0.3, ease: "power3.out" });
    const marker = el.querySelector("[data-marker]");
    if (marker) {
      tl.fromTo(
        marker,
        { boxShadow: "0 0 0 0 rgba(232,179,58,0.55)" },
        { boxShadow: "0 0 0 7px rgba(232,179,58,0)", duration: 0.6, ease: "power2.out" },
        0,
      );
    }
    // Deliberately no cleanup: a 600ms entrance must be allowed to finish even
    // though the feed re-renders every second.
  }, [newestId]);

  return (
    <ol ref={list} className={cn("relative", className)}>
      <span
        className="absolute bottom-2 left-[15px] top-2 w-px bg-line-soft"
        aria-hidden="true"
      />
      {visible.map((event) => {
        const Icon = ICONS[event.kind];
        return (
          <li key={event.id} className="relative flex items-start gap-3 py-1.5 pl-0">
            <span
              data-marker
              className={cn(
                "relative z-10 mt-0.5 grid size-[31px] shrink-0 place-items-center rounded-xs border border-line-soft bg-panel",
                TONES[event.kind],
              )}
            >
              <Icon className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1 pt-1 text-[12.5px] leading-snug">
              <EventBody event={event} />
            </span>
            <span className="t-num shrink-0 pt-1.5 text-[10px] text-ink-4">
              {timeAgo(event.at)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
