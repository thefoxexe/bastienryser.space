import type { LucideIcon } from "lucide-react";
import { Activity, Megaphone } from "lucide-react";

export type ModuleTab = { href: string; label: string };

export type ModuleDefinition = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Chemin relatif à /b/[slug]. */
  basePath: string;
  tabs: ModuleTab[];
};

// Pour ajouter un module : le déclarer ici, créer ses tables (avec RLS is_admin())
// et ses pages sous src/app/(panel)/b/[slug]/<basePath>.
export const MODULES: ModuleDefinition[] = [
  {
    id: "social",
    label: "Réseaux sociaux",
    description: "Publier sur tous les réseaux en une fois et suivre les résultats.",
    icon: Megaphone,
    basePath: "reseaux",
    tabs: [
      { href: "", label: "Composer" },
      { href: "/calendrier", label: "Calendrier" },
      { href: "/historique", label: "Historique" },
      { href: "/comptes", label: "Comptes connectés" },
    ],
  },
  {
    id: "data",
    label: "Données",
    description: "Disponibilité des sites, visiteurs et revenus, à partir des vraies sources.",
    icon: Activity,
    basePath: "donnees",
    tabs: [
      { href: "", label: "Vue d'ensemble" },
      { href: "/mots-cles", label: "Mots-clés" },
      { href: "/sites", label: "Sites web" },
      { href: "/connecteurs", label: "Connecteurs" },
    ],
  },
];

export function modulesFor(enabled: string[]) {
  return MODULES.filter((m) => enabled.includes(m.id));
}
