/**
 * Pendant que le panel charge ses données, la page s'affiche déjà : l'écran de lancement (SplashGate, dans le layout
 * racine) la recouvre. Sans ce fichier, rien ne s'afficherait avant la fin du chargement et le téléphone
 * garderait son propre écran de démarrage.
 */
export default function Loading() {
  return <div className="min-h-dvh bg-bg" />;
}
