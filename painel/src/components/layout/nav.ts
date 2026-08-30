import {
  Activity,
  ChartColumn,
  Clapperboard,
  Gavel,
  Radar,
  Server,
  Swords,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** Rendered as a live counter in the rail. */
  live?: boolean;
  /** Seção em obra: continua clicável (leva à página de manutenção), mas sinalizada no menu. */
  maintenance?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Grouped by how a player actually uses the panel: what is happening now,
 * who plays here, and what has already been recorded.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Ao vivo",
    items: [
      { to: "/", label: "Visão geral", icon: Radar, end: true },
      { to: "/servidores", label: "Servidores", icon: Server, live: true },
      { to: "/atividade", label: "Atividade", icon: Activity },
    ],
  },
  {
    label: "Comunidade",
    items: [
      { to: "/ranking", label: "Ranking", icon: Trophy },
      { to: "/jogadores", label: "Jogadores", icon: Users },
    ],
  },
  {
    label: "Arquivo",
    items: [
      { to: "/demos", label: "Demos", icon: Clapperboard },
      { to: "/partidas", label: "Partidas", icon: Swords, maintenance: true },
      { to: "/banimentos", label: "Banimentos", icon: Gavel },
      { to: "/estatisticas", label: "Estatísticas", icon: ChartColumn },
    ],
  },
];
