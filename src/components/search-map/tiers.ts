import type { WorldQuery } from "@/lib/web-world";

/** Adresse lisible d'une page (« / » devient la page d'accueil). */
export const pageName = (path: string) => (path === "/" ? "la page d'accueil" : path);

export type TierId = "forces" | "opportunites" | "loin";

/** Trois groupes, d'après la position moyenne sur Google : simples à lire et à transformer en actions. */
export const TIERS: { id: TierId; title: string; range: string; hint: string; advice: (q: WorldQuery) => string }[] = [
  {
    id: "forces",
    title: "Forces",
    range: "positions 1 à 5",
    hint: "Tu es en haut de la première page : c'est ce qui t'amène du monde.",
    advice: (q) => `À protéger : garde ${pageName(q.page)} à jour, c'est elle qui sort sur « ${q.q} ».`,
  },
  {
    id: "opportunites",
    title: "Opportunités",
    range: "positions 6 à 20",
    hint: "Google te montre déjà, mais trop bas. Un petit effort fait monter le site.",
    advice: (q) => `Améliore ${pageName(q.page)} : parle clairement de « ${q.q} » dans le titre et le texte, ajoute des liens vers elle depuis tes autres pages.`,
  },
  {
    id: "loin",
    title: "Hors de portée",
    range: "au-delà de la 20e place",
    hint: "Recherchées, mais tu es trop loin pour être vu. Il faudrait une page dédiée.",
    advice: (q) => `Crée une page ou un article centré sur « ${q.q} » : aujourd'hui, c'est ${pageName(q.page)} qui sort, trop loin.`,
  },
];

export const tierOf = (q: WorldQuery): TierId => (q.position <= 5 ? "forces" : q.position <= 20 ? "opportunites" : "loin");

/** Couleurs : vert pour les forces, encre pour les opportunités, gris pour le reste (palette du panel). */
export const TIER_STYLE: Record<TierId, { fill: string; label: string; dot: string }> = {
  forces: { fill: "var(--green)", label: "#ffffff", dot: "bg-green" },
  opportunites: { fill: "var(--text)", label: "var(--bg)", dot: "bg-text" },
  loin: { fill: "color-mix(in oklab, var(--text) 16%, var(--bg))", label: "var(--text)", dot: "bg-faint" },
};
