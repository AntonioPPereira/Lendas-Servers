import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { gsap, prefersReducedMotion } from "@/lib/motion";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, eyebrow, children, footer, className }: ModalProps) {
  const backdrop = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    if (prefersReducedMotion()) {
      onClose();
      return;
    }
    const tl = gsap.timeline({ onComplete: onClose });
    tl.to(panel.current, { opacity: 0, y: 10, scale: 0.985, duration: 0.16, ease: "power2.in" });
    tl.to(backdrop.current, { opacity: 0, duration: 0.16 }, "<");
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);

    const ctx = gsap.context(() => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(backdrop.current, { opacity: 0 }, { opacity: 1, duration: 0.2 });
      gsap.fromTo(
        panel.current,
        { opacity: 0, y: 18, scale: 0.982 },
        { opacity: 1, y: 0, scale: 1, duration: 0.36, ease: "power3.out" },
      );
      const items = panel.current ? panel.current.querySelectorAll("[data-modal-item]") : [];
      gsap.fromTo(
        items,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.3, stagger: 0.04, delay: 0.08 },
      );
    });

    const first = panel.current ? panel.current.querySelector<HTMLElement>("[data-autofocus]") : null;
    first?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      ctx.revert();
      restoreTo.current?.focus();
    };
  }, [open, close]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div
        ref={backdrop}
        className="absolute inset-0 bg-void/78 backdrop-blur-[3px]"
        onClick={close}
        aria-hidden="true"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "panel relative flex max-h-[88vh] w-full flex-col sm:max-w-[720px]",
          "rounded-b-none sm:rounded-md",
          className,
        )}
      >
        <header className="flex items-start gap-4 border-b border-line-soft px-5 py-4">
          <div className="min-w-0">
            {eyebrow ? <p className="t-eyebrow mb-1.5 text-brass">{eyebrow}</p> : null}
            <h2 className="t-title truncate text-[15px] text-ink">{title}</h2>
          </div>
          <button
            type="button"
            data-autofocus
            onClick={close}
            aria-label="Fechar"
            className="ml-auto shrink-0 rounded-xs border border-line-soft p-1.5 text-ink-3 transition-colors hover:border-line hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft px-5 py-3.5">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
