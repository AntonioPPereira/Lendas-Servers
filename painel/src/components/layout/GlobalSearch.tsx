import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { CornerDownLeft, Gavel, Search, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { gsap, prefersReducedMotion } from "@/lib/motion";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { PlayerAvatar } from "@/components/player/PlayerAvatar";

interface Hit {
  id: string;
  group: string;
  title: string;
  meta: string;
  to: string;
  seed?: string;
  avatarUrl?: string;
}

/**
 * A busca consulta o BACKEND, não uma lista em memória.
 *
 * Antes ela varria `@/data/players` e `@/data/bans`, que são os mocks de
 * desenvolvimento — quem digitasse qualquer coisa recebia jogadores e
 * banimentos inventados, indistinguíveis dos reais. As duas rotas já
 * aceitam busca por texto (`?q=`), então o certo é perguntar a elas.
 *
 * Demos continuam fora: o catálogo é grande e por período, e uma busca
 * global sem esse recorte devolveria resultado enganoso.
 */
async function buscar(term: string): Promise<Hit[]> {
  const needle = term.trim();
  if (needle.length < 2) return [];

  // As duas em paralelo, e uma falha não cancela a outra: melhor devolver
  // só jogadores do que uma tela de erro no meio da digitação.
  const [jogadores, banimentos] = await Promise.all([
    api.ranking({ query: needle, page: 1, pageSize: 5 }).catch(() => null),
    api.bans({ query: needle, page: 1, pageSize: 3 }).catch(() => null),
  ]);

  const players: Hit[] = (jogadores?.items ?? []).map((p) => ({
    id: "p" + p.id,
    group: "Jogadores",
    title: p.nickname,
    // O HLstatsX não expõe SteamID no ranking (ver server/README.md), então
    // a linha auxiliar mostra posição e abates, que existem de verdade.
    meta: "#" + p.rank + " · " + p.kills + " abates",
    to: "/jogadores/" + p.id,
    seed: p.id,
    avatarUrl: p.avatarUrl,
  }));

  const bans: Hit[] = (banimentos?.items ?? []).map((b) => ({
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

  /**
   * Espera a digitação parar antes de perguntar ao servidor — sem isso cada
   * tecla viraria duas requisições (ranking + bans).
   */
  const [termoDebounced, setTermoDebounced] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => setTermoDebounced(term), 220);
    return () => window.clearTimeout(id);
  }, [term]);

  const consulta = useQuery({
    queryKey: ["busca-global", termoDebounced],
    queryFn: () => buscar(termoDebounced),
    enabled: termoDebounced.trim().length >= 2,
    staleTime: 60_000,
  });

  const hits = useMemo(() => consulta.data ?? [], [consulta.data]);

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
                      <PlayerAvatar seed={hit.seed} avatarUrl={hit.avatarUrl} size="xs" />
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
