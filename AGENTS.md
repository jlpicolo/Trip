<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Japan Trip — Règles agent

Spécification produit : le prompt initial du projet (résumé dans `docs/ARCHITECTURE.md`).
Architecture détaillée : [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).
Conventions reprises du projet One for All : [docs/REPRISE-ONE-FOR-ALL.md](./docs/REPRISE-ONE-FOR-ALL.md).

Stack : Next.js **16.4** (App Router, Turbopack) · React **19.3** · TypeScript strict · Tailwind CSS **4**
· Supabase (Postgres + RLS, Auth, Storage) · Dexie (IndexedDB) · MapLibre GL + PMTiles.

## Pièges Next.js 16

1. `middleware.ts` est renommé **`proxy.ts`**, à la racine du dépôt.
2. `cookies()` et `headers()` sont **async**.
3. `next.config.ts` en ESM natif (`export default`).
4. Tailwind 4 : thème via `@theme` dans `app/globals.css`, pas de `tailwind.config.js`.
5. **PWA sans plugin** (`next-pwa` et `@ducanh2912/next-pwa` dépendent de Webpack ; on évite toute couche intermédiaire) :
   `app/manifest.ts` + `public/sw.js` écrit à la main + enregistrement client.
6. Un `route.ts` ne peut pas coexister avec un `page.tsx` au même niveau.
7. Cookies de session `SameSite=lax`.
8. `next lint` n'existe plus : `eslint` directement.
9. React 19 Strict Mode : double montage en dev, les `useEffect` doivent être idempotents.

## Règles produit (non négociables)

- Aucune donnée fictive affichée comme réelle ; état vide + bouton d'ajout explicite.
- Aucun bouton décoratif sans fonctionnalité.
- Ne jamais simuler une synchronisation, une API ou une disponibilité hors ligne.
- Un temps de trajet, un taux de change ancien ou une estimation est toujours libellé comme tel.
- Une fonctionnalité n'est terminée que testée.

## Conventions

- Tout le texte UI en français ; messages d'erreur compréhensibles.
- Commentaires : uniquement le POURQUOI non évident, jamais la paraphrase du code.
- Types partagés dans `lib/types/<domaine>.ts` ; schémas zod dans `lib/validation/`.
- Les composants ne lisent jamais le réseau : lecture/écriture via `lib/db/<domaine>.ts` (IndexedDB),
  le réseau passe exclusivement par `lib/sync/`.
- Identifiants : `crypto.randomUUID()` (UUID requis par Postgres) ; journées : UUID v5 déterministe.
- Argent : entiers en unités mineures ; formatage via `lib/formatters.ts` (`Intl.NumberFormat`).
- Composants UI dans `components/ui/*`, sobres ; icônes en SVG inline (pas de bibliothèque d'icônes),
  animations en CSS uniquement.
- Un seul Drawer par page, contrôlé par état.
- Champs numériques : `inputMode="decimal"` + saisie tamponnée (validation au blur).
- `AGENTS.md` et `docs/ARCHITECTURE.md` sont mis à jour en même temps que le code, phase par phase.
- Toute écriture de données de voyage passe par `getEngine().insert/update/remove` (jamais d'écriture
  directe dans Supabase ni dans Dexie depuis un composant).
- Les listes affichées filtrent `deleted_at` (suppressions logiques conservées localement).
- Ne jamais retirer la règle `turbopack.rules["*.css"]` de `next.config.ts` (compilation Tailwind).

## Tests

- `npm test` : tests unitaires (Vitest + fake-indexeddb), dont le moteur de synchro face à un faux serveur.
- `npm run test:integration` : moteur de synchro contre le VRAI Supabase (crée puis supprime 5 comptes).
- `npm run test:e2e` : Chromium, 2 voyageurs, hors ligne / retour réseau (app démarrée sur :3000).
- `npm run db:push:remote` : applique les migrations manquantes sur Supabase (API de gestion).
- `npm run test:db` : migrations + tests SQL (RLS, Storage, synchro). Requiert PostgreSQL (PGHOST…).
- `npm run test:db:remote` : mêmes tests sur le projet Supabase réel (nettoyage automatique).
- `npm run build`, `npm run lint`, `npm run typecheck` avant chaque commit.

## Exploitation

- Inscription publique désactivée : comptes gérés par `npm run travelers` (voir `docs/DEPLOIEMENT.md`).
- Ne jamais ajouter `SUPABASE_SECRET_KEY` aux variables Vercel ni l'utiliser dans `app/` ou `components/`.
