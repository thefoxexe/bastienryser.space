import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";
export const NO_KEY = "Ajoute ANTHROPIC_API_KEY dans les variables d'environnement de Vercel.";

export function claude() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic();
}

export function friendlyError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return "Clé Claude invalide : vérifie ANTHROPIC_API_KEY.";
  if (error instanceof Anthropic.RateLimitError) return "Trop de demandes à Claude, réessaie dans un instant.";
  if (error instanceof Anthropic.APIConnectionError) return "Claude est injoignable pour le moment.";
  if (error instanceof Anthropic.APIError) return `Erreur de Claude (${error.status ?? "?"}).`;
  return "L'IA n'a pas pu répondre.";
}

/** Texte final d'une réponse (les blocs de réflexion et d'outils sont ignorés). */
export function textOf(message: { content: { type: string }[] }) {
  return message.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
