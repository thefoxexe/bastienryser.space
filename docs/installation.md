# Installation sur un nouveau projet Supabase

Procédure à suivre par Claude (connecteur Supabase branché sur le compte de Bastien) ou à la main.
Chaque étape est idempotente : on peut la relancer sans risque.

## Ce que fait Claude

1. **Organisation** : `list_organizations`, puis demander à Bastien laquelle utiliser s'il y en a plusieurs.
2. **Projet** : `create_project` avec `name = "bastienryser.space"`, `region = "eu-central-2"` (Zurich).
   Attendre `ACTIVE_HEALTHY` avec `get_project`.
3. **Base** : `apply_migration` pour chaque fichier de `supabase/migrations/`, **dans l'ordre** :
   1. `20261025000000_socle` (admins, `is_admin()`, RLS)
   2. `20261025000100_panel` (business, réseaux, Vault, Storage, verrou de publication, Cantia)
   3. `20261025000200_cron` (tâches pg_cron)
   4. `20261025000300_system_status` (suivi de santé, secret des tâches généré dans le Vault)
4. **Adresse du projet pour pg_cron** (pas un secret) avec `execute_sql` :
   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'project_url')
   where not exists (select 1 from vault.secrets where name = 'project_url');
   ```
5. **Edge Functions** : `deploy_edge_function` pour `oauth`, `publish-due`, `refresh-tokens`, `fetch-metrics`, `health`,
   avec `verify_jwt: false` (chaque fonction vérifie elle-même l'appelant). Fichiers à envoyer pour chacune :
   `<nom>/index.ts`, les fichiers de `_shared/` utilisés (chemins `../_shared/…`) et `deno.json`.
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
  (et `LINKEDIN_PAGE_*` pour la page entreprise).

**Vercel** (*Settings > Environment Variables*, puis *Deployments > Redeploy* : obligatoire, ces valeurs sont figées au build)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ANTHROPIC_API_KEY`.

## Vérifier que tout marche

Dans le panel : **Réglages > État du système**. Chaque brique y est contrôlée :
schéma, admins, secrets du Vault, tâches automatiques (dernier passage), Edge Functions, identifiants Meta et LinkedIn,
double authentification, clé Claude.

- *Publication automatique* doit afficher un passage de moins de 5 minutes.
- *Renouvellement des connexions* et *statistiques* passent une fois par jour (3 h 17 et 4 h 43 UTC).

## Bon à savoir

- Sur le plan gratuit, Supabase met en pause un projet inactif environ une semaine. Une pause arrête les publications
  programmées : la page *État du système* le signale (« la tâche ne tourne plus »). Le plan Pro évite ce risque.
- Redirection OAuth à déclarer dans les apps Meta et LinkedIn : `https://<ref>.supabase.co/functions/v1/oauth/callback`.
