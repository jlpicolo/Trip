# Japan Trip — Architecture technique

> Statut : **Phase 1 (analyse et architecture)**. Document vivant, mis à jour à chaque phase.
> Dernière mise à jour : 9 novembre 2026.

## 0. État du dépôt au démarrage

Le répertoire de travail était **vide** : pas de code, pas de dépôt Git, pas de dépôt GitHub associé.
Le projet a donc été initialisé :

| Élément | Version | Remarque |
|---|---|---|
| Next.js (App Router, code à la racine) | 16.4.5 | `middleware` s'appelle désormais `proxy` ; Turbopack par défaut |
| React | 19.3 | |
| TypeScript | 5, `strict: true` | |
| Tailwind CSS | 4 | configuration CSS-first (`@theme`) |
| Node | 22 | |

---

## 1. Architecture générale

```
┌────────────────────────── Appareil (×4 smartphones) ──────────────────────────┐
│  UI React (Next.js, pages « coquilles » statiques, rendu client)               │
│     │ lit/écrit uniquement ▼                                                   │
│  Couche données locale ── Dexie / IndexedDB  (source de vérité de l'UI)        │
│     │  • tables miroir (trips, activities, places, …)                          │
│     │  • outbox : file des mutations en attente                               │
│     │  • blobs : fichiers téléchargés (billets, PDF, images)                   │
│     │  • tuiles : extraits cartographiques PMTiles par ville                   │
│  Moteur de synchronisation (push outbox → pull delta → fusion → conflits)      │
│  Service Worker manuel (public/sw.js) : coquille, assets, polices, glyphes    │
└───────────────┬────────────────────────────────────────────────────────────────┘
                │ HTTPS, uniquement quand réseau disponible
┌───────────────▼──────────────┐   ┌───────────────────────┐   ┌─────────────────┐
│ Supabase                     │   │ Next.js (Vercel)      │   │ Hébergement     │
│ • Auth (email + mot de passe)│   │ • pages statiques     │   │ tuiles PMTiles  │
│ • Postgres + RLS             │   │ • route handlers :    │   │ (Cloudflare R2) │
│ • RPC sync_push / sync_pull  │   │   invitations (envoi  │   └─────────────────┘
│ • Storage privé (URLs signées│   │   email, clé service) │   API publiques :
└──────────────────────────────┘   └───────────────────────┘   Frankfurter (taux),
                                                               Nominatim (recherche)
```

### Choix structurants

1. **L'UI ne lit jamais le réseau directement.** Tous les écrans lisent IndexedDB via des hooks
   réactifs (`useLiveQuery` de Dexie). Le réseau ne sert qu'à synchroniser. Conséquence : l'application
   se comporte de la même manière en ligne et hors ligne, et l'état « hors ligne » n'est pas un mode à part.
2. **Next.js est utilisé comme générateur de coquilles + quelques routes serveur**, pas pour du rendu
   serveur des données. Les pages applicatives sont statiques (précachables par le Service Worker) et
   le voyage actif est conservé côté client : pas de segments dynamiques `/trip/[id]` dans les routes
   applicatives, sinon une page jamais visitée serait indisponible hors ligne.
   *Pourquoi garder Next.js plutôt qu'un SPA Vite ?* Vous l'avez demandé, il apporte un routage
   cohérent, un déploiement Vercel trivial et des route handlers sécurisés (invitations par email avec
   la clé service, jamais exposée au client). Le surcoût est limité car on n'utilise pas le SSR des données.
3. **La sécurité est garantie par la base, pas par le front.** RLS sur toutes les tables, triggers qui
   imposent auteur/version/curseur, RPC `SECURITY INVOKER` (la RLS s'applique aussi à la synchro).
   Le `proxy.ts` Next.js ne fait que de la redirection d'ergonomie (non connecté → `/connexion`).
4. **Pas de temps réel permanent.** Synchronisation : à l'ouverture, au retour au premier plan, au retour
   du réseau, quelques secondes après une modification locale, sur bouton « Synchroniser maintenant »,
   et optionnellement à intervalle (préférence). Pas de websocket Realtime.

### Arborescence cible

Code à la racine du dépôt (pas de `src/`), comme One for All.

```
  app/                    # routes (coquilles) : (auth)/connexion, (app)/accueil, planning, carte…
  components/             # UI : ui/ (design system), features/<section>/
  hooks/                  # hooks React (useTrip, useSyncStatus, useOnline…)
  lib/
    db/                   # schéma Dexie, accès local, migrations IndexedDB
    sync/                 # outbox, push, pull, fusion 3 voies, conflits
    budget/               # calculs financiers purs (testés)
    fx/                   # convertisseur, récupération et cache du taux
    supabase/             # clients navigateur / serveur
    validation/           # schémas zod partagés client + route handlers
    errors/               # erreurs typées, messages FR, journalisation
  public/sw.js            # service worker écrit à la main (pas de plugin)
supabase/
  migrations/             # SQL versionné
  tests/                  # tests SQL RLS / synchro (scripts/test-db.sh)
tests/ e2e/               # Vitest (unitaires/intégration), Playwright (E2E, mobile)
docs/                     # architecture, déploiement, limites PWA
```

---

## 2. Modèle de données

Fichier de référence : [`supabase/migrations/20261109000000_init.sql`](../supabase/migrations/20261109000000_init.sql).

### Niveaux

| Niveau | Tables | Remarque |
|---|---|---|
| Application / comptes | `auth.users`, `profiles` | profil créé par trigger (pseudo, avatar, couleur, thème) |
| Groupes | `travel_groups`, `group_members`, `group_invitations` | **aucun rôle** : tous les membres sont égaux |
| Voyages | `trips` | appartient à un groupe ; nom, dates, fuseau, devises, destinations, réglages partagés |
| Données du voyage | `trip_days`, `places`, `activities`, `transports`, `accommodations`, `journal_entries`, `documents`, `expenses`, `settlements`, `personal_expenses` | toutes rattachées à `trip_id` |
| Transverse | `activity_log`, `applied_mutations` | historique lisible ; idempotence de la synchro |

### Relations principales

```
travel_groups 1─n group_members n─1 auth.users 1─1 profiles
travel_groups 1─n trips
trips 1─n trip_days (unique trip_id+date)
trips 1─n places ◄── activities.place_id, accommodations.place_id,
                      transports.departure_place_id / arrival_place_id,
                      journal_entries.place_id, documents.place_id
trips 1─n activities  (date NULL = idée non planifiée ; journal_entry_id = issue du carnet)
trips 1─n documents ──► transport_id | accommodation_id | activity_id | place_id | journal_entry_id
                        scope = group | travelers (traveler_ids[])
trips 1─n expenses (shares jsonb = répartition)   trips 1─n settlements
trips 1─n personal_expenses (owner_id)            ← table séparée : jamais dans le pot commun
```

### Colonnes communes à toutes les données synchronisées

| Colonne | Rôle |
|---|---|
| `id uuid` | généré **côté client** (création hors ligne, idempotence) |
| `version int` | verrouillage optimiste : une modification doit citer la version de base |
| `created_by`, `updated_by` | imposés par trigger depuis le JWT (non falsifiables) |
| `created_at`, `updated_at` | imposés par le serveur |
| `deleted_at` | suppression logique (tombstone propagée aux autres appareils) |
| `txid xid8` | identifiant de transaction : curseur de synchronisation sans perte |

### Points notables

- **Montants** : entiers en unités mineures (`bigint`) — centimes pour EUR, yens pour JPY. Jamais de
  flottants pour l'argent. Chaque dépense stocke montant d'origine + devise + **taux figé à la saisie**
  + montant converti en devise de base. Les soldes ne bougent donc pas quand le taux du jour change.
- **Répartition** (`expenses.shares`) : `[{user_id, weight, base_minor}]`. Le trigger serveur vérifie
  que la somme des `base_minor` est **exactement** le total, que chaque personne (et le payeur) est
  membre du voyage, sans doublon ni fraction d'unité.
- **Journées** : id déterministe (UUID v5 de `trip_id` + date) pour que deux créations hors ligne de la
  même journée aboutissent au même enregistrement (fusion, pas de doublon).
- **Catégories** : texte libre borné pour lieux/activités/carnet (personnalisables dans les réglages du
  voyage) ; listes fermées (`check`) là où un calcul en dépend (dépenses, types de transport, documents).
- **Temps de trajet** : `travel_minutes_estimate` est une saisie humaine, explicitement libellée
  « estimation » dans l'UI ; l'application ne calcule ni n'invente aucun temps de trajet.

### Sécurité (RLS)

| Table | Lecture | Écriture |
|---|---|---|
| `profiles` | soi + membres d'un groupe commun | soi |
| `travel_groups`, `group_members` | membres | création/ajout via RPC uniquement ; quitter = soi |
| `group_invitations` | membres | RPC `create_invitation` (tout membre), `accept_invitation` (email vérifié) |
| `trips` | membres du groupe | membres du groupe |
| données du voyage | membres du voyage | membres du voyage (**tous égaux**), pas de DELETE physique |
| `personal_expenses` | membres du voyage | **propriétaire uniquement** |
| `activity_log` | membres du voyage | trigger serveur uniquement |
| `storage` `trip-files` | membres du voyage (préfixe `{trip_id}/`) | idem |
| `storage` `avatars` | soi + co-membres | soi |

Les invitations stockent uniquement le **hash SHA-256** du jeton ; le jeton n'est accepté que par le
compte dont l'email correspond, et expire après 14 jours.

**Gestion technique « propriétaire du service »** : elle se fait hors de l'application, par le tableau
de bord Supabase (clé `service_role`, jamais côté client) : suppression de compte, restauration, export SQL.
Aucun voyageur n'a de privilège supplémentaire.

---

## 3. Services externes

| Besoin | Service retenu | Clé ? | Pourquoi / alternative |
|---|---|---|---|
| Base, auth, fichiers | **Supabase** | oui (URL + clé anon publique ; `service_role` côté serveur) | demandé ; RLS + Storage privé |
| Hébergement web | **Vercel** (Hobby) | non | natif Next.js ; alternative : Netlify, Cloudflare Pages |
| Fond de carte | **PMTiles auto-hébergés** (extraits OSM de la build Protomaps) sur **Cloudflare R2** | non | seul moyen propre et conforme de télécharger des zones hors ligne. Les serveurs `tile.openstreetmap.org` l'interdisent ; les fournisseurs commerciaux (MapTiler…) restreignent le cache hors ligne |
| Recherche de lieux | **Nominatim** (OSM) | non | gratuit, 1 req/s max, pas d'autocomplétion → recherche sur validation. Les adresses japonaises sont mal couvertes : saisie manuelle des coordonnées / collage d'un lien Google Maps en secours |
| Itinéraires | **Liens externes** Google Maps / Apple Maps | non | pas d'API de calcul d'itinéraire : on n'invente pas de temps de trajet |
| Taux EUR/JPY | **Frankfurter** (données BCE) | non | gratuit, sans clé. **Taux de référence quotidien** (jours ouvrés), affiché avec sa date : jamais présenté comme « temps réel ». Taux manuel possible |
| Emails (auth, invitations) | SMTP Supabase intégré, puis SMTP perso (Resend, Brevo…) | oui (serveur) | le SMTP par défaut de Supabase est limité à quelques emails/heure : suffisant à 4, mais un SMTP dédié est conseillé |
| Réservations (Booking, Airbnb…) | **Aucune intégration** | — | pas d'API officielle ouverte : liens externes + import PDF/captures |

## 4. Coûts estimés (à vérifier au moment de souscrire, les offres évoluent)

| Service | Gratuit | Limite à surveiller | Payant si besoin |
|---|---|---|---|
| Supabase Free | 0 € | 500 Mo base, **1 Go fichiers**, 5 Go de transfert/mois, **pause après 7 jours d'inactivité**, pas de sauvegarde automatique | Pro ≈ 25 $/mois (sauvegardes quotidiennes, pas de pause) |
| Vercel Hobby | 0 € | usage non commercial | Pro 20 $/mois — inutile ici |
| Cloudflare R2 | 0 € jusqu'à 10 Go stockés, sortie gratuite | extraits des 6 villes : estimation 0,3 à 1 Go | ≈ 0,015 $/Go/mois au-delà |
| Nominatim, Frankfurter | 0 € | politique d'usage raisonnable | — |
| Nom de domaine | optionnel | — | ≈ 10–15 €/an |

**Recommandation** : rester en gratuit pendant la préparation, passer Supabase en **Pro pour février–mars
2027** (≈ 50 $ au total) pour supprimer le risque de pause et bénéficier des sauvegardes. L'export
de données intégré à l'application reste la sauvegarde de dernier recours. Les photos sont compressées
côté client (≈ 2048 px, ≈ 300–500 Ko) pour tenir dans 1 Go.

---

## 5. Stratégie offline-first

### Stockage local (Dexie / IndexedDB)

- Une table locale par table synchronisée, avec les mêmes colonnes + `_base` (dernière version serveur
  connue, nécessaire à la fusion) + `_dirty`.
- `outbox` : mutations `{mutation_id, table, op, id, base_version, data, created_at, attempts}`,
  rejouées **dans l'ordre**.
- `files` : blobs des documents explicitement téléchargés + sha256 + date. L'indicateur
  « disponible hors ligne » est calculé à partir de **la présence effective du blob**, jamais d'un drapeau
  déclaratif.
- `tiles` : extraits PMTiles par destination, lus localement par un protocole MapLibre personnalisé.
- `meta` : curseur de synchro par voyage, dernière synchro réussie, dernier taux de change connu.
- `navigator.storage.persist()` est demandé pour limiter l'éviction.

### Cycle de synchronisation

1. **Push** : l'outbox est envoyée par lots à `sync_push`. Chaque mutation a un `mutation_id` ; le
   serveur mémorise les mutations appliquées → **rejouer un lot n'applique rien deux fois** (testé).
2. **Pull** : `sync_pull(trip_id, cursor)` renvoie toutes les lignes (tombstones incluses) modifiées
   depuis le curseur + le nouveau curseur. Le curseur est le `xmin` du snapshot PostgreSQL : contrairement
   à un timestamp, il ne perd aucune écriture concurrente encore non validée au moment du pull.
3. **Fusion** : une ligne locale non modifiée est remplacée. Une ligne localement modifiée fait l'objet
   d'une fusion à 3 voies (base / locale / serveur) **champ par champ**.
4. **Fichiers** : envoi via URL signée d'upload ; téléchargement à la demande ou automatique selon
   préférence (« billets et QR codes du voyage » par défaut), via URL signée temporaire.

### Conflits

- Détection : verrouillage optimiste (`version`). Le serveur refuse toute modification basée sur une
  version périmée (code `JT409`) et renvoie la ligne serveur. **Aucun écrasement silencieux** (testé).
- Résolution automatique uniquement si les champs modifiés de part et d'autre sont **disjoints**
  (ex. Alice change l'heure, Bruno la note) : la fusion est renvoyée avec la nouvelle version de base.
- Sinon : le conflit est stocké localement et l'écran « Conflits » présente, champ par champ, « ma
  version » / « version de Bruno (modifiée à 14:02) » ; l'utilisateur choisit, puis une nouvelle mutation
  est envoyée.
- Suppression contre modification : présentée comme conflit (restaurer ou confirmer la suppression).
- Dépenses : id client + `mutation_id` → pas de doublon même en cas de renvoi multiple (testé).

### PWA

- Service Worker **écrit à la main** (`public/sw.js`), recette officielle Next 16 — leçon de One for All :
  `next-pwa` et ses dérivés dépendent de Webpack, incompatible avec Turbopack (défaut en v16).
  Précache de la coquille et des pages (liste générée au build), polices, glyphes et sprites de la carte ;
  *cache-first* pour `/_next/static`, *stale-while-revalidate* pour les autres assets ; jamais de cache
  pour `/api/*`, l'auth et les appels Supabase (les données passent par IndexedDB).
- Mise à jour : nouvelle version détectée → bandeau « Nouvelle version disponible — Recharger » ;
  jamais d'activation forcée pendant une saisie.
- Manifest : nom modifiable, icônes (dont `maskable`), écran de lancement, `display: standalone`,
  couleurs de thème ; balises `apple-touch-icon` et écrans de démarrage iOS.

---

## 6. Plan de développement

| Phase | Contenu | Critère de fin (testé) |
|---|---|---|
| **1. Analyse** ✅ | inspection, architecture, schéma SQL + RLS + RPC de synchro, tests SQL | migration appliquée, 52 assertions SQL vertes |
| **2. Fondations** | dépendances, client Supabase, auth (inscription, connexion, déconnexion, mot de passe oublié), profil (pseudo, couleur, avatar), création de groupe + voyage, invitations, design system (sombre/clair), navigation mobile, gestion d'erreurs, couche Dexie + moteur de synchro (base nécessaire à toutes les sections) | 4 comptes réels sur un projet Supabase de test, même voyage visible sur 2 navigateurs, build OK |
| **3a. Planning** | jours du voyage, timeline + vue calendrier, activités avec/sans horaire, glisser-déposer, idées non planifiées, journée libre, fait/non fait | E2E création/modification/déplacement + synchro |
| **3b. Carte** | MapLibre + PMTiles en ligne, catégories/icônes, ajout/déplacement de points, recherche Nominatim, filtre par jour, liens itinéraire, lien planning ↔ carte | E2E association activité ↔ lieu |
| **3c. Transports & documents** | fiches transport, import PDF/image/capture, lien, QR/code-barres (saisie, scan d'image), plein écran, association voyageurs/journée | E2E billet PDF, affichage QR |
| **3d. Hébergements** | fiches, nuits calculées, documents, carte, rattachement aux journées | E2E |
| **3e. Carnet** | catégories, priorités, photos, conversion en activité sans ressaisie | E2E conversion |
| **3f. Dashboard** | J-x, progression, prochains éléments, billets rapides, budget résumé, activité récente, favoris | aucun contenu fictif lorsque vide |
| **4. Budget** | pot commun (4 modes de répartition), soldes, remboursements optimisés, remboursements effectués, dépenses individuelles, convertisseur | tests unitaires exhaustifs (arrondis, JPY sans décimale, cas limites) |
| **5. Hors ligne avancé** | téléchargement des documents, cartes hors ligne par ville, écran de conflits, indicateurs, persistance | E2E en mode avion simulé (Playwright `offline`) |
| **6. Finalisation** | export JSON/CSV, duplication de voyage, accessibilité, audit sécurité, Lighthouse PWA, documentation de déploiement | checklist complète |

Ordre justifié : le moteur de synchronisation est développé dès la phase 2 car toutes les sections en
dépendent ; le développer après coup obligerait à réécrire chaque écran.

---

## 7. Risques et limitations

| Risque | Impact | Mesure |
|---|---|---|
| **iOS / Safari** : pas de Background Sync, Service Worker suspendu en arrière-plan | la synchro ne se fait que lorsque l'app est ouverte | synchro à l'ouverture/au premier plan, indicateur « modifications en attente » visible |
| **iOS : éviction du stockage** (sites non installés inactifs 7 jours) | perte des billets hors ligne | installer la PWA sur l'écran d'accueil (exemptée), `storage.persist()`, vérification de présence du blob avant d'afficher « disponible hors ligne », bouton « tout re-télécharger » |
| Pause du projet Supabase Free après 7 jours sans activité | synchro impossible jusqu'à réactivation manuelle | passer en Pro pendant le voyage ; données locales toujours lisibles |
| Taille des cartes hors ligne (Tokyo dense) | stockage téléphone, temps de téléchargement en Wi-Fi | zoom max ≈ 15 puis sur-zoom, téléchargement ville par ville, taille affichée avant téléchargement |
| Géocodage des adresses japonaises par Nominatim | lieux introuvables | saisie manuelle des coordonnées, clic sur la carte, collage de coordonnées/liens |
| Images HEIC (iPhone) non lisibles hors Safari | aperçu impossible sur Android/PC | conversion en JPEG à l'import côté client |
| PDF multi-pages sur iOS en mode PWA | affichage partiel des PDF natifs | rendu via pdf.js depuis le blob local |
| Sécurité locale : documents d'identité stockés sur l'appareil | exposition si téléphone déverrouillé perdu | téléchargement hors ligne des documents « identité » désactivé par défaut, purge locale à la déconnexion |
| Expiration de session hors ligne | aucune pour la consultation (lecture locale) | le jeton est rafraîchi au retour du réseau ; si la session a été révoquée, l'outbox est conservée jusqu'à reconnexion |
| Horloges d'appareils décalées | ordre des événements | versions et curseurs **serveur** ; aucun arbitrage par l'horloge du téléphone |
| Égalité totale des droits | un membre peut tout modifier/supprimer | suppression logique (restauration possible) + historique des modifications |
| Next.js 16 très récent | APIs modifiées (ex. `proxy.ts`) | lecture de la documentation embarquée `node_modules/next/dist/docs` avant chaque usage |

## 8. Design system (base One for All + identité japonaise)

| Jeton | Sombre (défaut) | Clair | Origine |
|---|---|---|---|
| `--color-bg-base` | `#0a0a0f` | `#f7f4ef` (papier washi) | One for All |
| `--color-bg-card` | `#141418` | `#ffffff` | One for All |
| `--color-bg-elev` | `#1b1b21` | `#efeae2` | One for All |
| `--color-border` | `rgba(255,255,255,.06)` | `rgba(20,20,30,.08)` | One for All |
| `--color-text` / `-dim` | `#e8e8ea` / `#8a8a8f` | `#1a1a22` / `#5c5c66` | One for All |
| `--color-vermillion` (accent principal) | `#e8452c` | `#c8371f` | Japan Trip |
| `--color-sakura` | `#f4a6c0` | `#d9638a` | Japan Trip |
| `--color-night` (bleu nuit) | `#2b3a67` / `#7e93d6` | `#2b3a67` | Japan Trip |
| succès / erreur / alerte | `#5fe0a0` / `#f07052` / `#eab245` | assombris pour le contraste | One for All |

Mise en page héritée de One for All : cartes arrondies 12–16 px, bord subtil, padding 16 px, espacement
10–12 px, contenu décalé de 80 px au-dessus de la barre de navigation inférieure, `safe-area-inset-*`,
`-webkit-tap-highlight-color: transparent`. Adaptation Japan Trip : colonne de 440 px sur mobile, mais
mise en page élargie sur tablette/ordinateur (navigation latérale, deux colonnes), et thème clair.

## 9. Décisions prises (détails secondaires)

- Supabase Realtime non utilisé (consigne : pas de synchro permanente).
- Dépenses individuelles : visibles par tous, **modifiables uniquement par leur propriétaire** (seule
  exception à l'égalité des droits, car ce sont des données personnelles).
- Quitter un groupe : possible pour soi ; retirer un autre membre n'est pas proposé dans l'app (à
  rediscuter si besoin).
- Arrondis du pot commun : méthode du plus fort reste, départage déterministe par identifiant, de sorte
  que les 4 appareils calculent exactement les mêmes centimes.
- Remboursements : minimisation exacte du nombre de virements pour les petits groupes (≤ 12 personnes),
  algorithme glouton au-delà.
- Langue : français uniquement pour l'instant ; textes centralisés pour permettre une traduction.
