import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(Flip, ScrollTrigger);

gsap.defaults({ ease: "power3.out", duration: 0.5 });

const reduceQuery =
  typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

let reduced = reduceQuery?.matches ?? false;
reduceQuery?.addEventListener("change", (event) => {
  reduced = event.matches;
});

/** Single source of truth for "should this animate at all". */
export const prefersReducedMotion = () => reduced;

/**
 * Shared timing. Anything user-facing sits between 120ms and 620ms:
 * fast enough to feel like a readout, slow enough to be readable.
 */
export const duration = {
  flash: 0.14,
  fast: 0.22,
  base: 0.42,
  slow: 0.62,
} as const;

export const ease = {
  out: "power3.out",
  inOut: "power2.inOut",
  hud: "expo.out",
  snap: "back.out(1.6)",
} as const;

export { gsap, Flip, ScrollTrigger };
