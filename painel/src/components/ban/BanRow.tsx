import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Gavel, MicOff, MessageSquareOff, VolumeX } from "lucide-react";
import type { Ban, BanKind } from "@/data/types";
import { cn } from "@/lib/cn";
import { gsap, prefersReducedMotion } from "@/lib/motion";
import { formatDateTime, steamProfileUrl, timeAgo } from "@/lib/format";
import { banTimeLeft } from "@/data/bans";
import { Badge } from "@/components/ui/Badge";
import { PlayerAvatar } from "@/components/player/PlayerAvatar";

const KIND: Record<BanKind, { label: string; icon: typeof Gavel }> = {
  ban: { label: "Ban", icon: Gavel },
  mute: { label: "Mute", icon: MicOff },
  gag: { label: "Gag", icon: MessageSquareOff },
  silence: { label: "Silence", icon: VolumeX },
};

const STATE = {
  active: { label: "Ativo", tone: "danger" as const },
  permanent: { label: "Permanente", tone: "danger" as const },
  expired: { label: "Expirado", tone: "neutral" as const },
};

export function BanRow({ ban }: { ban: Ban }) {
  const [open, setOpen] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const kind = KIND[ban.kind];
  const state = STATE[ban.state];
  const enforced = ban.state !== "expired";

  function toggle() {
    const el = body.current;
    setOpen((value) => !value);
    if (!el || prefersReducedMotion()) return;

    if (!open) {
      gsap.fromTo(
        el,
        { height: 0, opacity: 0 },
        { height: "auto", opacity: 1, duration: 0.34, ease: "power3.out" },
      );
    }
  }

  return (
    <div
      className={cn(
        "relative border-b border-line-soft last:border-b-0",
        enforced && "bg-danger/[0.025]",
      )}
    >
      {enforced ? (
        <span
          className={cn(
            "absolute inset-y-0 left-0 w-[2px]",
            ban.state === "permanent" ? "bg-danger" : "bg-danger/60",
          )}
          aria-hidden="true"
        />
      ) : null}

      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="row-interactive grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-3 text-left md:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)_120px_100px_28px]"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <PlayerAvatar seed={ban.target.avatarSeed} nickname={ban.target.nickname} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] text-ink">{ban.target.nickname}</span>
            <span className="t-num block truncate text-[10px] text-ink-4">
              {ban.target.steamId}
            </span>
          </span>
        </span>

        <span className="hidden min-w-0 md:block">
          <span className="flex items-center gap-1.5 text-ink-2">
            <kind.icon className="size-3 shrink-0 text-ink-4" />
            <span className="truncate text-[12px]">{ban.reason}</span>
          </span>
          <span className="t-num mt-0.5 block text-[10px] text-ink-4">
            por {ban.admin} · {ban.serverName}
          </span>
        </span>

        <span className="t-num hidden text-[11px] text-ink-3 md:block">
          {timeAgo(ban.createdAt)}
        </span>

        <span className="hidden md:block">
          <Badge tone={state.tone}>{state.label}</Badge>
        </span>

        <span className="flex items-center gap-2 justify-self-end md:justify-self-center">
          <span className="md:hidden">
            <Badge tone={state.tone}>{state.label}</Badge>
          </span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-ink-4 transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </span>
      </button>

      {open ? (
        <div ref={body} className="overflow-hidden">
          <dl
            className={cn(
              "grid gap-x-6 gap-y-3 px-3.5 pb-4 pl-[46px] sm:grid-cols-2 lg:grid-cols-4",
              enforced && "hatch-danger",
            )}
          >
            <Field label="Motivo">{ban.reason}</Field>
            <Field label="Aplicado por">{ban.admin}</Field>
            <Field label="Servidor">{ban.serverName}</Field>
            <Field label="Tipo">{kind.label}</Field>
            <Field label="Data">{formatDateTime(ban.createdAt)}</Field>
            <Field label="Expira">
              {ban.expiresAt ? formatDateTime(ban.expiresAt) : "Nunca"}
            </Field>
            <Field label="Restante">{banTimeLeft(ban)}</Field>
            <Field label="IP">{ban.ipMasked}</Field>
            <Field label="Steam ID 64">{ban.target.steamId64}</Field>
            <Field label="Perfil">
              <a
                href={steamProfileUrl(ban.target.steamId64)}
                target="_blank"
                rel="noreferrer"
                className="text-brass underline-offset-2 hover:underline"
              >
                Abrir no Steam
              </a>
            </Field>
            {ban.evidence ? (
              <Field label="Evidência">
                <Link to={"/demos/" + ban.evidence} className="text-brass underline-offset-2 hover:underline">
                  Demo {ban.evidence}
                </Link>
              </Field>
            ) : null}
          </dl>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="t-eyebrow text-[8.5px]">{label}</dt>
      <dd className="t-num mt-1 break-words text-[11.5px] text-ink-2">{children}</dd>
    </div>
  );
}
