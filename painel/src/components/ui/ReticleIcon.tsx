import { cn } from "@/lib/cn";

/**
 * Mira que procura, trava e volta a procurar.
 *
 * A ideia não é "girar pra parecer animado": é encenar o gesto de mirar. O
 * anel externo gira devagar e sem parar (varredura), enquanto os quatro
 * traços fecham pra dentro, seguram um instante e reabrem — o momento em
 * que fecham é quando o ponto central acende.
 *
 * Por isso os traços e o ponto compartilham o MESMO período (2,4s): aqui a
 * sincronia é intencional, ao contrário do fogo. O que não pode sincronizar
 * é o anel (5,5s), senão a varredura viraria parte do mesmo gesto.
 */
export function ReticleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={cn("reticle", className)}>
      {/* Anel de varredura: gira sempre, independente do resto. */}
      <circle
        className="reticle-ring"
        cx="12"
        cy="12"
        r="8.4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeOpacity="0.55"
        strokeDasharray="7 5"
      />

      {/* Traços que fecham na trava. */}
      <g className="reticle-ticks" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <line x1="12" y1="1.4" x2="12" y2="5.2" />
        <line x1="12" y1="18.8" x2="12" y2="22.6" />
        <line x1="1.4" y1="12" x2="5.2" y2="12" />
        <line x1="18.8" y1="12" x2="22.6" y2="12" />
      </g>

      {/* Halo que acende junto com a trava. */}
      <circle className="reticle-lock" cx="12" cy="12" r="3.4" fill="currentColor" fillOpacity="0.18" />
      {/* Ponto central. */}
      <circle className="reticle-dot" cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}
