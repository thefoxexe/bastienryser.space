import type { LucideIcon } from "lucide-react";
import { Activity, FolderKanban, Megaphone } from "lucide-react";

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
    description: "Disponibilité des sites, visiteurs, finances et mots-clés, à partir des vraies sources.",
    icon: Activity,
    basePath: "donnees",
    tabs: [
      { href: "", label: "Vue d'ensemble" },
      { href: "/finances", label: "Finances" },
      { href: "/visites", label: "Visites" },
      { href: "/recherche", label: "Recherche" },
      { href: "/mots-cles", label: "Mots-clés" },
      { href: "/sites", label: "Sites web" },
      { href: "/connecteurs", label: "Connecteurs" },
    ],
  },
  {
    id: "projects",
    label: "Projets",
    description: "Projets internes avec leurs tâches, échéances, pièces jointes et factures liées.",
    icon: FolderKanban,
    basePath: "projets",
    tabs: [{ href: "", label: "Projets" }],
  },
];

export function modulesFor(enabled: string[]) {
  return MODULES.filter((m) => enabled.includes(m.id));
}
