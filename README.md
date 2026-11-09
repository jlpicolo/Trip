# Japan Trip

Application web collaborative (PWA, offline-first) de préparation et de suivi de voyage pour un
groupe de voyageurs aux droits égaux. Premier voyage : Japon, 9–30 mars 2027, 4 voyageurs.
Le nom, les dates, destinations et devises sont des réglages du voyage : l'application est réutilisable.

**État : phase 1 (architecture) terminée — voir [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) et [docs/REPRISE-ONE-FOR-ALL.md](docs/REPRISE-ONE-FOR-ALL.md).**

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind CSS 4 · Supabase (Postgres + RLS, Auth, Storage)
· Dexie/IndexedDB · Service Worker manuel · MapLibre GL + PMTiles (OpenStreetMap)

## Démarrage local

```bash
npm install
cp .env.example .env.local   # puis compléter
npm run dev
```

## Base de données

Le schéma est dans `supabase/migrations/`. Pour l'appliquer à un projet Supabase :

```bash
npx supabase link --project-ref <ref>
npx supabase db push
```

Projet de production : `brbhfakxpozrqdfgywdv` (« Trip », région eu-west-3 Paris, PostgreSQL 17).
Migration `20261109000000_init` appliquée le 9 novembre 2026 et enregistrée dans
`supabase_migrations.schema_migrations` (compatible `supabase db push`).

### Tests SQL (RLS, Storage, synchronisation)

`scripts/test-db.sh` crée une base PostgreSQL jetable, y installe un stub minimal des schémas
`auth`/`storage` de Supabase (`supabase/tests/00_supabase_stub.sql`), applique les migrations et
exécute les assertions de `supabase/tests/*.test.sql`.

```bash
PGHOST=localhost PGUSER=postgres npm run test:db
```

### Tests sur le vrai projet Supabase

```bash
SUPABASE_PROJECT_REF=<ref> SUPABASE_ACCESS_TOKEN=sbp_... npm run test:db:remote
```

Exécute les mêmes assertions via l'API de gestion Supabase, puis supprime systématiquement les
données de test (`supabase/tests/remote_cleanup.sql`). Le jeton `sbp_…` se crée dans
*Account preferences → Access Tokens*.
