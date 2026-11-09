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

### Tests SQL (RLS, Storage, synchronisation)

`scripts/test-db.sh` crée une base PostgreSQL jetable, y installe un stub minimal des schémas
`auth`/`storage` de Supabase (`supabase/tests/00_supabase_stub.sql`), applique les migrations et
exécute les assertions de `supabase/tests/*.test.sql`.

```bash
PGHOST=localhost PGUSER=postgres npm run test:db
```

Le stub ne remplace pas un test sur un vrai projet Supabase : il sera complété par des tests
d'intégration contre `supabase start` (Docker) en CI.
