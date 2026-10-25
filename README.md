# bastienryser.space — panel de gestion privé

Panel privé, réservé à Bastien, qui réunit ses business (Cantia en premier) et leurs outils.

- **Next.js 16** (App Router, TypeScript) + **Tailwind CSS 4**
- **Supabase** (Auth, Postgres avec RLS, plus tard Storage, Edge Functions et pg_cron)
- Hébergement **Netlify**, domaine `bastienryser.space`

## Sécurité, en bref

- Toutes les pages sauf `/connexion` passent par `src/proxy.ts` (le « middleware » de Next.js 16), qui
  vérifie la session côté serveur et redirige vers `/connexion` sinon.
- Aucune page d'inscription. Les comptes se créent uniquement dans le tableau de bord Supabase.
- La table `admins` liste les comptes autorisés. La fonction SQL `public.is_admin()` sert de base à
  toutes les règles RLS ; elle exige en plus le code TOTP (`aal2`) dès que la double authentification est active.
- Session en cookies `httpOnly` : le navigateur ne lit jamais les jetons.
- `robots.txt` (`Disallow: /`), balise `noindex` et en-tête `X-Robots-Tag` sur toutes les réponses.
- Aucun secret dans Git : `.env*` est ignoré, sauf `.env.example` qui ne contient que des noms de variables.

## Développement local

```bash
cp .env.example .env.local   # puis remplir les deux valeurs
npm install
npm run dev
```

## Base de données

Les migrations SQL sont dans `supabase/migrations/`. Pour les appliquer : coller le fichier dans
Supabase > SQL Editor, ou utiliser la CLI Supabase (`supabase db push`).

## Mise en route (à faire par Bastien)

1. **Projet Supabase** : créer un nouveau projet (séparé de Cantia), région *Central EU (Zurich)*.
2. **Désactiver les inscriptions** : Authentication > Sign In / Providers > décocher *Allow new users to sign up*.
3. **Appliquer la migration** `supabase/migrations/20261025000000_socle.sql` (SQL Editor > coller > Run).
4. **Créer ton utilisateur** : Authentication > Users > *Add user* > *Create new user*
   (e-mail + mot de passe fort, cocher *Auto Confirm User*).
5. **T'ajouter dans `admins`** (SQL Editor) :
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'ton-email@exemple.ch';
   ```
6. **Netlify** : *Add new site* > *Import from GitHub* > ce dépôt. Les réglages de build sont lus dans `netlify.toml`.
   Dans *Site configuration > Environment variables*, ajouter :
   - `NEXT_PUBLIC_SUPABASE_URL` (Supabase > Project Settings > API > Project URL)
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Supabase > Project Settings > API Keys > *Publishable key*)
7. **Domaine** : Netlify > *Domain management* > ajouter `bastienryser.space`, puis suivre les instructions DNS.
8. **Supabase > Authentication > URL Configuration** : *Site URL* = `https://bastienryser.space`.
9. Se connecter, puis activer la double authentification dans **Réglages**.

La clé *publishable* peut être publique : sans session admin, la RLS ne laisse rien lire.
Les clés secrètes (Meta, LinkedIn, Claude, `service_role`) n'iront jamais dans Netlify côté client ni dans Git :
elles seront stockées dans les secrets des Edge Functions Supabase.
