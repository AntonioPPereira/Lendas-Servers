import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  className?: string;
}

export function Pagination({ page, pageSize, total, onChange, className }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const window: number[] = [];
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  for (let i = start; i < start + Math.min(5, pages); i += 1) window.push(i);

  return (
    <nav
      className={cn("flex flex-wrap items-center justify-between gap-3 px-4 py-3", className)}
      aria-label="Paginação"
    >
      <p className="t-num text-[11px] text-ink-4">
        {from}–{to} de {total}
      </p>
      <div className="flex items-center gap-1">
        <PageButton disabled={page === 1} onClick={() => onChange(page - 1)} label="Página anterior">
          <ChevronLeft className="size-3.5" />
        </PageButton>
        {window.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-current={n === page ? "page" : undefined}
            className={cn(
              "t-num h-7 min-w-7 rounded-xs border px-2 text-[11px] transition-colors",
              n === page
                ? "border-brass/50 bg-brass/12 text-brass"
                : "border-transparent text-ink-3 hover:border-line hover:text-ink",
            )}
          >
            {n}
          </button>
        ))}
        <PageButton
          disabled={page === pages}
          onClick={() => onChange(page + 1)}
          label="Próxima página"
        >
          <ChevronRight className="size-3.5" />
        </PageButton>
      </div>
    </nav>
  );
}

function PageButton({
  children,
  disabled,
  onClick,
  label,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-xs border border-line-soft text-ink-3 transition-colors hover:border-line hover:text-ink disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}
