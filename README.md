# bastienryser.space — panel de gestion privé

Panel privé, réservé à Bastien, qui réunit ses business (Cantia en premier) et leurs outils.
Premier outil : publier sur Instagram, Facebook et LinkedIn en une fois, programmer, et suivre les résultats.

- **Next.js 16** (App Router, TypeScript, Server Actions) + **Tailwind CSS 4**, hébergé sur **Vercel**
- **Supabase** : Auth (mot de passe + TOTP), Postgres avec RLS, Storage, Vault, Edge Functions, pg_cron
- **Claude** (`claude-opus-5-5`) pour adapter les descriptions par réseau et traduire en allemand / italien

## Ce que fait le panel

| Page | Contenu |
|---|---|
| `/connexion` | E-mail + mot de passe, puis code TOTP si la double authentification est active |
| `/` | Tableau de bord : à traiter, cartes par business, 14 prochains jours, chiffres 30 jours, journal |
| `/b/[slug]` | Aperçu d'un business |
| `/b/[slug]/reseaux` | Composer (images, carrousel, PDF LinkedIn, description par réseau, aperçus, IA, programmation) |
| `/b/[slug]/reseaux/calendrier` · `historique` · `comptes` | Calendrier mensuel, historique avec chiffres, comptes connectés |
| `/reglages` | Profil, double authentification, gestion des business |

## Sécurité

- `src/proxy.ts` (le « middleware » de Next.js 16) vérifie la session côté serveur sur toutes les pages sauf `/connexion`.
- Aucune inscription possible. Les comptes se créent dans Supabase, et seuls ceux listés dans `admins` ont accès.
- `public.is_admin()` sert de base à **toutes** les règles RLS et exige le code TOTP (`aal2`) dès que la 2FA est active.
- Session en cookies `httpOnly` ; toute l'authentification passe par le serveur.
- Les tokens des réseaux sont chiffrés dans **Supabase Vault** et lus uniquement par les Edge Functions.
  Le site Next.js ne les voit jamais, même côté serveur.
- `robots.txt` (`Disallow: /`), balise `noindex`, en-tête `X-Robots-Tag` et en-têtes de sécurité sur toutes les réponses.
- Aucun secret dans Git (`.env*` ignoré, sauf les modèles `.env.example`).

## Architecture

```
src/
  proxy.ts                     protection des pages
  app/connexion                connexion + TOTP
  app/(panel)/...              pages du panel (vérifient is_admin)
  components/composer          compositeur de posts (glisser-déposer, aperçus, IA)
  lib/social/networks.ts       limites par réseau (caractères, hashtags, images)
  modules/registry.ts          modules activables par business
supabase/
  migrations/                  schéma, RLS, Vault, Storage, verrou de publication, pg_cron
  functions/oauth              connexion Meta / LinkedIn (tokens → Vault)
  functions/publish-due        publication chaque minute (verrou, 3 essais, statuts)
  functions/refresh-tokens     renouvellement quotidien et alertes d'expiration
  functions/fetch-metrics      statistiques réelles quotidiennes
  functions/health             diagnostic pour la page « État du système »
```

**Ajouter un module** : le déclarer dans `src/modules/registry.ts`, créer ses tables (RLS `is_admin()`)
et ses pages sous `src/app/(panel)/b/[slug]/<module>`.

## Développement local

```bash
cp .env.example .env.local   # puis remplir
npm install
npm run dev
```

Vérifications : `npm run lint`, `npx tsc --noEmit`, `npm run build`, et pour les Edge Functions
`cd supabase/functions && deno check --config deno.json */index.ts`.

## Mise en route

La procédure complète, étape par étape, est dans **[docs/installation.md](docs/installation.md)**.
En résumé :

### 1. Supabase
1. Nouveau projet (séparé de Cantia), région *Central EU (Zurich)*.
2. Migrations de `supabase/migrations/` dans l'ordre, puis le secret `project_url` du Vault
   (le secret des tâches automatiques est généré tout seul par la migration).
3. Edge Functions déployées (`oauth`, `publish-due`, `refresh-tokens`, `fetch-metrics`, `health`) et secret `APP_URL`.
4. Inscriptions désactivées, ton utilisateur créé et ajouté dans `admins`, *Site URL* réglée.

### 2. Vercel
1. Projet importé depuis ce dépôt.
2. Variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ANTHROPIC_API_KEY`, puis **Redeploy**.
   Sans les deux premières, le site affiche une page « Presque prêt » au lieu d'une erreur.
3. Domaine `bastienryser.space`.

### 3. Réseaux sociaux
- **Meta** : passer Instagram Cantia en compte professionnel relié à la Page Facebook. Créer une app sur
  developers.facebook.com (cas d'usage « Gérer tout sur votre Page » + API Instagram avec Facebook Login).
  URL de redirection OAuth : `https://<ref>.supabase.co/functions/v1/oauth/callback`.
  En usage privé, l'app peut rester en mode développement avec toi comme administrateur.
- **LinkedIn** : créer une app sur linkedin.com/developers avec « Sign In with LinkedIn using OpenID Connect »
  et « Share on LinkedIn ». Même URL de redirection. Pour la page Cantia, demander la « Community Management API »
  (idéalement sur une app séparée : variables `LINKEDIN_PAGE_*`).
- Dans le panel : *Cantia > Réseaux sociaux > Comptes connectés > Connecter*.

### 4. Premier lancement
Se connecter, activer la double authentification dans **Réglages**, ouvrir **Réglages > État du système**
pour vérifier que tout est vert, puis composer un premier post.

## Limites connues (APIs officielles, octobre 2026)

- Instagram via API : carrousel de **10 images** maximum, JPEG uniquement (conversion automatique dans le navigateur).
- LinkedIn profil personnel : pas de statistiques détaillées via l'API ouverte (rien n'est inventé, « — » s'affiche).
- Meta : les chiffres peuvent arriver avec jusqu'à 48 h de délai ; l'accès doit être réautorisé environ tous les 90 jours
  (alerte 7 jours avant sur le tableau de bord).
- Vidéos, Threads, TikTok et YouTube : prévus plus tard.
