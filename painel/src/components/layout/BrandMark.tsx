import { cn } from "@/lib/cn";

/**
 * O emblema da comunidade: recorte redondo da arte "Servidor Lendas CSS",
 * a mesma usada no favicon. Ladeia o nome no cabeçalho do sidebar e do
 * painel de admin.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/brand-mark.png"
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn("size-7 shrink-0 select-none rounded-full object-cover ring-1 ring-line-soft", className)}
    />
  );
}
