import { useEffect, useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Crown } from "lucide-react";
import type { RankedPlayer } from "@/data/types";
import { cn } from "@/lib/cn";
import { Flip, gsap, prefersReducedMotion } from "@/lib/motion";
import { formatDecimal, formatNumber, formatPercent, formatPlaytime } from "@/lib/format";
import { PODIUM_AGENT, TEAM_CREST } from "@/lib/csAssets";
import { PlayerAvatar } from "@/components/player/PlayerAvatar";

/**
 * The ladder head. First place is the only element in the product that gets a
 * metal treatment: a lit edge and a single sheen pass on mount.
 */
export function Podium({ players, className }: { players: RankedPlayer[]; className?: string }) {
  const scope = useRef<HTMLDivElement>(null);

  /**
   * Quando o top 3 se reorganiza numa atualização de dados, os cards viajam
   * pra nova posição em vez de trocar de conteúdo parados no lugar. A
   * captura precisa acontecer ANTES do commit — no corpo do render o DOM
   * ainda é o antigo, que é exatamente a geometria que o Flip precisa. Em
   * StrictMode o segundo render cai no guard e não recaptura.
   */
  const orderKey = players.map((p) => p.id).join(",");
  const lastOrder = useRef(orderKey);
  const flipState = useRef<Flip.FlipState | null>(null);

  if (orderKey !== lastOrder.current) {
    lastOrder.current = orderKey;
    if (!prefersReducedMotion() && scope.current) {
      flipState.current = Flip.getState(scope.current.querySelectorAll("[data-podium]"));
    }
  }

  useLayoutEffect(() => {
    const state = flipState.current;
    if (!state) return;
    flipState.current = null;
    Flip.from(state, { duration: 0.6, ease: "power2.inOut", absolute: true });
  }, [orderKey]);

  // Deps vazias de propósito. `players` é um slice novo a cada render do
  // Ranking, então depender dele refazia a entrada inteira a cada refresh do
  // HLstatsX — os três cards piscavam sozinhos de tempos em tempos. Entrada é
  // evento de montagem; reordenação é assunto do Flip acima. O componente só
  // é montado pelo Ranking quando já existem 3 jogadores, então não há risco
  // de rodar cedo demais e deixar card sem animação.
  useEffect(() => {
    if (prefersReducedMotion() || players.length === 0) return;
    const ctx = gsap.context(() => {
      const timeline = gsap.timeline();
      const podiumCards = ["2", "3", "1"]
        .map((rank) => scope.current?.querySelector(`[data-rank="${rank}"]`))
        .filter((card): card is Element => card !== null);

      timeline.fromTo(
        podiumCards,
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.55, stagger: 0.08, ease: "power3.out" },
      );
      timeline.fromTo(
        "[data-crest]",
        { opacity: 0, scale: 0.72, rotate: -10 },
        { opacity: 1, scale: 1, rotate: 0, duration: 0.65, stagger: 0.08, ease: "power3.out" },
        0.12,
      );
      timeline.fromTo(
        "[data-player-avatar]",
        { opacity: 0, scale: 0.72 },
        { opacity: 1, scale: 1, duration: 0.5, stagger: 0.08, ease: "power3.out" },
        0.2,
      );
      timeline.fromTo(
        "[data-agent]",
        { opacity: 0, y: 22, scale: 0.92 },
        { opacity: 1, y: 0, scale: 1, duration: 0.65, stagger: 0.08, ease: "power3.out" },
        0.2,
      );
      timeline.fromTo(
        "[data-sheen]",
        { xPercent: -140 },
        { xPercent: 240, duration: 1.1, delay: 0.5, ease: "power2.inOut" },
      );
      timeline.to(
        "[data-champion-glow]",
        { opacity: 0.82, scale: 1.08, duration: 1.8, repeat: -1, yoyo: true, ease: "sine.inOut" },
        0.9,
      );

      gsap.to("[data-edge-scan]", {
        "--edge-angle": "360deg",
        duration: 16,
        repeat: -1,
        ease: "none",
      });
      gsap.to("[data-edge-corner]", {
        opacity: 0.72,
        scale: 1.18,
        duration: 2.4,
        repeat: -1,
        yoyo: true,
        stagger: 0.16,
        ease: "sine.inOut",
      });
      const edgeTimeline = gsap.timeline({ repeat: -1, repeatDelay: 0.25 });
      const sideSelectors = ["top", "right", "bottom", "left"] as const;
      sideSelectors.forEach((side, index) => {
        const sides = `[data-edge-side="${side}"]`;
        const axis = side === "top" || side === "bottom" ? "scaleX" : "scaleY";
        edgeTimeline.fromTo(
          sides,
          { [axis]: 0, opacity: 0 },
          { [axis]: 1, opacity: 0.82, duration: 1.15, stagger: 0.08, ease: "power2.out" },
          index * 1.18,
        );
        edgeTimeline.to(sides, { opacity: 0, duration: 0.28, ease: "power2.in" }, index * 1.18 + 0.9);
      });
      gsap.to("[data-edge-card=\"1\"] [data-edge-scan]", {
        opacity: 0.76,
        duration: 2.8,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    }, scope);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (players.length < 3) return null;

  const [first, second, third] = players;
  const order = [second!, first!, third!];

  return (
    <div
      ref={scope}
      className={cn("grid gap-3 sm:grid-cols-3 sm:items-end", className)}
    >
      {order.map((player) => {
        const champion = player.rank === 1;
        return (
          <Link
            key={player.id}
            to={"/jogadores/" + player.id}
            data-podium
            data-flip-id={player.id}
            data-rank={player.rank}
            data-edge-card={player.rank}
            className={cn(
              "panel group relative flex flex-col overflow-hidden p-4 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1",
              champion
                ? "brass-edge order-first min-h-[26rem] border-brass/25 sm:order-none sm:pt-7"
                : "min-h-[23rem]",
            )}
          >
            <span data-edge-base className="ranking-edge-base pointer-events-none absolute inset-0 z-30 rounded-md" aria-hidden="true" />
            <span data-edge-scan className="ranking-edge-scan pointer-events-none absolute inset-0 z-30 rounded-md" aria-hidden="true" />
            <span data-edge-sides className="pointer-events-none absolute inset-0 z-30" aria-hidden="true">
              <span data-edge-side="top" className="ranking-edge-side" />
              <span data-edge-side="right" className="ranking-edge-side" />
              <span data-edge-side="bottom" className="ranking-edge-side" />
              <span data-edge-side="left" className="ranking-edge-side" />
            </span>
            <span data-edge-corners className={cn("pointer-events-none absolute inset-0 z-30", champion && "ranking-edge-corners-champion")} aria-hidden="true">
              <span data-edge-corner className="ranking-edge-corner" />
              <span data-edge-corner className="ranking-edge-corner" />
              <span data-edge-corner className="ranking-edge-corner" />
              <span data-edge-corner className="ranking-edge-corner" />
            </span>

            <span
              className={cn(
                "pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_68%_42%,rgb(55_145_220_/_0.2),transparent_34%),linear-gradient(180deg,rgb(9_16_21_/_0.18),rgb(9_8_7_/_0.78))]",
                champion && "bg-[radial-gradient(circle_at_68%_38%,rgb(194_146_78_/_0.22),transparent_34%),radial-gradient(circle_at_54%_48%,rgb(55_145_220_/_0.18),transparent_38%),linear-gradient(180deg,rgb(9_16_21_/_0.1),rgb(9_8_7_/_0.82))]",
              )}
              aria-hidden="true"
            />

            <span
              data-champion-glow={champion ? true : undefined}
              className={cn(
                "pointer-events-none absolute right-[10%] top-[18%] z-[1] aspect-square w-36 rounded-full bg-[radial-gradient(circle,rgb(71_164_241_/_0.34),rgb(33_126_208_/_0.12)_46%,transparent_70%)] opacity-60 blur-[10px]",
                champion && "right-[13%] top-[15%] w-48 bg-[radial-gradient(circle,rgb(226_189_128_/_0.3),rgb(33_126_208_/_0.16)_48%,transparent_72%)]",
              )}
              aria-hidden="true"
            />

            {champion ? (
              <span
                data-sheen
                className="pointer-events-none absolute inset-y-0 -left-1/3 z-20 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-brass-hi/12 to-transparent"
                aria-hidden="true"
              />
            ) : null}

            {/* O operador desta posição do pódio — decoração de rank (o
                mesmo personagem pra quem estiver em 1º/2º/3º), sangrando
                pela base do card igual aos bustos da Partida ao vivo, nunca
                um retrato do jogador de verdade. */}
            <img
              data-agent
              src={PODIUM_AGENT[player.rank as 1 | 2 | 3]}
              alt=""
              aria-hidden="true"
              draggable={false}
              className={cn(
                "pointer-events-none absolute bottom-0 left-0 z-[3] h-[23rem] w-[96%] select-none object-contain object-bottom opacity-95 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-x-1 group-hover:scale-[1.025] [mask-image:linear-gradient(180deg,transparent,#000_18%)]",
                champion ? "h-[24rem] w-[98%]" : "h-[23rem] w-[96%]",
              )}
            />

            <div className="relative z-10 flex items-start justify-between gap-3">
              <span
                className={cn(
                  "t-display leading-none [text-shadow:0_1px_6px_rgb(0_0_0_/_0.85)]",
                  champion ? "brass-text text-[44px]" : "text-[30px] text-ink-4",
                )}
              >
                {player.rank}
              </span>
              {champion ? <Crown className="size-4 shrink-0 text-brass drop-shadow-[0_1px_4px_rgb(0_0_0_/_0.85)]" /> : null}
            </div>

            <div className="relative z-10 mt-auto -mx-4 -mb-4 bg-gradient-to-t from-panel via-panel/85 to-transparent px-4 pb-4 pt-12">
              {/* Identidade ancorando o bloco: brasão, avatar e nickname na
                  mesma linha. O emblema gerado só lê como brasão em tamanho
                  pequeno — grande demais ele vira ruído e rouba a cena do
                  operador, que é o herói da composição. */}
              <div className="flex items-center gap-2.5">
                <span
                  data-crest
                  className={cn(
                    "flex shrink-0 items-center justify-center drop-shadow-[0_0_9px_rgb(48_145_230_/_0.75)]",
                    "transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110",
                    champion ? "size-9" : "size-7",
                  )}
                >
                  <img
                    src={TEAM_CREST.CT}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    className="size-full object-contain"
                  />
                </span>

                <span data-player-avatar className="shrink-0">
                  <PlayerAvatar
                    seed={player.id}
                    nickname={player.nickname}
                    avatarUrl={player.avatarUrl}
                    size={champion ? "md" : "sm"}
                    className={champion ? "border-brass/50" : undefined}
                  />
                </span>

                <p
                  className={cn(
                    "min-w-0 truncate font-medium text-ink [text-shadow:0_1px_5px_rgb(0_0_0_/_0.95)]",
                    champion ? "text-[16px]" : "text-[14px]",
                  )}
                >
                  {player.nickname}
                </p>
              </div>

              <p className="t-num mt-1.5 text-[11px] text-ink-3">
                {formatNumber(player.skill)} pontos
              </p>

              <dl className="mt-3 grid grid-cols-3 gap-2">
                <Stat label="K/D" value={formatDecimal(player.kd ?? 0)} highlight={champion} />
                <Stat label="Precisão" value={formatPercent(player.accuracy ?? 0)} />
                <Stat label="Conexão" value={formatPlaytime(player.connectionTimeMinutes ?? 0)} />
              </dl>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <dt className="t-eyebrow text-[8.5px]">{label}</dt>
      <dd className={cn("t-num mt-1 text-[13px] tabular-nums", highlight ? "text-brass" : "text-ink-2")}>
        {value}
      </dd>
    </div>
  );
}
