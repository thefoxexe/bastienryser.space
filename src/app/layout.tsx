import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { RegisterServiceWorker } from "@/components/pwa";
import "./globals.css";

// San Francisco est utilisée en priorité sur les appareils Apple (voir globals.css) ; Inter prend le relais ailleurs.
// Axe « opsz » : coupe Display (plus serrée) pour les grands titres, coupe Text pour le corps, comme SF Pro.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: { default: "bastienryser", template: "%s · bastienryser" },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  applicationName: "bastienryser",
  // Écran d'accueil iPhone : plein écran, barre d'état transparente au-dessus de l'app.
  appleWebApp: { capable: true, title: "bastienryser", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Thème choisi dans le panel (sinon celui du système), lu côté serveur pour éviter tout flash.
  const theme = (await cookies()).get("theme")?.value;
  const dataTheme = theme === "light" || theme === "dark" ? theme : undefined;

  return (
    <html
      lang="fr"
      data-theme={dataTheme}
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
