import { useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { Bomb, Timer } from "lucide-react";
import type { LiveMatch as LiveMatchModel } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatClock, formatDecimal, mapLabel } from "@/lib/format";
import { useValueFlash } from "@/hooks/useCountUp";
import { useGsapScope } from "@/hooks/useGsap";
import { gsap, prefersReducedMotion } from "@/lib/motion";
import { Badge } from "@/components/ui/Badge";
import { Meter } from "@/components/ui/Meter";
import { PlayerAvatar } from "@/components/player/PlayerAvatar";
import { TeamCrest } from "./TeamCrest";
import { RoundStrip } from "./RoundStrip";
import { TEAM_AGENT, mapBackground } from "@/lib/csAssets";
import { MapIcon } from "./MapIcon";

const PHASE: Record<string, { label: string; tone: "live" | "brass" | "danger" | "neutral" }> = {
  warmup: { label: "Aquecimento", tone: "neutral" },
  freezetime: { label: "Freezetime", tone: "brass" },
  live: { label: "Rodada em andamento", tone: "live" },
  bomb: { label: "Bomba plantada", tone: "danger" },
  halftime: { label: "Intervalo", tone: "brass" },
  ended: { label: "Partida encerrada", tone: "neutral" },
};

export function LiveMatch({
  match,
  className,
}: {
  match: LiveMatchModel;
  className?: string;
}) {
  const ctRef = useValueFlash<HTMLSpanElement>(match.ctScore);
  const tRef = useValueFlash<HTMLSpanElement>(match.tScore);
  const roundRef = useValueFlash<HTMLSpanElement>(match.round, "neutral");

  const ctAlive = match.players.filter((p) => p.team === "CT" && p.alive).length;
  const tAlive = match.players.filter((p) => p.team === "T" && p.alive).length;
  const ctAliveRef = useValueFlash<HTMLSpanElement>(ctAlive);
  const tAliveRef = useValueFlash<HTMLSpanElement>(tAlive);

  const phase = PHASE[match.phase] ?? PHASE.live!;
  const urgent = match.phase === "bomb" || (match.phase === "live" && match.clock <= 20);

  const star = useMemo(
    () => [...match.players].sort((a, b) => b.score - a.score)[0] ?? null,
    [match.players],
  );
  // Deaths 0 com kills > 0 é K/D "perfeito" — dividir por zero daria
  // Infinity, então o próprio número de kills é a leitura honesta ali.
  const starKd = star ? (star.deaths === 0 ? star.kills : star.kills / star.deaths) : 0;
  const backdrop = mapBackground(match.map);

  // Entrada cinematográfica: uma vez, quando a transmissão entra no ar. Os
  // operadores avançam das bordas, a placa do placar assenta por cima.
  const stageRef = useGsapScope<HTMLElement>(({ scope }) => {
    if (prefersReducedMotion()) return;
    const ct = scope.querySelector("[data-op='ct']");
    const t = scope.querySelector("[data-op='t']");
    const hud = scope.querySelector("[data-hud]");
    const ident = scope.querySelector("[data-ident]");
    // O destaque só existe quando já há jogador em campo — ausente logo no
    // primeiro mount (partida ainda sem ninguém), não é um bug.
    const caption = scope.querySelector("[data-caption]");

    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    if (ct) tl.fromTo(ct, { opacity: 0, x: -36 }, { opacity: 1, x: 0, duration: 0.75 }, 0);
    if (t) tl.fromTo(t, { opacity: 0, x: 36 }, { opacity: 1, x: 0, duration: 0.75 }, 0);
    if (ident) tl.fromTo(ident, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.4 }, 0.1);
    if (hud) tl.fromTo(hud, { opacity: 0, y: 10, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.55 }, 0.18);
    if (caption) tl.fromTo(caption, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4 }, 0.32);
  }, []);

  // A cenografia reage a mudança real de mapa — o nome gigante ao fundo
  // troca com um fade, nunca um corte seco.
  const sceneryRef = useGsapScope<HTMLDivElement>(({ scope }) => {
    if (prefersReducedMotion()) return;
    gsap.fromTo(scope, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "power2.out" });
  }, [match.map]);

  // Evento real: bomba acaba de ser plantada. Um pulso só na transição,
  // nunca em loop — não simula tensão que os dados não confirmam.
  const prevPhase = useRef(match.phase);
  const badgeRef = useGsapScope<HTMLSpanElement>(({ scope }) => {
    if (match.phase === "bomb" && prevPhase.current !== "bomb" && !prefersReducedMotion()) {
      gsap.fromTo(
        scope,
        { scale: 1.4, opacity: 0.3 },
        { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(2.2)" },
      );
    }
    prevPhase.current = match.phase;
  }, [match.phase]);

  return (
    <section
      ref={stageRef}
      className={cn(
        "hud-frame relative isolate flex min-h-[400px] flex-col overflow-hidden rounded-md bg-abyss sm:min-h-[460px]",
        className,
      )}
    >
      {/* Camada 0 — cenografia: o nome do mapa como sinalização gigante e
          pálida ao fundo, mais um facho de luz de palco. Substitui o grid
          decorativo: aqui a textura carrega informação real (qual mapa). */}
      <div ref={sceneryRef} aria-hidden="true" className="absolute inset-0 z-0 overflow-hidden">
        {backdrop ? (
          <img
            src={backdrop}
            alt=""
            draggable={false}
            className="absolute inset-0 size-full select-none object-cover opacity-45 [filter:grayscale(0.2)_contrast(1.05)_brightness(0.6)]"
          />
        ) : (
          <span className="t-display absolute -right-2 top-1 select-none whitespace-nowrap text-[15vw] text-ink opacity-[0.04] sm:top-3 sm:text-[8vw]">
            {mapLabel(match.map)}
          </span>
        )}
        {backdrop ? (
          <div
            className="absolute inset-0"
            style={{ background: "radial-gradient(120% 90% at 50% 42%, transparent 28%, var(--color-abyss) 92%)" }}
          />
        ) : null}
        <div
          className="absolute inset-0"
          style={{
            background: "radial-gradient(56% 60% at 50% 38%, rgb(194 146 78 / 0.07), transparent 72%)",
          }}
        />
        {/* Fogo dos dois lados, atrás dos operadores: brasa azulada no CT,
            alaranjada no T. É o que dá a leitura de dois lados se
            enfrentando sem precisar de divisória no meio da cena. */}
        <span className="side-fire side-fire-ct" />
        <span className="side-fire side-fire-t" />

        {urgent ? (
          <div
            className="absolute left-1/2 top-1/2 size-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 [mask-image:radial-gradient(closest-side,#000,transparent)]"
            style={{ background: "radial-gradient(circle, var(--color-brass-ember) 0%, transparent 68%)" }}
          />
        ) : null}
      </div>

      {/* Camada 1 — os protagonistas: bustos reais do jogo, sangrando pelas
          bordas laterais e dissolvendo pra dentro da sombra, não retratos
          emoldurados. */}
      <img
        data-op="ct"
        src={TEAM_AGENT.CT}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute bottom-0 left-0 z-10 w-[clamp(190px,33vw,440px)] select-none object-contain object-bottom opacity-95 [mask-image:linear-gradient(90deg,transparent,#000_34%)]"
      />
      <img
        data-op="t"
        src={TEAM_AGENT.T}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute bottom-0 right-0 z-10 w-[clamp(190px,33vw,440px)] select-none object-contain object-bottom opacity-95 [mask-image:linear-gradient(270deg,transparent,#000_34%)]"
      />

      {/* Camada 2 — a transmissão em si: identificação, placar, destaque.
          Tudo em fluxo real (não posicionado sobre a cena às cegas), então
          o placar fica no meio do espaço que sobra — parte da composição,
          não um bloco flutuando sozinho. */}
      <div data-ident className="relative z-20 flex min-h-0 items-center gap-3 px-4 py-3 sm:px-6">
        <span className="h-3 w-[2px] shrink-0 bg-brass" aria-hidden="true" />
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="t-eyebrow whitespace-nowrap text-ink-2">Partida ao vivo</h2>
          {/* Nome real do servidor — sem isso o módulo não deixa claro qual
              dos servidores é essa partida. */}
          {match.hostname ? (
            <span className="t-num hidden truncate text-[10.5px] text-ink-4 sm:inline">
              {match.hostname}
            </span>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 text-ink-3 sm:flex">
            <MapIcon map={match.map} decorative className="size-4" />
            <span className="t-num text-[10.5px]">
              {mapLabel(match.map)} · {match.players.length} em jogo
            </span>
          </span>
          <span ref={badgeRef} className="inline-flex">
            <Badge tone={phase.tone === "neutral" ? "neutral" : phase.tone}>
              {match.phase === "bomb" ? <Bomb className="size-3" /> : null}
              {phase.label}
            </Badge>
          </span>
        </div>
      </div>

      <div data-hud className="relative z-20 flex flex-1 flex-col items-center justify-center gap-3 px-4 py-3">
        {/* Cabeçalho dos dois lados, encostado nas bordas por cima dos
            operadores: nome do time e quantos ainda estão vivos agora. */}
        <div className="flex w-full items-start justify-between gap-3">
          <TeamHeading team="CT" alive={ctAlive} aliveRef={ctAliveRef} />

          {/* Ícone e nome na mesma linha: empilhados, a placa de fallback
              ("DE", pra mapa sem ícone oficial) ficava pendurada torta em
              cima do nome. */}
          <span className="flex shrink-0 items-center gap-2 pt-1">
            <MapIcon map={match.map} decorative className="size-5 opacity-75" />
            <span className="t-eyebrow whitespace-nowrap text-[10px] text-ink-2">
              {mapLabel(match.map)}
            </span>
          </span>

          <TeamHeading team="T" alive={tAlive} aliveRef={tAliveRef} align="right" />
        </div>

        <div className="flex items-center gap-4 rounded-xs bg-abyss/55 px-5 py-2 backdrop-blur-[2px] sm:gap-7 sm:px-8">
          <span ref={ctRef} className="t-score text-ct">
            {match.ctScore}
          </span>
          <span className="t-score text-ink-4" style={{ fontSize: "clamp(1.25rem, 3vw, 2.5rem)" }}>
            :
          </span>
          <span ref={tRef} className="t-score text-t">
            {match.tScore}
          </span>
        </div>

        {/* Rodada com barra de avanço da partida — o mesmo número que já
            existia, agora com a leitura de "quanto falta" junto. */}
        <div className="w-full max-w-[230px]">
          <span ref={roundRef} className="t-eyebrow block text-center text-[9px]">
            Rodada {match.round}/{match.maxRounds}
          </span>
          <Meter
            value={match.round}
            max={Math.max(match.maxRounds, 1)}
            height={2}
            tone="brass"
            className="mt-1.5"
          />
        </div>

        <div className="flex flex-col items-center">
          <span
            className={cn(
              "t-num flex items-center gap-1.5 text-[17px] tabular-nums transition-colors",
              urgent ? "text-brass-ember" : "text-ink",
            )}
          >
            <Timer className="size-4" />
            {formatClock(match.clock)}
          </span>
          <span className="t-eyebrow mt-0.5 text-[8px] text-ink-4">Tempo restante</span>
        </div>

        {/* Régua de rodadas ladeada pelos brasões: de que lado cada rodada
            caiu, e como. Só aparece com rodada jogada — régua vazia não
            informa nada e ainda ocupa a cena. */}
        {match.rounds.length > 0 ? (
          <div className="flex w-full max-w-[660px] items-center gap-3">
            <TeamCrest team="CT" className="size-7 shrink-0 opacity-85" />
            <RoundStrip
              rounds={match.rounds}
              maxRounds={match.maxRounds}
              currentRound={match.round}
              size="sm"
              className="flex-1 justify-center"
            />
            <TeamCrest team="T" className="size-7 shrink-0 opacity-85" />
          </div>
        ) : null}
      </div>

      {star ? (
        <Link
          data-caption
          to={"/jogadores/" + star.steamId64}
          className="group relative z-20 flex items-center gap-3 border-t border-line-soft/60 bg-gradient-to-t from-abyss via-abyss/90 to-abyss/40 px-4 py-2.5 transition-colors hover:from-panel-2/70 sm:px-6"
        >
          {/* nickname é obrigatório aqui: sem ele o texto acessível do
              avatar cai pro seed, e o leitor de tela anuncia um SteamID de
              17 dígitos no lugar do nome do jogador. */}
          <PlayerAvatar
            seed={star.avatarSeed}
            nickname={star.nickname}
            avatarUrl={star.avatarUrl}
            size="sm"
            team={star.team}
          />
          <span className="min-w-0 flex-1">
            <span className="t-eyebrow block text-[8px] text-brass">Destaque da partida</span>
            <span className="mt-0.5 block truncate text-[12.5px] text-ink">
              <span className="font-medium">{star.nickname}</span>{" "}
              {/* Sem assistências e sem MVP: os dois nativos do cstrike que
                  os alimentam não existem nesta instalação de CS:S, então
                  seriam um zero eterno se passando por estatística. */}
              <span className="t-num text-ink-4">
                — {star.kills} K · {star.deaths} D
              </span>
            </span>
          </span>

          <span className="shrink-0 text-right">
            <span className="t-eyebrow block text-[8px]">K/D</span>
            <span
              className={cn(
                "t-num mt-0.5 block text-[14px] tabular-nums",
                starKd >= 1.2 ? "text-brass" : starKd >= 1 ? "text-ink" : "text-ink-3",
              )}
            >
              {formatDecimal(starKd)}
            </span>
          </span>
        </Link>
      ) : null}
    </section>
  );
}

/**
 * Identificação de um lado no alto da cena: brasão, nome do time e quantos
 * seguem vivos na rodada. O nome some no mobile — ali a coluna é estreita
 * demais e o brasão já diz de quem se trata.
 */
function TeamHeading({
  team,
  alive,
  aliveRef,
  align = "left",
}: {
  team: "CT" | "T";
  alive: number;
  aliveRef: React.RefObject<HTMLSpanElement | null>;
  align?: "left" | "right";
}) {
  const right = align === "right";
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-2.5",
        right && "flex-row-reverse text-right",
      )}
    >
      <TeamCrest team={team} className="size-12 shrink-0 sm:size-16" />
      <span className="min-w-0">
        <span
          className={cn(
            "t-eyebrow hidden truncate text-[11px] sm:block",
            team === "CT" ? "text-ct-hi" : "text-t-hi",
          )}
        >
          {team === "CT" ? "Counter-Terrorists" : "Terrorists"}
        </span>
        <span ref={aliveRef} className="t-num mt-1 block text-[12px] text-ink-3">
          {alive} {alive === 1 ? "vivo" : "vivos"}
        </span>
      </span>
    </span>
  );
}
