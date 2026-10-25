# Brief : panel de gestion privé — bastienryser.space

Ce document est le cahier des charges du projet. Lis-le en entier avant d'écrire du code, et réponds toujours en français.

## 1. L'idée en une phrase

Un panel de gestion professionnel et privé, pour une seule personne (Bastien), qui réunit tous ses business au même endroit :
- un tableau de bord pour voir ce qui se passe partout ;
- une page par business, avec des outils qui agissent pour ce business.

Le premier business est **Cantia** (cantia.ch, accounting.cantia.ch, partners.cantia.ch). Le premier outil est la **publication sur les réseaux sociaux en une fois, avec suivi des résultats**.

Le panel doit pouvoir accueillir d'autres business et d'autres outils plus tard, sans tout refaire.

## 2. Règles non négociables

1. **Connexion obligatoire.** Toute page, sauf `/connexion`, redirige vers `/connexion` si on n'est pas connecté. C'est vérifié côté serveur (middleware), pas seulement côté client.
2. **Aucune inscription.** Pas de page ni de bouton « Créer un compte ». Les inscriptions sont désactivées dans Supabase. Bastien crée lui-même son utilisateur dans le tableau de bord Supabase.
3. **Accès réservé aux admins.** Une table `admins (user_id)` liste les comptes autorisés. Toutes les tables ont la RLS activée, avec des règles du type « seulement si `auth.uid()` est dans `admins` ».
4. **Aucun secret dans le code ni dans Git** : clés API, tokens des réseaux, clé Claude. Ils vont dans les variables d'environnement de l'hébergeur et dans les secrets Supabase. `.env*` est dans `.gitignore`.
5. **Les tokens des réseaux sociaux ne vont jamais au navigateur.** Seules les fonctions serveur (edge functions) les lisent. On les stocke chiffrés (Supabase Vault ou chiffrement applicatif).
6. **Site invisible des moteurs de recherche** : `robots.txt` avec `Disallow: /`, `<meta name="robots" content="noindex">`, et aucun lien public vers le panel.
7. **Double authentification** (TOTP, supportée par Supabase Auth) proposée dans les réglages. On peut l'activer dès le début.
8. Base Supabase **séparée de celle de Cantia** : nouveau projet, région Zurich si possible.

## 3. Technique (proposition, à valider avec Bastien)

- **Framework** : Next.js (App Router) + TypeScript, avec `@supabase/ssr` pour la session en cookies httpOnly.
- **Interface** : Tailwind CSS et des composants sobres. Pas de look « template IA ».
- **Base de données, connexion, fichiers et tâches programmées** : Supabase (Postgres, Auth, Storage, Edge Functions, pg_cron).
- **Hébergement** : Netlify, sur le domaine `bastienryser.space`.
- **IA** : API Claude d'Anthropic, avec le modèle Claude le plus récent disponible.

Avant d'utiliser une librairie ou une API, vérifie sa documentation officielle **à jour**. Les API des réseaux sociaux changent souvent.

## 4. Pages

| Page | Contenu |
|---|---|
| `/connexion` | E-mail + mot de passe, puis le code TOTP si la double authentification est active. Rien d'autre. |
| `/` Tableau de bord | Vue de tous les business (voir § 5) |
| `/b/[slug]` | Page d'un business, avec des onglets : Aperçu, Réseaux sociaux, et les futurs modules |
| `/b/[slug]/reseaux` | Composer, Calendrier, Historique, Comptes connectés |
| `/reglages` | Profil, double authentification, gestion des business (créer, modifier, archiver) |

Mise en page :
- une barre latérale avec le sélecteur de business (logo et couleur de chaque business) ;
- la couleur du business choisi sert d'accent ;
- mode clair et mode sombre ;
- tout doit être utilisable sur téléphone.

## 5. Tableau de bord

- **Cartes par business** : nom, prochains posts programmés, derniers posts publiés et leur statut.
- **À traiter** : publications en échec, comptes dont la connexion expire dans moins de 7 jours ou a déjà expiré.
- **Calendrier des 14 prochains jours**, tous business confondus.
- **Chiffres des réseaux sur 30 jours**, par business et par réseau : portée, interactions, abonnés si l'API le donne. N'affiche que des chiffres réels venant des API. Jamais d'estimation présentée comme un chiffre réel.
- **Journal d'activité** : « Carrousel publié sur Instagram (Cantia) », « Connexion LinkedIn renouvelée »…

## 6. Modèle de données (base de départ)

```
admins            (user_id pk → auth.users)
businesses        (id, slug, name, color, logo_path, websites text[], archived_at, created_at)
social_accounts   (id, business_id, network, display_name, external_id,
                   token_ref, token_expires_at, status: connected|expiring|expired|error, created_at)
posts             (id, business_id, title, status: draft|scheduled|publishing|published|partial|failed,
                   scheduled_at, created_at, updated_at)
post_media        (id, post_id, position, storage_path, kind: image|video|pdf, width, height)
post_targets      (id, post_id, social_account_id, caption, status: pending|publishing|published|failed,
                   external_post_id, permalink, error_message, attempts, published_at)
post_metrics      (id, post_target_id, fetched_at, impressions, reach, likes, comments, shares, saves)
activity_log      (id, business_id, kind, message, meta jsonb, created_at)
```

- `token_ref` pointe vers le secret chiffré, jamais vers le token en clair.
- Prévoir l'architecture en **modules** : un business active des modules (réseaux sociaux, plus tard d'autres), et chaque module a ses propres tables et ses propres onglets.

## 7. Module « Réseaux sociaux »

### 7.1 Connecter un compte
- Bouton « Connecter » par réseau, avec le flux OAuth officiel. Le callback est géré par une edge function, qui stocke le token chiffré.
- Une tâche quotidienne renouvelle les tokens avant leur expiration (environ 60 jours chez Meta et LinkedIn, à vérifier dans leur doc).
- Si un renouvellement échoue, alerte sur le tableau de bord.

### 7.2 Composer un post
- **Déposer des images** :
  - 1 image = un post simple ; plusieurs images = un carrousel ;
  - limites par réseau à vérifier ;
  - format conseillé : 4:5, 1080 × 1350.
  - Pour LinkedIn, possibilité de joindre un PDF (carrousel « document »).
  - L'ordre des images se change par glisser-déposer.
- **Choisir les comptes cibles** : par exemple Instagram Cantia, Page Facebook Cantia, LinkedIn de Bastien.
- **Une description commune**, modifiable réseau par réseau (onglet par réseau). Compteur de caractères et contrôle du nombre de hashtags selon les limites de chaque réseau.
- **Aperçu** de chaque réseau, proche du rendu réel.
- **Bouton IA** :
  - adapter la description à chaque réseau : plus courte et directe pour Instagram, plus professionnelle pour LinkedIn ;
  - traduire en allemand et en italien.
  - Bastien relit toujours avant de publier : rien ne part sans validation.
- **Publier maintenant** ou **Programmer** (date et heure, fuseau Europe/Zurich).

### 7.3 Publication
- `pg_cron` appelle chaque minute une edge function `publish-due`.
- Chaque cible est verrouillée avant envoi (statut `publishing`) pour ne **jamais publier deux fois**.
- En cas d'erreur, jusqu'à 3 essais espacés, puis statut `failed` avec un message d'erreur en français compréhensible.
- Si un réseau réussit et un autre échoue, le post passe en `partial`, avec un bouton « Réessayer » sur la cible en échec.
- Instagram exige des images accessibles par une adresse publique : générer des URL signées temporaires depuis Supabase Storage.

### 7.4 Suivi
- Une tâche quotidienne récupère les statistiques des posts publiés depuis 30 jours (`post_metrics`).
- L'historique affiche chaque post avec un lien vers la publication et ses chiffres par réseau.

### 7.5 Réseaux, dans l'ordre
1. **Instagram** (compte professionnel) et **Page Facebook**, via l'API Meta. En usage privé, l'app reste en mode développement avec Bastien comme admin, sans vérification Meta à passer (à confirmer dans la doc).
2. **LinkedIn, profil personnel** (partage de posts, images, documents).
3. **LinkedIn, page Cantia** : nécessite l'accès « Community Management API », à demander à LinkedIn. À brancher une fois l'accès accordé.
4. **Threads** (facultatif).
5. **Plus tard** : TikTok et YouTube. Sans leur vérification, les publications restent privées.

## 8. Étapes de développement

Chaque étape doit fonctionner, être vérifiée et poussée avant de passer à la suivante.

1. **Socle** : projet Next.js, connexion Supabase, middleware de protection, page `/connexion`, table `admins`, RLS, `robots.txt` et noindex, déploiement Netlify.
2. **Business** : CRUD des business dans `/reglages`, barre latérale avec sélecteur, page `/b/[slug]`. Créer Cantia comme premier business.
3. **Tableau de bord v1** : cartes business, journal d'activité.
4. **Réseaux, partie 1** : connexion Meta, composer, stockage des images, « Publier maintenant » sur Instagram et Facebook.
5. **Programmation** : calendrier, `publish-due`, verrou, essais, statuts.
6. **LinkedIn** : profil personnel, puis page dès que l'accès est accordé.
7. **Suivi** : statistiques quotidiennes, widgets du tableau de bord, alertes d'expiration.
8. **IA** : adaptation par réseau, traductions DE/IT.

## 9. Ce que Bastien fait lui-même

Le développeur le guide pas à pas sur chaque point.

- [ ] Créer le dépôt GitHub du projet et ouvrir une session Claude Code dessus.
- [ ] Créer le projet Supabase (région Zurich si possible), désactiver les inscriptions, créer son utilisateur et ajouter son `user_id` dans `admins`.
- [ ] Créer le site Netlify et faire pointer le DNS de `bastienryser.space` dessus.
- [ ] Passer le compte Instagram de Cantia en compte professionnel et le relier à la Page Facebook.
- [ ] Créer l'app développeur Meta et l'app développeur LinkedIn (demander l'accès « Community Management API » pour la page Cantia).
- [ ] Mettre lui-même toutes les clés dans les secrets Netlify et Supabase : Meta, LinkedIn, clé Claude. Il ne les colle jamais dans la conversation.

## 10. C'est terminé (v1) quand

- On ne peut rien voir sans être connecté, et aucune page ne permet de créer un compte.
- Bastien peut programmer un carrousel de 7 images pour Instagram, Facebook et LinkedIn en une fois, avec une description adaptée par réseau.
- À l'heure prévue, tout est publié une seule fois. Une erreur est visible sur le tableau de bord et peut être relancée.
- Le tableau de bord montre les prochains posts, les derniers publiés, leurs chiffres réels et les connexions à renouveler.
