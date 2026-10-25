# Installation sur un nouveau projet Supabase

## Le plus simple : un seul fichier à coller

1. Supabase > *SQL Editor* > *New query* : coller tout le contenu de **`supabase/setup.sql`**, puis *Run*.
   Il crée toute la base (toutes les migrations), règle l'adresse du projet pour les tâches automatiques
   et donne l'accès admin à `bastienryser20004@gmail.com` (tout de suite si l'utilisateur existe, sinon dès sa création).
   À lancer une seule fois, sur un projet neuf. Après une nouvelle migration : `npm run setup:sql` pour le régénérer.
2. *Authentication > Users > Add user* avec `bastienryser20004@gmail.com` (cocher *Auto Confirm User*).
3. Edge Functions : `supabase login`, puis
   `supabase functions deploy --project-ref cocfslavrraexyavnzmg` et
   `supabase secrets set --project-ref cocfslavrraexyavnzmg APP_URL=https://bastienryser.space`.
4. Les réglages des tableaux de bord ci-dessous (inscriptions, Site URL, Vercel, Google Cloud).

Sinon, procédure à suivre par Claude (connecteur Supabase branché sur le compte de Bastien) ou à la main.
Chaque étape est idempotente : on peut la relancer sans risque.

## Ce que fait Claude (connecteur Supabase)

1. **Organisation** : `list_organizations`, puis demander à Bastien laquelle utiliser s'il y en a plusieurs.
2. **Projet** : `create_project` avec `name = "bastienryser.space"`, `region = "eu-central-2"` (Zurich).
   Attendre `ACTIVE_HEALTHY` avec `get_project`.
3. **Base** : `apply_migration` pour chaque fichier de `supabase/migrations/`, **dans l'ordre** :
   1. `20261025000000_socle` (admins, `is_admin()`, RLS)
   2. `20261025000100_panel` (business, réseaux, Vault, Storage, verrou de publication, Cantia)
   3. `20261025000200_cron` (tâches pg_cron)
   4. `20261025000300_system_status` (suivi de santé, secret des tâches généré dans le Vault)
   5. `20261025000400_data_module` (surveillance des sites, connecteurs Stripe et Plausible, chiffres quotidiens)
   6. `20261025000500_google_connectors` (Search Console et Google Analytics 4)
   7. `20261025000600_keywords` (historique quotidien des mots-clés, mots-clés suivis, classements)
   8. `20261025000700_hardening` (durcissement relevé par les contrôles de sécurité Supabase)
   9. `20261025000800_more_networks` (YouTube, TikTok, Bluesky, Pinterest, X ; Threads disponible)
4. **Adresse du projet pour pg_cron** (pas un secret) avec `execute_sql` :
   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'project_url')
   where not exists (select 1 from vault.secrets where name = 'project_url');
   ```
5. **Edge Functions** : `deploy_edge_function` pour `oauth`, `publish-due`, `refresh-tokens`, `fetch-metrics`, `health`,
   `monitor-sites`, `sync-connectors`, `connectors`,
   avec `verify_jwt: false` (chaque fonction vérifie elle-même l'appelant). Fichiers à envoyer pour chacune :
   `<nom>/index.ts`, les fichiers de `_shared/` utilisés (chemins `../_shared/…`) et `deno.json`.
   Variante sans recopier le code (dépôt public) : déployer pour chaque fonction un `index.ts` d'une ligne,
   `import "https://raw.githubusercontent.com/thefoxexe/bastienryser.space/<commit>/supabase/functions/<nom>/index.ts";`,
   avec `deno.json` comme import map. Supabase récupère alors le code exact de ce commit.
6. **Secret `APP_URL`** des Edge Functions : `create_edge_function_secret` avec l'adresse du panel
   (`https://bastienryser.space`, ou l'adresse Vercel tant que le domaine n'est pas branché).
7. **Contrôle** : `get_advisors` (security puis performance) et corriger ce qui ressort.
8. **Clés pour Vercel** : `get_project_url` et `get_publishable_keys` (clé `sb_publishable_…`, non désactivée).
   Les donner à Bastien pour `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
   Elles sont publiques par nature : sans session admin, la RLS ne laisse rien lire.
9. **Admin** : une fois que Bastien a créé son utilisateur, avec `execute_sql` :
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = '<e-mail de Bastien>'
   on conflict do nothing;
   ```

Ne jamais demander de clé secrète dans la conversation (Meta, LinkedIn, Claude, `service_role`) :
Bastien les saisit lui-même dans Supabase et Vercel.

## Ce que fait Bastien (tableaux de bord)

**Supabase**
- *Authentication > Sign In / Providers* : décocher **Allow new users to sign up**.
- *Authentication > Users > Add user* : créer son utilisateur (cocher *Auto Confirm User*), puis prévenir Claude (étape 9).
- *Authentication > URL Configuration* : *Site URL* = adresse du panel.
- Plus tard, *Edge Functions > Secrets* : `META_APP_ID`, `META_APP_SECRET`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`
  (et `LINKEDIN_PAGE_*` pour la page entreprise), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, puis selon les réseaux voulus
  `THREADS_*`, `TIKTOK_*`, `PINTEREST_*`, `X_*` (voir « Autres réseaux »).

**Google Cloud** (une fois, pour Search Console et Google Analytics)
1. console.cloud.google.com → nouveau projet (ex. « bastienryser »).
2. *API et services > Bibliothèque* : activer **Google Search Console API**, **Google Analytics Data API**
   et **Google Analytics Admin API**.
3. *Écran de consentement OAuth* : type **Externe**, ton e-mail comme contact, ajouter les champs d'application
   `webmasters.readonly` et `analytics.readonly`.
4. **Publier l'application** (statut « En production ») : en mode « Test », Google coupe la connexion au bout de 7 jours.
   Sans validation Google, un avertissement « application non validée » s'affiche à la connexion : c'est normal
   pour un outil privé, clique sur *Paramètres avancés > Continuer*.
5. *Identifiants > Créer > ID client OAuth* : type **Application Web**, URI de redirection autorisé :
   `https://<ref>.supabase.co/functions/v1/oauth/callback`.
6. Copier l'ID client et le code secret dans les secrets Supabase (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).

**Autres réseaux** (URI de redirection partout : `https://<ref>.supabase.co/functions/v1/oauth/callback`)
- **Threads** : dans l'app Meta, ajouter le cas d'usage « Accéder à l'API Threads », permissions `threads_basic`,
  `threads_content_publish`, `threads_manage_insights`. Secrets : `THREADS_APP_ID`, `THREADS_APP_SECRET` (identifiants Threads,
  différents de ceux de l'app Meta).
- **YouTube** : même client OAuth que Google ; activer **YouTube Data API v3** et ajouter les champs d'application
  `youtube.upload` et `youtube.readonly` à l'écran de consentement. Tant que le projet n'a pas passé l'audit YouTube
  (formulaire « YouTube API Services – Audit »), les vidéos envoyées restent privées.
- **TikTok** : developers.tiktok.com → app avec **Login Kit** et **Content Posting API** (Direct Post activé), champs
  `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.publish`, `video.upload`, `video.list`.
  Secrets : `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`. Avant l'audit TikTok, les vidéos arrivent dans la boîte de réception
  TikTok du compte (à publier depuis l'app).
- **Pinterest** : developers.pinterest.com → app, champs `boards:read`, `pins:read`, `pins:write`, `user_accounts:read`.
  Secrets : `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET`. En accès Trial, les épingles ne sont visibles que par toi.
- **X** : console.x.com → app, OAuth 2.0 « Web App » (client confidentiel), champs `tweet.read`, `tweet.write`, `users.read`,
  `media.write`, `offline.access`, et des crédits d'API (facturation à l'usage). Secrets : `X_CLIENT_ID`, `X_CLIENT_SECRET`.
- **Bluesky** : rien à créer. Dans le panel, identifiant + mot de passe d'application (Bluesky › Réglages › Confidentialité
  et sécurité › Mots de passe d'application).

**Vercel** (*Settings > Environment Variables*, puis *Deployments > Redeploy* : obligatoire, ces valeurs sont figées au build)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ANTHROPIC_API_KEY`.

## Vérifier que tout marche

Dans le panel : **Réglages > État du système**. Chaque brique y est contrôlée :
schéma, admins, secrets du Vault, tâches automatiques (dernier passage), Edge Functions, identifiants Meta et LinkedIn,
double authentification, clé Claude.

- *Publication automatique* doit afficher un passage de moins de 5 minutes.
- *Surveillance des sites* : toutes les 5 minutes. *Synchronisation des connecteurs* : chaque heure (à :07).
- *Renouvellement des connexions* et *statistiques* passent une fois par jour (3 h 17 et 4 h 43 UTC).

## Connecteurs de données (dans le panel)

*Business > Données > Connecteurs* : la clé est testée, chiffrée dans le Vault, puis une première synchronisation est lancée.
- **Stripe** : clé restreinte avec uniquement *Charges : lecture*.
- **Plausible** : clé *Stats API* et domaine du site tel qu'il apparaît dans Plausible.
- **Search Console** et **Google Analytics 4** : bouton *Connecter avec Google* (lecture seule). Si le compte voit
  plusieurs sites ou propriétés, le panel demande lequel suivre.

## Bon à savoir

- Sur le plan gratuit, Supabase met en pause un projet inactif environ une semaine. Une pause arrête les publications
  programmées : la page *État du système* le signale (« la tâche ne tourne plus »). Le plan Pro évite ce risque.
- Redirection OAuth à déclarer dans les apps Meta et LinkedIn : `https://<ref>.supabase.co/functions/v1/oauth/callback`.
