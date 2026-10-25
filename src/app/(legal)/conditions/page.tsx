import type { Metadata } from "next";

export const metadata: Metadata = { title: "Conditions d'utilisation" };

const CONTACT = "bastienryser20004@gmail.com";

export default function TermsPage() {
  return (
    <>
      <h1>Conditions d&apos;utilisation</h1>
      <p>Dernière mise à jour : 25 octobre 2026.</p>

      <h2>Objet</h2>
      <p>
        bastienryser.space est un outil privé qui permet à son propriétaire de préparer, programmer et publier des contenus sur ses propres comptes de
        réseaux sociaux, et d&apos;en consulter les statistiques. L&apos;accès est réservé au propriétaire ; aucune inscription n&apos;est ouverte au
        public.
      </p>

      <h2>Comptes connectés</h2>
      <p>
        L&apos;utilisateur ne connecte que des comptes dont il est titulaire ou qu&apos;il est autorisé à gérer. Il reste responsable des contenus
        publiés et s&apos;engage à respecter les conditions de chaque plateforme, notamment celles de{" "}
        <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">
          YouTube
        </a>
        ,{" "}
        <a href="https://www.tiktok.com/legal/page/global/terms-of-service/fr" target="_blank" rel="noreferrer">
          TikTok
        </a>{" "}
        et{" "}
        <a href="https://www.linkedin.com/legal/user-agreement" target="_blank" rel="noreferrer">
          LinkedIn
        </a>
        .
      </p>

      <h2>Publication</h2>
      <p>
        Les contenus ne sont publiés qu&apos;à la demande explicite de l&apos;utilisateur, immédiatement ou à la date qu&apos;il a choisie. Il peut
        modifier ou annuler une publication programmée à tout moment avant son envoi.
      </p>

      <h2>Disponibilité</h2>
      <p>
        L&apos;outil est fourni tel quel. Les publications dépendent de la disponibilité des plateformes et de leurs API, qui peuvent refuser ou
        retarder un contenu.
      </p>

      <h2>Données</h2>
      <p>
        Le traitement des données est décrit dans la <a href="/confidentialite">politique de confidentialité</a>.
      </p>

      <h2>Contact</h2>
      <p>
        Bastien Ryser · <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </>
  );
}
