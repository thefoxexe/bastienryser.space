# Consignes pour Claude

- Réponds toujours en français.
- Le cahier des charges est dans `docs/brief.md` : le relire avant toute nouvelle étape. Hébergement : **Vercel** (et non Netlify).
- Next.js 16 : lire `AGENTS.md` et la doc dans `node_modules/next/dist/docs/` avant d'écrire du code
  (le middleware s'appelle désormais `proxy.ts`).
- Chaque table a la RLS activée, avec des règles basées sur `public.is_admin()`.
- Chaque Server Action commence par `requireAdmin()` (`src/lib/auth.ts`).
- Les tokens des réseaux restent dans Supabase Vault et ne sont lus que par les Edge Functions (`supabase/functions`).
- N'afficher que des chiffres réels venant des API, jamais d'estimation.
- Aucun secret dans le code ni dans Git.
- Vérifier avant de pousser : `npm run lint`, `npx tsc --noEmit`, `npm run build`,
  et `deno check --config supabase/functions/deno.json supabase/functions/*/index.ts`.
