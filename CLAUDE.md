# Consignes pour Claude

- Réponds toujours en français.
- Le cahier des charges est dans `docs/brief.md` : le relire avant toute nouvelle étape.
- Next.js 16 : lire `AGENTS.md` et la doc dans `node_modules/next/dist/docs/` avant d'écrire du code
  (le middleware s'appelle désormais `proxy.ts`).
- Chaque table a la RLS activée, avec des règles basées sur `public.is_admin()`.
- Chaque Server Action commence par `requireAdmin()` (`src/lib/auth.ts`).
- Aucun secret dans le code ni dans Git.
