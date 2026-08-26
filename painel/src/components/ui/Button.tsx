import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";

type Variant = "primary" | "outline" | "ghost" | "danger" | "quiet";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "brass-edge bg-gradient-to-b from-brass-hi to-brass text-void hover:from-white hover:to-brass-hi active:from-brass active:to-brass-lo",
  outline:
    "border border-line bg-panel-2/60 text-ink-2 hover:border-brass/50 hover:bg-raised hover:text-ink",
  ghost: "text-ink-3 hover:bg-raised hover:text-ink",
  danger: "border border-danger/40 bg-danger/12 text-danger hover:bg-danger/20 hover:text-white",
  quiet: "border border-line-soft bg-transparent text-ink-3 hover:border-line hover:text-ink-2",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 gap-1.5 px-2.5 text-[10px] tracking-[0.14em]",
  md: "h-9 gap-2 px-3.5 text-[11px] tracking-[0.14em]",
  lg: "h-11 gap-2.5 px-5 text-[12px] tracking-[0.16em]",
};

const BASE = [
  "inline-flex select-none items-center justify-center rounded-xs font-mono font-medium uppercase",
  "transition-[background,border-color,color,transform,box-shadow] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
  "active:translate-y-px disabled:pointer-events-none disabled:opacity-40",
].join(" ");

export function buttonStyles({
  variant = "outline",
  size = "md",
  block = false,
}: { variant?: Variant; size?: Size; block?: boolean } = {}) {
  return cn(BASE, VARIANTS[variant], SIZES[size], block && "w-full");
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  trailing?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "outline", size = "md", icon, trailing, block, className, children, ...rest },
  ref,
) {
  return (
    <button ref={ref} className={cn(buttonStyles({ variant, size, block }), className)} {...rest}>
      {icon ? <span className="shrink-0 [&_svg]:size-[14px]">{icon}</span> : null}
      {children}
      {trailing ? <span className="shrink-0 [&_svg]:size-[14px]">{trailing}</span> : null}
    </button>
  );
});

interface LinkButtonProps {
  to: string;
  variant?: Variant;
  size?: Size;
  block?: boolean;
  icon?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Same surface as Button, but it navigates — so it stays an anchor. */
export function LinkButton({
  to,
  variant = "outline",
  size = "md",
  block,
  icon,
  trailing,
  className,
  children,
}: LinkButtonProps) {
  return (
    <Link to={to} className={cn(buttonStyles({ variant, size, block }), className)}>
      {icon ? <span className="shrink-0 [&_svg]:size-[14px]">{icon}</span> : null}
      {children}
      {trailing ? <span className="shrink-0 [&_svg]:size-[14px]">{trailing}</span> : null}
    </Link>
  );
}
