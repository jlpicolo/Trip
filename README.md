# Japan Trip

Application web collaborative (PWA, offline-first) de préparation et de suivi de voyage pour un
groupe de voyageurs aux droits égaux. Premier voyage : Japon, 9–30 mars 2027, 4 voyageurs.
Le nom, les dates, destinations et devises sont des réglages du voyage : l'application est réutilisable.

**État : toutes les phases terminées (planning, carte, billets, hébergements, carnet, accueil, budget, hors ligne,
finalisation) — voir [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).**

Sections : Accueil · Planning · Carte · Billets (trajets, PDF, QR codes) · Budget (pot commun, dépenses perso,
convertisseur EUR/JPY) · Hébergements · Carnet · Paramètres (hors ligne, export, duplication de voyage).
Installable (PWA) et utilisable sans réseau ; synchronisation entre les téléphones au retour du réseau.

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind CSS 4 · Supabase (Postgres + RLS, Auth, Storage)
· Dexie/IndexedDB · Service Worker manuel · MapLibre GL (OpenFreeMap / OpenStreetMap)

## Production

https://trip-teal-three.vercel.app — déploiement, variables Vercel et gestion des comptes :
[docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md).

## Démarrage local

```bash
npm install
cp .env.example .env.local   # puis compléter
npm run dev
```

## Tests

| Commande | Contenu | Prérequis |
|---|---|---|
| `npm test` | unitaires : moteur de synchro, fusion, dates, validation | aucun |
| `npm run test:integration` | moteur de synchro contre Supabase réel | `.env.local` (clé secrète) |
| `npm run test:e2e` | navigateur, 10 scénarios : collaboration, planning, carte, billets, hébergements, carnet, accueil, hors ligne, budget, accessibilité (axe, WCAG 2.1 AA) | app lancée **en production** (`npm run build && npm run start`), Playwright + Chromium |
| `npm run test:db` | RLS / synchro SQL sur PostgreSQL local | PostgreSQL 16+ |
| `npm run test:db:remote` | mêmes tests SQL sur Supabase | jeton `sbp_…` |

Les tests sur Supabase créent des comptes `@example.com` et suppriment toutes leurs données à la fin.

## Base de données

Le schéma est dans `supabase/migrations/`. Pour l'appliquer à un projet Supabase :

```bash
SUPABASE_PROJECT_REF=<ref> SUPABASE_ACCESS_TOKEN=sbp_... npm run db:push:remote
```

Projet de production : `brbhfakxpozrqdfgywdv` (« Trip », région eu-west-3 Paris, PostgreSQL 17).
Migrations appliquées et enregistrées dans `supabase_migrations.schema_migrations` (compatible `supabase db push`).

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
