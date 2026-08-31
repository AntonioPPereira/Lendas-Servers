import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Gavel, MicOff, MessageSquareOff, VolumeX } from "lucide-react";
import type { Ban, BanKind } from "@/data/types";
import { cn } from "@/lib/cn";
import { gsap, prefersReducedMotion } from "@/lib/motion";
import { formatDate, formatDateTime, steamProfileUrl, timeAgo } from "@/lib/format";
import { banTimeLeft } from "@/lib/banTime";
import { Badge } from "@/components/ui/Badge";
import { PlayerAvatar } from "@/components/player/PlayerAvatar";

/**
 * O tipo carrega cor porque a diferença importa: um ban tira a pessoa do
 * servidor, um mute só cala. Antes os quatro usavam o mesmo cinza e a
 * distinção só existia no ícone, pequeno demais pra ser lida de relance.
 */
const KIND: Record<BanKind, { label: string; icon: typeof Gavel; tint: string }> = {
  ban: { label: "Ban", icon: Gavel, tint: "text-danger/80" },
  mute: { label: "Mute", icon: MicOff, tint: "text-warn/75" },
  gag: { label: "Gag", icon: MessageSquareOff, tint: "text-warn/75" },
  silence: { label: "Silence", icon: VolumeX, tint: "text-warn/75" },
};

/**
 * Três pesos, não três cores: permanente é o mais forte (preenchido),
 * ativo vem em seguida (contorno) e expirado recua pro cinza. Antes
 * permanente e ativo dividiam o mesmo vermelho e nada separava "está
 * valendo pra sempre" de "está valendo por enquanto".
 */
const STATE = {
  active: { label: "Ativo", tone: "danger" as const, className: "" },
  permanent: {
    label: "Permanente",
    tone: "danger" as const,
    className: "border-danger/70 bg-danger/22 text-danger",
  },
  expired: { label: "Expirado", tone: "neutral" as const, className: "text-ink-4" },
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
        /* A coluna do jogador é FIXA e o motivo leva a sobra. Com as duas
           em fração (1fr / 1.9fr), numa tela larga o nome ficava com uns
           460px pra ocupar 200, e o vão morto no meio da linha era o que
           fazia a página inteira parecer vazia. */
        className="row-interactive grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-2.5 text-left md:grid-cols-[248px_minmax(0,1fr)_128px_104px_28px] md:gap-4 xl:grid-cols-[288px_minmax(0,1fr)_146px_112px_28px]"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {/* Cresceu de "sm" pra "md": agora que a foto real da Steam chega
              nesta página, um selo de 24px desperdiçava a única imagem da
              linha. */}
          <PlayerAvatar
            seed={ban.target.avatarSeed}
            nickname={ban.target.nickname}
            avatarUrl={ban.target.avatarUrl}
            size="md"
          />
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-medium text-ink">
              {ban.target.nickname}
            </span>
            <span className="t-num block truncate text-[10.5px] text-ink-4">
              {ban.target.steamId}
            </span>
          </span>
        </span>

        <span className="hidden min-w-0 md:block">
          <span className="flex items-center gap-2 text-ink-2">
            <kind.icon className={cn("size-[13px] shrink-0", kind.tint)} />
            <span className="truncate text-[13px] text-ink-2">{ban.reason}</span>
          </span>
          <span className="t-num mt-1 block truncate text-[10.5px] text-ink-4">
            por {ban.admin} · {ban.serverName}
          </span>
        </span>

        {/* Data absoluta embaixo da relativa: "há 2 meses" basta pra dar o
            senso de recência, mas isto é registro público — quem consulta
            precisa do dia, e a linha inteira existia sem ele. */}
        {/* Data e selo encostam à direita, coladas no chevron. Alinhadas à
            esquerda das próprias colunas sobrava um vão entre as duas, e o
            fim da linha lia como três coisas soltas em vez de um bloco. */}
        <span className="hidden justify-self-end text-right md:block">
          <span className="t-num block text-[11.5px] text-ink-3">{timeAgo(ban.createdAt)}</span>
          <span className="t-num mt-1 block text-[10px] text-ink-4">
            {formatDate(ban.createdAt)}
          </span>
        </span>

        <span className="hidden justify-self-end md:block">
          <Badge tone={state.tone} className={state.className}>
            {state.label}
          </Badge>
        </span>

        <span className="flex items-center gap-2 justify-self-end md:justify-self-center">
          <span className="md:hidden">
            <Badge tone={state.tone} className={state.className}>
              {state.label}
            </Badge>
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
              "grid gap-x-6 gap-y-3 px-3.5 pb-4 pl-[54px] sm:grid-cols-2 lg:grid-cols-4",
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
