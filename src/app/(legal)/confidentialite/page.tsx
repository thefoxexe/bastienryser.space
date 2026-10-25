import type { Metadata } from "next";

export const metadata: Metadata = { title: "Politique de confidentialité" };

const CONTACT = "bastienryser20004@gmail.com";

export default function PrivacyPage() {
  return (
    <>
      <h1>Politique de confidentialité</h1>
      <p>Dernière mise à jour : 25 octobre 2026.</p>
      <p>
        bastienryser.space est un outil privé de gestion de contenus. Il est utilisé uniquement par son propriétaire, Bastien Ryser, pour publier
        sur ses propres comptes de réseaux sociaux et consulter leurs statistiques. Aucun compte ne peut y être créé par des tiers.
      </p>

      <h2>Données traitées</h2>
      <ul>
        <li>
          Lorsqu&apos;un compte est connecté (LinkedIn, TikTok, YouTube, Instagram, Facebook, Threads, X, Pinterest, Bluesky), l&apos;outil reçoit
          les jetons d&apos;accès accordés par la plateforme, ainsi que les informations publiques du compte : nom, identifiant, photo de profil.
        </li>
        <li>Les contenus préparés dans l&apos;outil (textes, images, vidéos) sont stockés jusqu&apos;à leur publication ou leur suppression.</li>
        <li>Les statistiques renvoyées par les plateformes (vues, interactions, abonnés) sont enregistrées pour suivre leur évolution.</li>
      </ul>

      <h2>Utilisation</h2>
      <p>
        Ces données servent uniquement à publier les contenus choisis par le propriétaire du compte, au moment qu&apos;il a fixé, et à lui afficher
        ses statistiques. Elles ne sont ni vendues, ni louées, ni partagées avec des tiers, ni utilisées à des fins publicitaires.
      </p>

      <h2>Stockage et sécurité</h2>
      <p>
        Les données sont hébergées par Supabase (Union européenne). Les jetons d&apos;accès sont chiffrés dans un coffre-fort (Supabase Vault) et ne
        sont lus que par les fonctions serveur qui publient ; ils ne sont jamais envoyés au navigateur. L&apos;accès à l&apos;outil est protégé par
        mot de passe et double authentification.
      </p>

      <h2>Conservation et suppression</h2>
      <p>
        Les jetons sont supprimés dès qu&apos;un compte est déconnecté dans l&apos;outil. L&apos;accès peut aussi être retiré à tout moment depuis la
        plateforme elle-même, par exemple dans les{" "}
        <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
          autorisations de votre compte Google
        </a>
        , les réglages de sécurité de TikTok ou les{" "}
        <a href="https://www.linkedin.com/psettings/permitted-services" target="_blank" rel="noreferrer">
          services autorisés de LinkedIn
        </a>
        . Toute demande d&apos;accès ou de suppression peut être envoyée à <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>

      <h2>Services Google et YouTube</h2>
      <p>
        L&apos;outil utilise les services d&apos;API YouTube. En connectant une chaîne, vous acceptez les{" "}
        <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">
          conditions d&apos;utilisation de YouTube
        </a>{" "}
        et la{" "}
        <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
          règle de confidentialité de Google
        </a>
        . L&apos;utilisation des informations reçues des API Google respecte la{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
          politique relative aux données utilisateur des services d&apos;API Google
        </a>
        , y compris les exigences d&apos;utilisation limitée.
      </p>

      <h2>Contact</h2>
      <p>
        Bastien Ryser · <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </>
  );
}
