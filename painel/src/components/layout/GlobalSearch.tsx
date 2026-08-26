import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { CornerDownLeft, Gavel, Search, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { gsap, prefersReducedMotion } from "@/lib/motion";
import { PLAYERS } from "@/data/players";
import { BANS } from "@/data/bans";
import { PlayerAvatar } from "@/components/player/PlayerAvatar";

interface Hit {
  id: string;
  group: string;
  title: string;
  meta: string;
  to: string;
  seed?: string;
}

function search(term: string): Hit[] {
  const needle = term.trim().toLowerCase();
  if (needle.length < 2) return [];

  const players: Hit[] = PLAYERS.filter(
    (p) =>
      p.nickname.toLowerCase().includes(needle) ||
      p.steamId.toLowerCase().includes(needle) ||
      p.steamId64.includes(needle),
  )
    .slice(0, 5)
    .map((p) => ({
      id: "p" + p.steamId64,
      group: "Jogadores",
      title: p.nickname,
      meta: "#" + p.rank + " · " + p.steamId,
      to: "/jogadores/" + p.steamId64,
      seed: p.avatarSeed,
    }));

  // Demos saiu da busca global: o catálogo agora vem de um backend real via
  // rede (SFTP), não de um array estático em memória — buscar aqui exigiria
  // uma chamada assíncrona por tecla, fora do escopo desta integração.
  const bans: Hit[] = BANS.filter(
    (b) =>
      b.target.nickname.toLowerCase().includes(needle) ||
      b.target.steamId.toLowerCase().includes(needle),
  )
    .slice(0, 3)
    .map((b) => ({
      id: "b" + b.id,
      group: "Banimentos",
      title: b.target.nickname,
      meta: b.reason,
      to: "/banimentos?q=" + encodeURIComponent(b.target.nickname),
    }));

  return [...players, ...bans];
}

const GROUP_ICON: Record<string, typeof Users> = {
  Jogadores: Users,
  Banimentos: Gavel,
};

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [term, setTerm] = useState("");
  const [cursor, setCursor] = useState(0);
  const navigate = useNavigate();
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const hits = useMemo(() => search(term), [term]);

  useEffect(() => {
    if (!open) return;
    setTerm("");
    setCursor(0);
    document.body.style.overflow = "hidden";
    input.current?.focus();

    const ctx = gsap.context(() => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        panel.current,
        { opacity: 0, y: -12, scale: 0.99 },
        { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: "power3.out" },
      );
    });

    return () => {
      document.body.style.overflow = "";
      ctx.revert();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setCursor((c) => Math.min(hits.length - 1, c + 1));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
      }
      if (event.key === "Enter" && hits[cursor]) {
        event.preventDefault();
        navigate(hits[cursor]!.to);
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, hits, cursor, navigate, onClose]);

  if (!open || typeof document === "undefined") return null;

  let lastGroup = "";

  return createPortal(
    <div className="fixed inset-0 z-[75] flex items-start justify-center px-3 pt-[12vh]">
      <div className="absolute inset-0 bg-void/78 backdrop-blur-[3px]" onClick={onClose} aria-hidden="true" />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Busca global"
        className="panel relative flex w-full max-w-[620px] flex-col overflow-hidden"
      >
        <div className="flex h-12 items-center gap-3 border-b border-line-soft px-4">
          <Search className="size-4 shrink-0 text-ink-4" />
          <input
            ref={input}
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              setCursor(0);
            }}
            placeholder="Nickname, Steam ID ou motivo de banimento"
            className="h-full flex-1 bg-transparent text-[13.5px] text-ink placeholder:text-ink-4 focus:outline-none"
          />
          <kbd className="hidden rounded-xs border border-line-soft px-1.5 font-mono text-[10px] text-ink-4 sm:block">
            Esc
          </kbd>
        </div>

        <div className="max-h-[52vh] min-h-[120px] overflow-y-auto py-1.5">
          {term.trim().length < 2 ? (
            <p className="px-4 py-8 text-center text-[12px] text-ink-4">
              Digite ao menos 2 caracteres para buscar na comunidade.
            </p>
          ) : hits.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12px] text-ink-4">
              Nada encontrado para <span className="text-ink-2">{term}</span>.
            </p>
          ) : (
            hits.map((hit, index) => {
              const showGroup = hit.group !== lastGroup;
              lastGroup = hit.group;
              const Icon = GROUP_ICON[hit.group] ?? Users;

              return (
                <div key={hit.id}>
                  {showGroup ? (
                    <p className="t-eyebrow px-4 pb-1.5 pt-3 text-[9px]">{hit.group}</p>
                  ) : null}
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => {
                      navigate(hit.to);
                      onClose();
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2 text-left transition-colors",
                      index === cursor ? "bg-raised/70" : "hover:bg-raised/40",
                    )}
                  >
                    {hit.seed ? (
                      <PlayerAvatar seed={hit.seed} size="xs" />
                    ) : (
                      <span className="grid size-6 shrink-0 place-items-center rounded-xs border border-line-soft text-ink-4">
                        <Icon className="size-3" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] text-ink">{hit.title}</span>
                      <span className="t-num block truncate text-[10.5px] text-ink-4">{hit.meta}</span>
                    </span>
                    {index === cursor ? (
                      <CornerDownLeft className="size-3.5 shrink-0 text-brass" />
                    ) : null}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
