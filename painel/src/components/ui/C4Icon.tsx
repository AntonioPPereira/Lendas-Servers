import { cn } from "@/lib/cn";

/**
 * C4 armada, com o LED piscando.
 *
 * Desenhada pra ler a 20px, que é o tamanho real no cartão — e passou por
 * duas correções depois de olhar ampliada:
 *
 * 1. Detalhes finos (visor, fita, antena fina) viravam borrão nesse tamanho
 *    e o ícone parecia um retângulo qualquer.
 * 2. O LED vermelho sobre o bloco claro sumia. Agora ele fica sobre um
 *    painel escuro embutido, que dá o contraste — é assim que se lê "bomba"
 *    de relance, e não "cartão".
 *
 * O pulso é seco, com espera longa, como a C4 no jogo; um fade suave leria
 * como notificação de app. E o LED nunca apaga de todo (fica em 40%): pego
 * no vale, um LED preto pareceria quebrado, não armado.
 */
export function C4Icon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={cn("c4", className)}>
      {/* Antena curta com ponta — sai de trás do bloco. */}
      <path d="M18.2 7.6V4.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="18.2" cy="3.4" r="1.5" fill="currentColor" />

      {/* Tabletes de explosivo. */}
      <rect x="2.6" y="7.4" width="18.8" height="12.4" rx="2.1" fill="currentColor" />

      {/* Amarração: duas fitas escuras cruzando o bloco. */}
      <rect x="2.6" y="11.1" width="18.8" height="1.5" fill="#241f1a" fillOpacity="0.5" />
      <rect x="2.6" y="15.4" width="18.8" height="1.5" fill="#241f1a" fillOpacity="0.5" />

      {/* Painel escuro: é ele que faz o LED existir visualmente. */}
      <rect x="12.4" y="8.9" width="7.6" height="5.4" rx="1.1" fill="#231d19" />

      {/* Brilho do LED, fora de compasso com o próprio LED. */}
      <circle className="c4-glow" cx="16.2" cy="11.6" r="3.6" fill="#FF6E5E" />
      {/* LED. */}
      <circle className="c4-led" cx="16.2" cy="11.6" r="1.7" fill="#FF6E5E" />
    </svg>
  );
}
