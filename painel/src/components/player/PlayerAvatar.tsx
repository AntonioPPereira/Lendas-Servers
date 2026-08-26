import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { hash } from "@/data/seed";
import { initials } from "@/lib/format";

/** Muted metals only — the avatar must never out-shout the accent colour. */
const TONES = ["#e8b33a", "#4e8fd8", "#c0894a", "#7d8a99", "#8f5f4a", "#5f7d6a", "#8a7bb0"];

const SIZES = {
  xs: "size-6",
  sm: "size-8",
  md: "size-10",
  lg: "size-14",
  xl: "size-20",
} as const;

/** Larger renders get a finer grid so the mark reads as an emblem, not a blob. */
const RESOLUTION: Record<keyof typeof SIZES, number> = {
  xs: 5,
  sm: 5,
  md: 5,
  lg: 7,
  xl: 7,
};

interface PlayerAvatarProps {
  seed: string;
  nickname?: string;
  size?: keyof typeof SIZES;
  online?: boolean;
  team?: "CT" | "T" | "SPEC";
  className?: string;
  /** Foto real (Steam), quando o backend já resolveu — substitui o emblema gerado, mesmo layout. */
  avatarUrl?: string;
}

/**
 * Emblema determinístico gerado a partir do seed — usado sempre que não há
 * `avatarUrl` real (jogador do ranking histórico, ou live ainda sem avatar
 * resolvido). Quando `avatarUrl` chega, vira uma foto real no mesmo lugar,
 * sem mudar layout, ring ou o ponto de "online".
 */
export function PlayerAvatar({
  seed,
  nickname,
  size = "md",
  online = false,
  team,
  className,
  avatarUrl,
}: PlayerAvatarProps) {
  const resolution = RESOLUTION[size];

  const { cells, tone } = useMemo(() => {
    const h = hash(seed);
    const toneColor = TONES[h % TONES.length]!;
    const half = Math.ceil(resolution / 2);
    const bits: boolean[] = [];

    // Generate the left half, then mirror it: symmetry is what makes a
    // generated mark read as a crest rather than noise.
    for (let y = 0; y < resolution; y += 1) {
      const row: boolean[] = [];
      for (let x = 0; x < half; x += 1) {
        row.push((hash(seed + ":" + x + ":" + y) & 0x7) > 3);
      }
      const mirrored = row.slice(0, resolution - half).reverse();
      bits.push(...row, ...mirrored);
    }
    return { cells: bits, tone: toneColor };
  }, [seed, resolution]);

  const ring =
    team === "CT"
      ? "ring-ct/40"
      : team === "T"
        ? "ring-t/40"
        : online
          ? "ring-live/40"
          : "ring-transparent";

  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 place-items-center overflow-hidden rounded-xs",
        "border border-line-soft bg-panel-2 ring-1",
        ring,
        SIZES[size],
        className,
      )}
      title={nickname}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="size-full object-cover" aria-hidden="true" />
      ) : (
        <svg
          viewBox={"0 0 " + resolution + " " + resolution}
          className="size-full"
          shapeRendering="crispEdges"
          aria-hidden="true"
        >
          <rect width={resolution} height={resolution} fill="#0e1116" />
          {cells.map((on, index) =>
            on ? (
              <rect
                key={index}
                x={index % resolution}
                y={Math.floor(index / resolution)}
                width="1"
                height="1"
                fill={tone}
                opacity={0.78}
              />
            ) : null,
          )}
        </svg>
      )}
      <span className="sr-only">{nickname ? initials(nickname) : seed}</span>
      {online ? (
        <span className="absolute -bottom-px -right-px size-1.5 rounded-full bg-live ring-2 ring-panel" />
      ) : null}
    </span>
  );
}
