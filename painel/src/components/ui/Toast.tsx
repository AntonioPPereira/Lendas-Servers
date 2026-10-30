import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { gsap, prefersReducedMotion } from "@/lib/motion";

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastApi {
  push: (toast: Omit<ToastItem, "id">) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE_STYLE: Record<ToastTone, { border: string; icon: ReactNode; accent: string }> = {
  success: { border: "border-brass/40", icon: <Check />, accent: "text-brass" },
  error: { border: "border-danger/45", icon: <TriangleAlert />, accent: "text-danger" },
  info: { border: "border-line", icon: <Info />, accent: "text-ink-2" },
};

let sequence = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (toast: Omit<ToastItem, "id">) => {
      sequence += 1;
      const id = sequence;
      setItems((current) => [...current.slice(-3), { ...toast, id }]);
      timers.current.set(id, window.setTimeout(() => dismiss(id), 3800));
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (title, description) => push({ title, description, tone: "success" }),
      error: (title, description) => push({ title, description, tone: "error" }),
    }),
    [push],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((timer) => window.clearTimeout(timer));
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document === "undefined"
        ? null
        : createPortal(
            <div
              className="pointer-events-none fixed inset-x-3 bottom-3 z-[80] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:items-end"
              role="status"
              aria-live="polite"
            >
              {items.map((item) => (
                <ToastCard key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
              ))}
            </div>,
            document.body,
          )}
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const tone = TONE_STYLE[item.tone];

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const tween = gsap.fromTo(
      el,
      { opacity: 0, y: 16, scale: 0.97 },
      { opacity: 1, y: 0, scale: 1, duration: 0.34, ease: "power3.out" },
    );
    return () => {
      tween.kill();
    };
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "pointer-events-auto flex w-full max-w-[380px] items-start gap-3 border bg-panel/95 px-3.5 py-3 backdrop-blur-md",
        "shadow-[0_20px_50px_-24px_rgba(0,0,0,1)]",
        tone.border,
      )}
    >
      <span className={cn("mt-px shrink-0 [&_svg]:size-4", tone.accent)}>{tone.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-medium text-ink">{item.title}</p>
        {item.description ? (
          <p className="t-num mt-0.5 truncate text-[11px] text-ink-3">{item.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fechar aviso"
        className="-mr-1 -mt-1 shrink-0 rounded-xs p-1 text-ink-4 transition-colors hover:text-ink"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast precisa estar dentro de ToastProvider");
  return context;
}
