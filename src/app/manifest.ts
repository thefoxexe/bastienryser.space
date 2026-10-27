import type { MetadataRoute } from "next";

/** Application installable (écran d'accueil iPhone, Android, ordinateur). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bastien's Space",
    short_name: "Bastien's Space",
    description: "Posts, chiffres et sites de tes business, au même endroit.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
    lang: "fr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
