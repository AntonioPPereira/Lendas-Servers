import { useEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "@/lib/motion";
import { formatNumber } from "@/lib/format";

interface CountUpOptions {
  duration?: number;
  format?: (value: number) => string;
  /** Skip the first animation and render the value immediately. */
  immediate?: boolean;
}

/**
 * Counts a number up on mount and tweens between values afterwards.
 * Writes straight to textContent — no re-render per frame.
 */
export function useCountUp<T extends HTMLElement>(value: number, options: CountUpOptions = {}) {
  const { duration = 1.1, format = formatNumber, immediate = false } = options;
  const ref = useRef<T>(null);
  const previous = useRef<number | null>(null);
  const formatRef = useRef(format);
  formatRef.current = format;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const from = previous.current ?? 0;
    previous.current = value;

    if (prefersReducedMotion() || immediate || from === value) {
      el.textContent = formatRef.current(value);
      return;
    }

    const proxy = { v: from };
    const tween = gsap.to(proxy, {
      v: value,
      duration: previous.current === null ? duration : Math.min(duration, 0.45),
      ease: "power2.out",
      onUpdate: () => {
        el.textContent = formatRef.current(proxy.v);
      },
      onComplete: () => {
        el.textContent = formatRef.current(value);
      },
    });

    return () => {
      tween.kill();
    };
  }, [value, duration, immediate]);

  return ref;
}

type FlashTone = "up" | "down" | "neutral";

/**
 * Marks a value that just changed. 140ms, one property, no layout shift —
 * this fires dozens of times a minute on the live scoreboard.
 */
export function useValueFlash<T extends HTMLElement>(value: number, tone: FlashTone = "up") {
  const ref = useRef<T>(null);
  const previous = useRef(value);

  useEffect(() => {
    const el = ref.current;
    if (!el || previous.current === value) return;
    const rising = value > previous.current;
    previous.current = value;

    if (prefersReducedMotion()) return;

    const color =
      tone === "neutral"
        ? "var(--color-brass-hi)"
        : rising === (tone === "up")
          ? "var(--color-brass-hi)"
          : "var(--color-danger)";

    const tween = gsap.fromTo(
      el,
      { color, scale: 1.18 },
      { color: "", scale: 1, duration: 0.5, ease: "power2.out", clearProps: "color,scale" },
    );

    return () => {
      tween.kill();
    };
  }, [value, tone]);

  return ref;
}
