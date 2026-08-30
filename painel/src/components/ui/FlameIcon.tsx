import { cn } from "@/lib/cn";

/**
 * Chama animada de verdade — não um ícone estático com `scale` pulsando.
 *
 * O que faz parecer fogo, e não um logo piscando:
 *
 * 1. **Camadas independentes.** Língua externa, miolo e núcleo são três
 *    caminhos separados, cada um com sua própria animação. Fogo real não se
 *    move em bloco.
 * 2. **Períodos que não fecham entre si** (2,3s / 1,7s / 1,1s / 2,9s / 3,7s).
 *    Se fossem múltiplos, o conjunto repetiria visivelmente a cada ciclo e o
 *    olho pegaria o padrão na hora. Assim a combinação demora muito pra se
 *    repetir e lê como aleatório.
 * 3. **Origem na base.** `transform-origin` embaixo faz a chama crescer pra
 *    cima, presa no pé, como fogo — e não inflar a partir do centro.
 * 4. **Brasas subindo.** Duas partículas que sobem, encolhem e somem: é o
 *    detalhe que mais vende o movimento como fogo.
 *
 * Tudo é transform/opacity, que a GPU compõe sem recalcular layout, então
 * roda liso mesmo com vários na tela. Quem pede menos movimento vê a chama
 * parada, sem perder o ícone.
 */
export function FlameIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("flame", className)}
    >
      {/* Halo: o calor que escapa da chama, não a chama em si. */}
      <ellipse className="flame-halo" cx="12" cy="15" rx="7" ry="9" fill="url(#flameHalo)" />

      {/* Língua externa — a mais lenta e a mais larga. */}
      <path
        className="flame-outer"
        d="M12 23c-4.3 0-7.7-3.2-7.7-7.3 0-2.5 1.1-4.2 2.5-6C8.1 7.6 9.6 5.6 9.3 1.6c2.5 1.5 4.4 3.8 5.1 6.3.8-.9 1.3-2.1 1.3-3.5 2.4 2.3 3.9 5.4 3.9 8.7 0 4.1-3.4 7.3-7.6 7.3z"
        fill="url(#flameOuter)"
      />

      {/* Miolo — mais rápido, e desencontrado da língua externa. */}
      <path
        className="flame-inner"
        d="M12 23c-2.2 0-4-1.7-4-3.8 0-1.3.6-2.2 1.3-3.1.8-1 1.5-2 1.4-3.8 1.3.8 2.3 2 2.7 3.3.4-.5.6-1.1.6-1.8 1.2 1.2 1.9 2.8 1.9 4.5 0 2.1-1.8 3.8-4 3.8z"
        fill="url(#flameInner)"
      />

      {/* Núcleo branco-quente: o ponto mais brilhante, quase sempre visível. */}
      <ellipse className="flame-core" cx="12" cy="20" rx="1.6" ry="2.2" fill="url(#flameCore)" />

      {/* Brasas: sobem, encolhem e apagam. */}
      <circle className="flame-ember flame-ember-a" cx="9.5" cy="9" r="0.7" fill="currentColor" />
      <circle className="flame-ember flame-ember-b" cx="14.5" cy="11" r="0.55" fill="currentColor" />

      <defs>
        <linearGradient id="flameOuter" x1="12" y1="1.6" x2="12" y2="23" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F2A63B" />
          <stop offset="0.55" stopColor="#D97A24" />
          <stop offset="1" stopColor="#A6431A" />
        </linearGradient>
        <linearGradient id="flameInner" x1="12" y1="12.3" x2="12" y2="23" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFD98A" />
          <stop offset="1" stopColor="#F4A93F" />
        </linearGradient>
        <radialGradient id="flameCore">
          <stop stopColor="#FFF6E0" />
          <stop offset="1" stopColor="#FFD27A" stopOpacity="0.35" />
        </radialGradient>
        <radialGradient id="flameHalo">
          <stop stopColor="#E8933A" stopOpacity="0.42" />
          <stop offset="1" stopColor="#E8933A" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}
