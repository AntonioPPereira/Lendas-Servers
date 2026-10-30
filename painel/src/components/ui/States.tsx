import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Loader2, RotateCw, SearchX, WifiOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={cn("relative overflow-hidden rounded-xs bg-raised/60", className)} style={style}>
      <span
        className="absolute inset-y-0 -left-full w-1/2 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent"
        style={{ animation: "shimmer 1.6s linear infinite" }}
      />
    </div>
  );
}

export function SkeletonRows({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-px", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-8 shrink-0 rounded-sm" />
          <Skeleton className="h-3 flex-1" style={{ maxWidth: `${58 + (i % 4) * 9}%` }} />
          <Skeleton className="h-3 w-10 shrink-0" />
          <Skeleton className="hidden h-3 w-14 shrink-0 sm:block" />
        </div>
      ))}
    </div>
  );
}

/** The one loading treatment used everywhere: a scan line and a status word. */
/**
 * Espera longa que explica a si mesma.
 *
 * O esqueleto sozinho serve pra espera de meio segundo. As leituras do
 * servidor de jogo levam bem mais — cada uma abre uma conexão SFTP (~3s do
 * Brasil, mais do Render) e, se o backend estava hibernando, ainda soma
 * 15-20s pra acordar. Um esqueleto parado por 20 segundos lê como travado.
 *
 * As frases entram por TEMPO decorrido e são o que está de fato
 * acontecendo, em ordem de probabilidade: primeiro o normal, depois a
 * hibernação, depois o aviso de que já passou do esperado. Nenhuma barra de
 * progresso: não temos como saber a fração concluída, e uma barra que anda
 * sozinha seria invenção.
 */
const ETAPAS: ReadonlyArray<{ apos: number; texto: string }> = [
  { apos: 0, texto: "Lendo o arquivo do servidor de jogo…" },
  { apos: 4_000, texto: "Ainda buscando — a primeira leitura abre uma conexão nova." },
  { apos: 12_000, texto: "O servidor do painel estava dormindo e está acordando." },
  { apos: 30_000, texto: "Está demorando mais que o normal. Se não carregar, recarregue a página." },
];

export function SlowLoading({ className }: { className?: string }) {
  const [decorrido, setDecorrido] = useState(0);

  useEffect(() => {
    const inicio = Date.now();
    const id = setInterval(() => setDecorrido(Date.now() - inicio), 500);
    return () => clearInterval(id);
  }, []);

  const etapa = [...ETAPAS].reverse().find((e) => decorrido >= e.apos) ?? ETAPAS[0]!;
  /* O contador só aparece depois de um tempo: mostrar "0s" de cara faria
     uma espera curta e normal parecer um problema. */
  const segundos = Math.floor(decorrido / 1000);

  return (
    <p
      className={cn("flex items-center justify-center gap-2 px-4 py-3 text-[12.5px] text-ink-3", className)}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-3.5 shrink-0 animate-spin text-ink-4" aria-hidden="true" />
      <span>{etapa.texto}</span>
      {segundos >= 4 ? <span className="t-num text-ink-4">{segundos}s</span> : null}
    </p>
  );
}

export function LoadingState({ label = "Consultando servidor", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4 px-6 py-16", className)}>
      <div className="relative h-px w-40 overflow-hidden bg-line">
        <span
          className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-brass to-transparent"
          style={{ animation: "shimmer 1.15s linear infinite" }}
        />
      </div>
      <p className="t-eyebrow text-ink-3">{label}</p>
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  hint?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, hint, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-16 text-center", className)}>
      <span className="grid size-11 place-items-center rounded-sm border border-line-soft bg-panel-2 text-ink-4 [&_svg]:size-5">
        {icon ?? <SearchX />}
      </span>
      <div>
        <p className="t-title text-[13px] text-ink-2">{title}</p>
        {hint ? <p className="mt-1.5 max-w-[46ch] text-[12px] text-ink-4">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Não foi possível carregar",
  hint = "O serviço de estatísticas não respondeu. Tente novamente em alguns segundos.",
  onRetry,
  className,
}: {
  title?: string;
  hint?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-16 text-center", className)}>
      <span className="grid size-11 place-items-center rounded-sm border border-danger/30 bg-danger/10 text-danger [&_svg]:size-5">
        <AlertTriangle />
      </span>
      <div>
        <p className="t-title text-[13px] text-ink-2">{title}</p>
        <p className="mt-1.5 max-w-[46ch] text-[12px] text-ink-4">{hint}</p>
      </div>
      {onRetry ? (
        <Button size="sm" icon={<RotateCw />} onClick={onRetry}>
          Tentar de novo
        </Button>
      ) : null}
    </div>
  );
}

export function OfflineNotice({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 border border-warn/25 bg-warn/[0.07] px-3 py-2 text-warn",
        className,
      )}
      role="status"
    >
      <WifiOff className="size-3.5 shrink-0" />
      <p className="font-mono text-[10px] uppercase tracking-[0.14em]">
        Feed pausado — a aba está em segundo plano
      </p>
    </div>
  );
}
