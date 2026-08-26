import { useEffect, useRef, type InputHTMLAttributes, type ReactNode } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

interface SearchBarProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string;
  onValueChange: (value: string) => void;
  /** Registers the slash shortcut for this field. */
  shortcut?: boolean;
}

export function SearchBar({
  value,
  onValueChange,
  placeholder = "Buscar nickname ou Steam ID",
  shortcut = false,
  className,
  ...rest
}: SearchBarProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!shortcut) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if (event.key === "/" && !typing) {
        event.preventDefault();
        ref.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shortcut]);

  return (
    <div className={cn("group relative flex h-9 items-center", className)}>
      <Search className="pointer-events-none absolute left-3 size-3.5 text-ink-4 transition-colors group-focus-within:text-brass" />
      <input
        ref={ref}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onValueChange(event.target.value)}
        className={cn(
          "h-full w-full rounded-xs border border-line-soft bg-panel-2/70 pl-9 pr-8",
          "text-[12.5px] text-ink placeholder:text-ink-4",
          "transition-colors focus:border-brass/45 focus:bg-panel-2 focus:outline-none",
          "[&::-webkit-search-cancel-button]:hidden",
        )}
        {...rest}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onValueChange("")}
          aria-label="Limpar busca"
          className="absolute right-2 rounded-xs p-1 text-ink-4 transition-colors hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      ) : shortcut ? (
        <kbd className="pointer-events-none absolute right-2.5 hidden rounded-xs border border-line-soft px-1.5 font-mono text-[10px] text-ink-4 sm:block">
          /
        </kbd>
      ) : null}
    </div>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = "md",
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-px rounded-xs border border-line-soft bg-panel-2/60 p-px",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative rounded-xs font-mono uppercase tracking-[0.14em] transition-colors",
              size === "sm" ? "h-6 px-2 text-[10px]" : "h-7 px-3 text-[10.5px]",
              active
                ? "bg-raised text-brass shadow-[inset_0_1px_0_rgba(255,210,119,0.16)]"
                : "text-ink-4 hover:text-ink-2",
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className={cn("ml-1.5 tabular-nums", active ? "text-brass/70" : "text-ink-4")}>
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function Select({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("relative h-9", className)}>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-full w-full appearance-none rounded-xs border border-line-soft bg-panel-2/70 pl-3 pr-8",
          "font-mono text-[11px] uppercase tracking-[0.1em] text-ink-2",
          "transition-colors focus:border-brass/45 focus:outline-none",
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-panel text-ink">
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" />
    </div>
  );
}

export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2.5",
        className,
      )}
    >
      {children}
    </div>
  );
}
