import { cn } from "@/lib/cn";

/**
 * Caveira com brasa nas órbitas.
 *
 * O crânio em si quase não se mexe — só um balanço muito lento. Quem dá
 * vida são as duas brasas dentro das órbitas, que pulsam em períodos
 * diferentes (2,1s e 2,7s): se piscassem juntas viraria um par de olhos de
 * desenho animado; desencontradas, lê como brasa mesmo.
 *
 * A mandíbula tem um movimento mínimo, quase imperceptível — é o que
 * impede o ícone de parecer congelado quando as brasas estão no vale.
 */
export function SkullIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={cn("skull", className)}>
      <g className="skull-sway">
        {/* Crânio */}
        <path
          className="skull-bone"
          d="M12 2.2c-4.5 0-8.1 3.4-8.1 7.7 0 2.5 1.2 4.3 2.7 5.6.4.4.7.9.7 1.4v1c0 .9.7 1.6 1.6 1.6h.4v1.3c0 .6.5 1.1 1.1 1.1s1.1-.5 1.1-1.1v-1.3h1v1.3c0 .6.5 1.1 1.1 1.1s1.1-.5 1.1-1.1v-1.3h.4c.9 0 1.6-.7 1.6-1.6v-1c0-.5.3-1 .7-1.4 1.5-1.3 2.7-3.1 2.7-5.6 0-4.3-3.6-7.7-8.1-7.7z"
          fill="currentColor"
        />

        {/* Órbitas: o vazio escuro que dá contraste pra brasa. */}
        <ellipse cx="8.6" cy="10" rx="2.3" ry="2.6" fill="#1b1714" />
        <ellipse cx="15.4" cy="10" rx="2.3" ry="2.6" fill="#1b1714" />

        {/* Brasas — o que realmente se move. */}
        <ellipse className="skull-ember skull-ember-l" cx="8.6" cy="10.2" rx="1.2" ry="1.4" fill="url(#skullEmber)" />
        <ellipse className="skull-ember skull-ember-r" cx="15.4" cy="10.2" rx="1.2" ry="1.4" fill="url(#skullEmber)" />

        {/* Cavidade nasal */}
        <path d="M12 13.1l1.1 2.1h-2.2z" fill="#1b1714" />
      </g>

      <defs>
        <radialGradient id="skullEmber">
          <stop stopColor="#FFD9A0" />
          <stop offset="0.5" stopColor="#E8853A" />
          <stop offset="1" stopColor="#B4451C" stopOpacity="0.5" />
        </radialGradient>
      </defs>
    </svg>
  );
}
