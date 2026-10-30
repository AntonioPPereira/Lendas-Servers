import { cn } from "@/lib/cn";
import { TEAM_CREST } from "@/lib/csAssets";

const LABEL = { CT: "Counter-Terrorists", T: "Terrorists" } as const;

/** Brasão oficial do lado, colorido — é o âncora visual do placar. */
export function TeamCrest({
  team,
  className,
}: {
  team: "CT" | "T";
  className?: string;
}) {
  return (
    <img
      src={TEAM_CREST[team]}
      alt={LABEL[team]}
      draggable={false}
      className={cn("size-14 shrink-0 select-none object-contain", className)}
    />
  );
}
