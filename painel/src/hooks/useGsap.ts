import { useLayoutEffect, useRef, type DependencyList, type RefObject } from "react";
import { ScrollTrigger, gsap, prefersReducedMotion } from "@/lib/motion";

/**
 * gsap.context scoped to a ref, reverted on unmount. Every animation in the
 * app goes through here so nothing leaks a live tween.
 */
export function useGsapScope<T extends HTMLElement>(
  setup: (ctx: { scope: T; self: gsap.Context }) => void,
  deps: DependencyList = [],
): RefObject<T | null> {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const scope = ref.current;
    if (!scope) return;
    const ctx = gsap.context((self) => setup({ scope, self }), scope);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}

interface EnterOptions {
  selector?: string;
  y?: number;
  stagger?: number;
  delay?: number;
  duration?: number;
}

/**
 * The page-entrance signature: blocks resolve top-to-bottom in a single
 * short cascade, so the eye is led through the hierarchy once.
 */
export function usePageEnter<T extends HTMLElement>(options: EnterOptions = {}) {
  const {
    selector = "[data-enter]",
    y = 14,
    stagger = 0.055,
    delay = 0.02,
    duration = 0.52,
  } = options;

  return useGsapScope<T>(({ scope }) => {
    const items = scope.querySelectorAll(selector);
    if (!items.length) return;

    if (prefersReducedMotion()) {
      gsap.set(items, { opacity: 1, y: 0, clearProps: "transform" });
      return;
    }

    gsap.fromTo(
      items,
      { opacity: 0, y, filter: "blur(3px)" },
      {
        opacity: 1,
        y: 0,
        filter: "blur(0px)",
        duration,
        delay,
        stagger,
        ease: "power3.out",
        clearProps: "filter",
      },
    );
  }, []);
}

/**
 * Reveals blocks as they scroll in. Elements start visible in CSS and are only
 * hidden once GSAP takes over, so a failed trigger can never blank the page.
 */
export function useScrollReveal<T extends HTMLElement>(selector = "[data-reveal]") {
  return useGsapScope<T>(({ scope }) => {
    const items = scope.querySelectorAll(selector);
    if (!items.length || prefersReducedMotion()) return;

    // The app scrolls inside <main>, not the window, so the trigger must be
    // told which element actually moves.
    const scroller = scope.closest("#app-scroller") as HTMLElement | null;

    ScrollTrigger.batch(items, {
      scroller: scroller ?? undefined,
      start: "top 92%",
      once: true,
      onEnter: (batch) => {
        gsap.fromTo(
          batch,
          { opacity: 0, y: 18 },
          { opacity: 1, y: 0, duration: 0.55, stagger: 0.08, ease: "power3.out", overwrite: true },
        );
      },
    });

    gsap.set(items, { opacity: 0, y: 18 });
    ScrollTrigger.refresh();
  }, []);
}
