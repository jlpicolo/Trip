# Japan Trip — Architecture technique

> Statut : **toutes les phases terminées (1 à 6)**. Document vivant, mis à jour à chaque phase.
> Dernière mise à jour : 11 novembre 2026 (import de lieux, parcours).

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
| Base, auth, fichiers | **Supabase** | oui (URL + clé publishable ; clé secrète uniquement dans les scripts du propriétaire) | demandé ; RLS + Storage privé ; connexion par nom d'utilisateur |
| Hébergement web | **Vercel** (Hobby) | non | natif Next.js ; alternative : Netlify, Cloudflare Pages |
| Fond de carte (en ligne) | **OpenFreeMap** (tuiles vectorielles OpenStreetMap, styles `liberty` clair et `dark`) | non | gratuit, sans clé ni inscription, sans limite de consultation ; attribution OSM affichée |
| Fond de carte (hors ligne) | **OpenFreeMap** mis en cache ville par ville par le service worker | non | aucun hébergement à gérer ; les serveurs `tile.openstreetmap.org` interdisent ce téléchargement, OpenFreeMap n'impose pas de limite |
| Recherche de lieux | **Nominatim** (OSM) | non | gratuit, 1 req/s max, pas d'autocomplétion → recherche sur validation. Les adresses japonaises sont mal couvertes : saisie manuelle des coordonnées / collage d'un lien Google Maps en secours |
| Itinéraires | **Liens externes** Google Maps / Apple Maps | non | pas d'API de calcul d'itinéraire : on n'invente pas de temps de trajet. Les résultats Google ne peuvent pas être affichés sur une carte non Google (conditions d'utilisation) |
| Gares et lignes (mode Parcours) | **Overpass** (`overpass-api.de`, données OpenStreetMap) | non | gratuit, sans clé ; instance publique parfois saturée (nouvel essai, puis message et « Réessayer ») ; résultats gardés sur l'appareil |
| Taux EUR/JPY | **Frankfurter** (`api.frankfurter.dev`, données BCE) | non | gratuit, sans clé. **Taux de référence quotidien** (jours ouvrés), affiché avec sa date : jamais présenté comme « temps réel ». Taux manuel possible |
| Emails | **Aucun** (décision des voyageurs) | — | comptes et mots de passe transmis par l'organisateur ; un SMTP (Brevo, Resend…) pourra être ajouté plus tard |
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
| **1. Analyse** ✅ | inspection, architecture, schéma SQL + RLS + RPC de synchro, tests SQL | migration appliquée sur le projet Supabase réel ; 52 assertions vertes en local **et** sur Supabase |
| **2. Fondations** ✅ | dépendances, client Supabase, auth (inscription, connexion, déconnexion, mot de passe oublié), profil (pseudo, couleur, avatar), création de groupe + voyage, invitations, design system (sombre/clair), navigation mobile, gestion d'erreurs, couche Dexie + moteur de synchro (base nécessaire à toutes les sections) | 4 comptes réels sur un projet Supabase de test, même voyage visible sur 2 navigateurs, build OK |
| **3a. Planning** ✅ | jours du voyage, timeline + vue calendrier, activités avec/sans horaire, glisser-déposer, idées non planifiées, journée libre, fait/non fait | E2E création/modification/déplacement + synchro |
| **3b. Carte** ✅ | MapLibre + tuiles en ligne (OpenFreeMap), catégories/icônes, ajout/déplacement de points, recherche Nominatim, filtre par jour, liens itinéraire, lien planning ↔ carte | E2E association activité ↔ lieu |
| **3c. Transports & documents** ✅ | fiches transport, import PDF/image/capture, lien, QR/code-barres (saisie, scan d'image), plein écran, association voyageurs/journée | E2E billet PDF, affichage QR |
| **3d. Hébergements** ✅ | fiches, nuits calculées, documents, carte, rattachement aux journées | E2E |
| **3e. Carnet** ✅ | catégories, priorités, conversion en activité sans ressaisie (photos abandonnées : choix des voyageurs) | E2E conversion |
| **3f. Dashboard** ✅ | J-x, progression, prochains éléments, billets rapides, budget résumé, activité récente, favoris | aucun contenu fictif lorsque vide |
| **4. Budget** ✅ | pot commun (4 modes de répartition), soldes, remboursements optimisés, remboursements effectués, dépenses individuelles, convertisseur | tests unitaires exhaustifs (arrondis, JPY sans décimale, cas limites) |
| **5. Hors ligne avancé** ✅ | installation (manifest, service worker), réouverture sans réseau, cartes hors ligne par ville, persistance, « tout re-télécharger » — **aucun iPhone dans le groupe : pas de contournements iOS/Safari** | E2E en mode avion simulé (Playwright `offline`) |
| **6. Finalisation** ✅ | export JSON/CSV, duplication de voyage, accessibilité, audit sécurité, Lighthouse PWA, documentation de déploiement | checklist complète |

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

## 8. Design system « Nuit de Tokyo » (revue design de novembre 2026)

Choisi par les voyageurs après deux planches de revue : **typographie de la piste A, couleurs de la piste B**,
thème sombre par défaut, illustration discrète, éléments jamais rétrécis, référence Polarsteps.

| Jeton | Sombre (défaut) | Clair | Usage |
|---|---|---|---|
| `canvas` / `card` / `elev` | `#0b1020` / `#141b31` / `#1c2541` | `#f7f4ef` / `#ffffff` / `#efeae2` | fond de page, cartes, surfaces surélevées |
| `ink` / `dim` / `mute` | `#f3f5ff` / `#a9b1cf` / `#8a93b8` | `#161a2e` / `#555b78` / `#62677f` | textes |
| `coral` (accent principal) | `#ff7a7a` | `#ad2c2b` | actions, « maintenant », journée active |
| `sakura` | `#ffb3c7` | `#9e385d` | liens, ajouts, regroupements |
| `teal` | `#3ee0c3` | `#096a5b` | journées libres, dates, succès |
| `sun` | `#ffd166` | `#7f5700` | J-x, estimations |
| `night` | `#8fa6ff` | `#34479a` | transports, liens secondaires |
| `on-accent` | `#0b1020` | `#ffffff` | texte posé sur le corail (contraste ≥ 4,5 : 1 vérifié par les tests) |

- **Typographie** : titres `h1`/`h2` en **Shippori Mincho B1** (`font-display`), texte en **Zen Kaku Gothic New**
  (`font-sans`), toutes deux embarquées par `next/font` (disponibles hors ligne ; les kanji utilisent les
  polices japonaises du système).
- **Dégradé de parcours** `--route` (corail → sakura → turquoise) et **fond de carte d'embarquement** `--hero`.
- **Illustration discrète** : kanji 旅, soleil levant et pétales sur la carte d'embarquement, tampons de villes
  en kanji (dictionnaire fixe `lib/japan.ts`, jamais deviné).
- **Couleurs de catégorie** : `lib/planning.ts` (activités, via jetons) et `lib/places.ts` (marqueurs : couleurs
  fixes, icône bleu nuit lisible sur toutes).
- **Navigation** : Accueil · Planning · Carte · **Billets** · Plus (Budget dans « Plus »).
- Mise en page : cartes arrondies 14–24 px, zones tactiles ≥ 44 px (40 px pour les icônes secondaires),
  `safe-area-inset-*`, `scroll-padding` sous l'en-tête et au-dessus de la barre du bas.

### Écrans refondus

- **Accueil « carte d'embarquement »** : première → dernière destination, J-x, jours, villes, escales en tampons
  (dates déduites des journées du planning), prochaine étape en grand, historique regroupé
  (`groupActivity` : « Aiko a ajouté 6 activités »).
- **Planning « parcours continu »** : tracé en dégradé reliant toutes les journées, pastille horaire colorée par
  catégorie (poignée de glisser-déposer), journée vide sur une ligne, **bandeau des journées collant** qui suit le
  défilement (`IntersectionObserver`) et permet de sauter à une journée.
- **Carte plein écran** : recherche et filtres flottants (défilement horizontal), marqueurs regroupés à l'écran
  (`lib/map-cluster.ts`), mention OSM repliée, **fiche en deux temps** (aperçu : jours prévus, itinéraire,
  planifier ; « Plus de détails » : le reste).

### Bugs corrigés pendant la refonte

1. **Règles CSS globales hors couche** : elles écrasaient toutes les classes Tailwind (couleur de texte des
   boutons ignorée, sous-titres en mauvaise police). Désormais dans `@layer base`.
2. Débordement des destinations dans Paramètres (largeur minimale du `<fieldset>`).
3. Dates du sélecteur natif au format du téléphone : rappel en toutes lettres sous le champ.
4. Mention OpenStreetMap masquant le bas de la carte ; boutons de zoom sous la recherche ; marqueurs superposés.

## 9. Réalisé en phase 2

| Élément | Fichiers | Vérification |
|---|---|---|
| Base locale IndexedDB | `lib/db/schema.ts` | tests unitaires (fake-indexeddb) |
| Moteur de synchronisation | `lib/sync/engine.ts`, `merge.ts`, `remote.ts`, `client.ts` | 21 tests unitaires + 6 tests d'intégration sur Supabase réel |
| Synchro automatique | `components/app/AutoSync.tsx` | E2E (retour du réseau) |
| Authentification | `app/(auth)/*`, `app/auth/callback/route.ts`, `proxy.ts`, `hooks/useSession.tsx` | E2E (redirection, erreur, connexion, déconnexion) |
| Groupe, voyage, invitations | `app/(app)/bienvenue`, `components/features/settings/TravelersSection.tsx`, `app/(auth)/invitation` | E2E (Alice crée, Bruno rejoint) |
| Profil (pseudo, couleur) | `components/features/settings/ProfileSection.tsx`, migration `member_colors` | test SQL + E2E (couleurs distinctes) |
| Tableau de bord | `app/(app)/accueil`, `lib/db/dashboard.ts`, `lib/activity.ts` | E2E + tests unitaires (phrases, dates) |
| Conflits et refus | `app/(app)/synchronisation` | tests unitaires du moteur |
| Design system, thèmes, navigation | `components/ui/*`, `components/app/*`, `app/globals.css`, `lib/theme.ts` | E2E (mobile 390 px, ordinateur 1280 px, thème clair) |

### Décisions de la phase 2

- **Comptes créés par le propriétaire du service** (choix des voyageurs, novembre 2026) : inscription
  publique désactivée dans Supabase, aucun email envoyé. Création, réinitialisation de mot de passe et
  ajout au groupe via `scripts/travelers.mjs` (clé secrète, ordinateur du propriétaire uniquement).
  Chaque voyageur change son mot de passe dans l'app. Voir [DEPLOIEMENT.md](./DEPLOIEMENT.md).
- **Connexion par nom d'utilisateur, sans email** : `lib/auth/username.ts` dérive une adresse interne
  `<nom>@japan-trip.invalid` (domaine réservé, aucun courrier possible) exigée par Supabase Auth ; elle
  n'est jamais affichée. Même règle dans `scripts/lib/username.mjs` (parité vérifiée par test unitaire).
- **Invitations par lien** (copie / partage natif) conservées pour ajouter un compte existant à un
  groupe depuis l'app (RPC `create_invitation` sous RLS). L'application n'utilise **jamais** la clé secrète.
- **Appareil neuf** : tant que la liste des voyages n'a jamais été chargée depuis le serveur
  (`meta.directoryLoadedAt`), l'app ne propose pas de créer un voyage (évite les doublons) ; hors ligne,
  elle explique qu'une première connexion est nécessaire.
- **Session hors ligne** : si le jeton ne peut pas être rafraîchi faute de réseau, le dernier compte
  connu de l'appareil reste utilisable en lecture/écriture locale ; la synchro attend le réseau.
- **Déconnexion** : pause du moteur, attente de la synchro en cours, **effacement de la base locale**,
  puis fin de session — dans cet ordre, pour qu'aucun billet ne reste sur un appareil déconnecté.
  Un avertissement est affiché s'il reste des modifications non envoyées.
- **Changement de compte sur un appareil** : base locale effacée avant de charger le nouveau compte.
- **Thème** : préférence propre à l'appareil (`localStorage`), appliquée avant le premier rendu.
- **Profil** : modifiable en ligne uniquement (table hors moteur de synchro). Avatar photo non encore
  géré : initiale sur la couleur du voyageur.
- `next.config.ts` : la règle Turbopack `@tailwindcss/turbopack` est **indispensable** (sans elle,
  Tailwind n'est pas compilé). `cacheComponents` et `partialPrefetching` sont conservés.

## 10. Réalisé en phase 3a — Planning

| Élément | Fichiers | Vérification |
|---|---|---|
| Ordre, placement chronologique, regroupement par jour, liens Maps | `lib/planning.ts` | tests unitaires |
| Écritures (créer, modifier, déplacer, réordonner, fait, supprimer, notes du jour) | `lib/db/planning.ts` | tests unitaires avec faux serveur |
| Validation d'une activité (horaires, date dans le voyage, lien, budget, GPS) | `lib/validation/activity.ts`, `lib/money.ts`, `lib/geo.ts` | tests unitaires |
| Chronologie, calendrier, idées, glisser-déposer, formulaires | `app/(app)/planning`, `components/features/planning/*` | E2E `planning.e2e.mjs` (14 étapes, 2 voyageurs, hors ligne) |
| Planification de la synchro | `lib/sync/scheduler.ts`, `components/app/AutoSync.tsx` | tests unitaires (minuteries simulées) + E2E |

### Décisions de la phase 3a

- **Ordre fractionnaire** (`sort_key`) : déplacer une activité ne réécrit qu'une ligne (moins de conflits
  entre voyageurs). Si l'écart entre deux clés est épuisé, la journée est renumérotée (rare, testé).
- **Horaires** : saisir ou modifier une heure range l'activité chronologiquement ; les activités sans
  horaire gardent leur place ; le glisser-déposer reste libre ensuite.
- **Idées** : `date = null`. Déplacer vers les idées retire l'horaire (un horaire exige une date).
- **Lieu d'une activité** : adresse et coordonnées (saisies, ou extraites d'un lien Google Maps) créent ou
  mettent à jour un enregistrement `places` lié — c'est lui qu'utilisera la carte (phase 3b). Retirer le lieu
  d'une activité ne supprime pas le lieu.
- **Temps de trajet** : saisie manuelle uniquement, toujours affichée « ≈ … · estimation ». Itinéraires :
  liens externes Google Maps / Plans d'Apple.
- **Glisser-déposer** : `@dnd-kit` (souris, appui long au toucher pour ne pas gêner le défilement, clavier
  avec annonces lecteur d'écran). Déplacement entre journées par le champ « Journée » du formulaire.
- **Préférence d'affichage** (chronologie / calendrier) : propre à l'appareil (`localStorage`).

### Bugs trouvés par les tests de bout en bout et corrigés

1. **Modifications bloquées** : une saisie faite *pendant* une synchronisation n'était envoyée qu'au
   prochain retour au premier plan. → `createSyncScheduler` reprogramme tant qu'il reste des modifications
   en attente (délai croissant en cas d'erreur serveur, aucune tentative hors ligne).
2. **Appareil neuf** : la première synchro partait avant le choix du voyage actif → planning vide.
   → le voyage actif est déterminé dès que la liste des voyages est connue, et la synchro est relancée
   quand il change.
3. **Tiroir mal positionné** : rendu dans un parent animé (`transform`), il suivait le défilement de la page.
   → rendu via portail dans `<body>` ; les animations d'apparition ne laissent plus de `transform` actif.
4. Débordement horizontal à 390 px (sélecteur de vue) ; symbole « ¥ » au lieu de « JPY ».

## 11. Réalisé en phase 3b — Carte

| Élément | Fichiers | Vérification |
|---|---|---|
| Catégories de lieux, couleurs, icônes, catégorie devinée depuis OSM | `lib/places.ts` | tests unitaires |
| Validation d'un lieu | `lib/validation/place.ts` | tests unitaires |
| Recherche Nominatim (1 req/s, pays JP, erreurs claires) | `lib/geocoding.ts` | tests unitaires (fetch simulé) + E2E réel |
| Écritures : créer, modifier, favori, déplacer, supprimer, ajouter au planning | `lib/db/places.ts` | tests unitaires avec faux serveur |
| Carte MapLibre, marqueurs HTML accessibles, placement, déplacement, aperçu | `components/features/map/TripMap.tsx` | E2E `map.e2e.mjs` (10 étapes) |
| Page Carte : recherche, filtres catégorie/favoris/journée, liste, fiche, formulaire | `app/(app)/carte`, `components/features/map/*` | E2E |
| Lien planning → carte (`/carte?lieu=…`) et carte → planning | `ActivityCard.tsx`, `PlaceDetails.tsx` | E2E |

### Décisions de la phase 3b

- **Marqueurs = boutons HTML** (pas des symboles WebGL) : atteignables au clavier, nommés pour les
  lecteurs d'écran (« Fushimi Inari (Monument), favori »), testables.
- **Worker MapLibre** copié dans `public/maplibre/` au build (`scripts/copy-vendor-assets.mjs`, hooks
  `predev`/`prebuild`) et chargé par `setWorkerUrl` : indépendant du bundler, cachable par le service worker.
  Exclu du `proxy.ts` et du lint.
- **Placement** : bouton « Placer sur la carte » puis appui (pas de création à chaque appui accidentel).
  **Déplacement** : marqueur rendu déplaçable, puis « Valider » / « Annuler ».
- **Lieu sans coordonnées** : accepté (listé, signalé « non affiché sur la carte »), plaçable ensuite.
- **Supprimer un lieu** conserve les activités du planning (elles perdent seulement leur lieu).
- **Hors ligne** : si le style ou les tuiles sont injoignables, un message le dit clairement et la liste
  des lieux (données locales) reste entièrement utilisable. Le téléchargement de zones viendra en phase 5.
- **Recherche** : en ligne uniquement, à la validation (pas d'autocomplétion, conformément à la politique
  Nominatim), limitée au Japon, attribution OSM affichée.

### Bugs trouvés par les tests et corrigés

1. **Lien planning → carte sans effet** si la carte avait déjà été visitée (page conservée par
   `cacheComponents`) : l'état réagit désormais au paramètre `?lieu=`.
2. **Titre de tiroir illisible** : le jeton de couleur `base` entrait en conflit avec la classe de taille
   `text-base`. Renommé `canvas` ; contrôle de contraste ajouté au test.
3. Worker MapLibre redirigé vers `/connexion` par `proxy.ts`.

## 12. Réalisé en phase 3c — Billets (transports & documents)

| Élément | Fichiers | Vérification |
|---|---|---|
| Types, libellés, tri, prochain trajet, noms de fichiers sûrs, formats de codes | `lib/types/tickets.ts`, `lib/tickets.ts` | tests unitaires |
| Validation trajet (dates du voyage ± 1 jour, arrivée cohérente) et document (lien, code, EAN-13, voyageurs) | `lib/validation/transport.ts`, `document.ts` | tests unitaires |
| Écritures locales : trajets, documents lien/code/fichier, suppression | `lib/db/tickets.ts` | tests unitaires avec faux serveur + faux stockage |
| Fichiers : envoi différé, téléchargement vérifié (SHA-256), téléchargement automatique, retrait de l'appareil | `lib/sync/files.ts`, tables Dexie `files` / `uploads` (version 2) | tests unitaires + E2E sur Supabase Storage réel |
| Codes : génération locale (bwip-js), lecture depuis une image (zxing-wasm), plein écran | `lib/codes.ts`, `components/features/tickets/*` | E2E (QR lu depuis une capture, affiché en plein écran) |
| Écran Billets, trajets sur le planning | `app/(app)/billets`, `components/features/tickets/*`, `DaySection.tsx` | E2E `tickets.e2e.mjs` (12 étapes, 2 voyageurs, hors ligne) |

### Décisions de la phase 3c

- **Un seul onglet « Billets »** réunit trajets et documents (`/transports` et `/documents` y redirigent) : sur place, on
  cherche un billet, pas une rubrique. Filtre « Tout le groupe » / « Mes billets ».
- **Fichier d'abord sur l'appareil** : un PDF ou une capture ajouté est conservé dans IndexedDB (consultable tout de
  suite, même hors ligne), mis en file `uploads`, puis envoyé dans le bucket privé `trip-files`
  (`{trip_id}/{document_id}/{nom}`) **avant** l'envoi des fiches, au début de chaque synchro. Un envoi déjà fait mais
  sans réponse (409) est considéré comme réussi. Un refus (format, taille) est conservé et affiché, sans bloquer les fiches.
- **Disponibilité hors ligne = présence du blob** : l'indicateur « Sur l'appareil » / « En ligne uniquement » /
  « En attente d'envoi » ne repose sur aucun drapeau déclaratif. Le fichier téléchargé est vérifié par SHA-256.
- **Téléchargement automatique** après chaque synchro réussie des billets, confirmations et photos qui concernent le
  voyageur ; les **pièces d'identité restent à la demande** (moins de copies sur les téléphones). Un fichier pas encore
  envoyé ne peut pas être retiré de l'appareil (ce serait le perdre).
- **Codes générés sur l'appareil** (bwip-js : QR, Aztec, PDF417, Data Matrix, Code 128, EAN-13, Code 39) : aucun
  réseau ni fichier nécessaire. Lecture depuis une image avec zxing-wasm, module WebAssembly **servi par l'app**
  (`public/zxing/`, copié par `scripts/copy-vendor-assets.mjs`) et non par un CDN, pour fonctionner hors ligne.
- **Plein écran** : fond blanc, code agrandi, API Fullscreen et Wake Lock quand le navigateur les accepte. La
  luminosité de l'écran ne peut pas être forcée depuis le web : non simulée.
- **Voyageurs concernés** : simple classement (« Mes billets »), pas une restriction d'accès — les droits restent égaux.
- **Supprimer un trajet** conserve ses billets (détachés). Supprimer un document est logique (restaurable) ; l'objet
  Storage est conservé.
- **Aperçu PDF** : lecteur intégré du navigateur (`<object>`) + boutons « Ouvrir » / « Enregistrer ». Le rendu pdf.js
  pour les PWA iOS est prévu en phase 5. Les images HEIC non affichables hors Safari sont signalées comme telles.
- Le statut de synchro compte les **fichiers en attente** : un fichier non envoyé n'est jamais présenté comme
  « synchronisé », et la déconnexion avertit avant de le perdre.

### Bugs trouvés par les tests et corrigés

1. Nom de fichier dangereux (`../`) : seul le dernier segment est conservé.
2. Libellé « Lien » ambigu entre le type de document et le champ d'adresse (lecteurs d'écran) : champ renommé
   « Adresse du lien ».

## 13. Réalisé en phase 3d — Hébergements

| Élément | Fichiers | Vérification |
|---|---|---|
| Nuits, nuits couvertes, nuits sans hébergement, chevauchements, événements d'une journée | `lib/stays.ts` | tests unitaires |
| Validation (dates dans le voyage, au moins une nuit, voyageurs, téléphone, email, GPS / lien Maps) | `lib/validation/accommodation.ts` | tests unitaires |
| Écritures : hébergement + lieu « Hôtel » sur la carte, suppression qui conserve documents et lieu | `lib/db/stays.ts` | tests unitaires avec faux serveur |
| Page Hébergements, fiche, confirmations (réutilise les documents de la phase 3c) | `app/(app)/hebergements`, `components/features/stays/*` | E2E `stays.e2e.mjs` (8 étapes, 2 voyageurs) |
| Arrivées, nuits et départs dans les journées du planning | `DaySection.tsx`, `usePlanning.ts` | E2E |

### Décisions de la phase 3d

- **Nuits** : la nuit du jour J est couverte si arrivée ≤ J < départ. Le nombre de nuits est calculé sur l'appareil
  (affichage immédiat, hors ligne) et par le serveur (colonne générée `nights`, jamais envoyée par le client).
- **Contrôle honnête de la couverture** : « N nuits réservées sur M », plages de nuits sans hébergement et nuits
  couvertes par plusieurs hébergements sont **signalées, pas bloquées** (le groupe peut se séparer).
- **Carte** : l'adresse ou les coordonnées d'un hébergement créent/mettent à jour un lieu de catégorie « Hôtel »
  (même principe que les activités). Les retirer détache le lieu sans le supprimer.
- **Adresse en japonais** affichée en grand « à montrer au chauffeur de taxi » ; téléphone et email cliquables.
- **Confirmations** : documents de la phase 3c avec `accommodation_id` (fichier, lien ou code), donc hors ligne
  dans les mêmes conditions ; un lien mène de Billets à l'hébergement et inversement.
- **Planning** : changement d'hôtel affiché dans l'ordre réel (départ puis arrivée), nuits intermédiaires discrètes.

## 14. Réalisé en phase 3e — Carnet

| Élément | Fichiers | Vérification |
|---|---|---|
| Catégories (correspondance activité / lieu), priorités, tri, filtres et recherche sans accents | `lib/journal.ts`, `lib/types/journal.ts` | tests unitaires |
| Validation (titre, lien, GPS / lien Maps) | `lib/validation/journal.ts` | tests unitaires |
| Écritures : entrée + lieu sur la carte, conversion en activité, suppression | `lib/db/journal.ts` | tests unitaires avec faux serveur |
| Page Carnet (filtres catégorie, ville, « à planifier », recherche) et fiche | `app/(app)/carnet`, `components/features/journal/*` | E2E `journal.e2e.mjs` (7 étapes, 2 voyageurs) |

### Décisions de la phase 3e

- **Pas de photos** (décision des voyageurs, novembre 2026) : le stockage Supabase gratuit (1 Go) reste réservé
  aux billets et confirmations. Un lien externe (article, vidéo, fiche Google Maps) remplace l'image.
- **Priorités** : ★★★ incontournable, ★★ envie, ★ si on a le temps ; regroupement par priorité.
- **Conversion sans ressaisie** : « Planifier » crée une activité (journée choisie, ou idée sans date) reprenant
  titre, notes, lien, lieu et une catégorie déduite ; `activities.journal_entry_id` garde l'origine. Une entrée peut
  être planifiée plusieurs fois ; son état « Planifié · dates » est **calculé** depuis les activités, jamais stocké.
- **Supprimer une entrée** conserve les activités déjà planifiées et son lieu sur la carte.

## 15. Réalisé en phase 3f — Accueil

| Élément | Fichiers | Vérification |
|---|---|---|
| Préparation : journées prévues, nuits réservées, incontournables non planifiés | `lib/dashboard.ts` | tests unitaires |
| Prochain trajet (heure du fuseau du voyage) + billet plein écran en un geste, hébergement de ce soir ou suivant, préparation, lieux favoris | `app/(app)/accueil/page.tsx` | E2E `dashboard.e2e.mjs` (4 étapes) |

### Décisions de la phase 3f

- **Ordre des priorités de l'accueil** : prochaine activité, prochain trajet (avec « Afficher le billet » s'il a un code),
  hébergement (« Ce soir » pendant le voyage), préparation, favoris, voyageurs, historique.
- **Préparation calculée, jamais déclarée** : une journée est « prévue » si elle a une activité ou est marquée libre ;
  les nuits viennent des hébergements ; les compteurs sont à 0 sur un voyage vide.
- Ordre de la suite décidé par les voyageurs (novembre 2026) : 3f → 5 → 4 → 6 ; personne n'utilise d'iPhone.

## 16. Réalisé en phase 5 — Installation et hors ligne

| Élément | Fichiers | Vérification |
|---|---|---|
| Manifeste, icônes (dont maskable) générées depuis un SVG | `app/manifest.ts`, `scripts/gen-icons.mjs`, `public/icons/*` | E2E (manifeste lu) |
| Service worker écrit à la main, généré à chaque build (version + pages) | `scripts/sw.template.js`, `scripts/build-sw.mjs` → `public/sw.js` (non versionné) | E2E `offline.e2e.mjs` (5 étapes, build de production) |
| Enregistrement, bandeau « Nouvelle version disponible », stockage persistant | `components/app/ServiceWorker.tsx` | E2E (installation) ; mise à jour vérifiée manuellement seulement |
| Cartes hors ligne par ville (tuiles, styles, sprites, glyphes latins) | `lib/map-tiles.ts`, `lib/sync/offline-map.ts`, `lib/japan.ts` (zones des villes) | tests unitaires + E2E (Nara affichée sans réseau) |
| Section Paramètres « Hors ligne » : état réel, espace utilisé, « Tout télécharger », cartes | `components/features/settings/OfflineSection.tsx` | E2E |
| Indicateur « Hors ligne » dès l'ouverture sans réseau | `hooks/useSync.ts` | E2E |

### Décisions de la phase 5

- **Aucun iPhone dans le groupe** : pas de contournements iOS/Safari (pdf.js, HEIC, écrans de démarrage Apple).
- **Précache à l'installation** : toutes les pages (coquilles statiques sans données, identiques pour tous ; le
  `proxy.ts` les laisse passer avec l'en-tête `x-jt-precache`), puis **parcours des HTML, CSS et JS** pour trouver
  tous les fichiers `/_next/static` (y compris les morceaux chargés à la demande : carte, codes) et les polices.
  Liste construite à l'exécution : aucun fichier généré après le build n'est nécessaire (déploiement Vercel simple).
- **Stratégies** : pages réseau d'abord puis cache ; `/_next/static` cache d'abord ; requêtes RSC jamais en cache
  (en cas d'échec, Next recharge la page, servie par le cache) ; Supabase, `/api`, `/auth` jamais interceptés.
- **Mise à jour** : la nouvelle version attend ; bandeau « Recharger » ; aucun rechargement forcé (y compris à la
  première installation, où le service worker prend la main sans recharger).
- **Cartes hors ligne** : téléchargées à la demande, ville par ville, depuis OpenFreeMap (zooms 0 à 15, zone fixe par
  ville connue élargie aux lieux enregistrés). Les tuiles sont rangées **sous une clé sans version** : OpenFreeMap
  change l'adresse des tuiles chaque semaine et une carte téléchargée doit rester lisible. Les kanji et kana sont
  dessinés par les polices du téléphone (MapLibre), seuls les glyphes latins sont téléchargés. Taille affichée,
  fichiers manquants signalés, suppression sans toucher aux fichiers partagés avec une autre ville.
- **PMTiles auto-hébergés abandonnés** (prévus initialement) : inutiles avec ce cache, et pas d'hébergement à gérer.
- **Tests E2E sur build de production** (`npm run build && npm start`) : le service worker est désactivé en dev.

## 17. Réalisé en phase 4 — Budget

| Élément | Fichiers | Vérification |
|---|---|---|
| Conversion en unités mineures, plus fort reste déterministe | `lib/budget/money.ts` | tests unitaires (JPY sans décimale, 1 centime, flottants) |
| 4 modes de répartition : égal, parts, pourcentages, montants exacts | `lib/budget/split.ts`, migration `20261111000000_expense_percent.sql` | tests unitaires + E2E (contrôle serveur `tg_validate_expense`) |
| Soldes, remboursements en nombre minimal de virements (≤ 12 personnes, glouton au-delà) | `lib/budget/balances.ts` | tests unitaires |
| Taux BCE (Frankfurter), taux manuel partagé, libellé daté, taux figé par dépense | `lib/fx.ts`, `components/features/budget/useBudget.ts` | tests unitaires + E2E (vrai service) |
| Écritures : dépenses, remboursements, dépenses personnelles (propriétaire seul) | `lib/db/budget.ts`, `lib/validation/budget.ts` | tests unitaires avec faux serveur |
| Page Budget (pot commun, mes dépenses, convertisseur), résumé sur l'accueil | `app/(app)/budget`, `components/features/budget/*` | E2E `budget.e2e.mjs` (10 étapes, 3 voyageurs) |

### Décisions de la phase 4

- **Taux figé à la saisie** : chaque dépense garde son taux (« 1 JPY = 0,005638 EUR ») et son montant converti ; les
  soldes ne bougent pas quand le taux du jour change. Le taux est prérempli (taux connu) et modifiable (taux de la carte).
- **Taux affiché avec sa source et sa date** : « Taux de référence BCE du 10 novembre 2026 », « ancien » au-delà de
  4 jours ; jamais « temps réel ». Mise à jour au plus une fois par jour en ligne ; hors ligne, dernier taux connu.
  **Taux manuel** stocké dans les réglages du voyage (`trips.settings.manual_fx_rate`), donc partagé par le groupe.
- **Arrondis** : conversion au plus proche (minimum 1 unité) puis plus fort reste, restes égaux départagés par
  identifiant : les 4 téléphones calculent les mêmes centimes ; le serveur vérifie que la somme est exacte.
- **4ᵉ mode « pourcentages »** ajouté à la base (le schéma initial n'en prévoyait que 3) ; un voyageur décoché ou à
  part nulle ne paie rien.
- **Remboursements** : suggestions calculées, « Marquer payé » enregistre un remboursement (partiel possible,
  annulable) ; montants en devise de base.
- **Dépenses personnelles** : table séparée, jamais dans le pot commun ; seul l'auteur les voit dans « Mes dépenses »
  et peut les modifier (RLS serveur + contrôle local).

### Bugs trouvés par les tests et corrigés

1. Formulaire ouvert avant l'arrivée du taux BCE (première visite) : le taux est désormais rempli dès son arrivée.
2. Voyageurs connus après l'ouverture du formulaire : ils étaient décochés ; inclus par défaut dans une nouvelle dépense.

## 18. Réalisé en phase 6 — Finalisation

| Élément | Fichiers | Vérification |
|---|---|---|
| Export JSON complet et CSV (pot commun, mes dépenses) | `lib/export.ts`, `lib/db/export.ts`, `components/features/settings/DataSection.tsx` | tests unitaires (échappement, formules, BOM, montants) + E2E (fichiers téléchargés) |
| Duplication d'un voyage (planning décalé, lieux et carnet repris), choix du voyage affiché | `lib/db/duplicate.ts`, `DataSection.tsx` | tests unitaires + E2E `dashboard.e2e.mjs` (6 étapes) |
| Accessibilité WCAG 2.1 A/AA : 34 écrans et fenêtres, thèmes sombre et clair | `tests/e2e/a11y.e2e.mjs` (axe-core) | 0 violation |
| Sécurité : CSP, absence de secret côté client, dépendances, RLS sur le projet réel | `next.config.ts`, `supabase/tests/*` | 53 assertions SQL, E2E sans violation CSP |
| Performance : polices japonaises sans préchargement, service worker installé après le chargement | `app/layout.tsx`, `components/app/ServiceWorker.tsx`, `scripts/sw.template.js` | Lighthouse (mobile simulé) |
| Mise en page ordinateur : 2 colonnes (accueil, billets, budget) au-delà de 1200 px | `app/globals.css`, pages concernées | captures 1440 px |
| Documentation de déploiement et d'exploitation | `docs/DEPLOIEMENT.md`, `README.md` | — |

### Mesures Lighthouse (page de connexion, mobile 4G simulé, build de production)

| | Avant | Après |
|---|---|---|
| Performance | 44 | 83 |
| Accessibilité / Bonnes pratiques / SEO | 100 / 96 / 100 | 100 / 100 / 100 |
| Poids total | 8,9 Mo | 556 Ko |
| Affichage du contenu principal (LCP) | 58,5 s | 4,1 s |

Les pages de l'app sont les mêmes coquilles statiques pour tous (données lues sur l'appareil) : la mesure de la page
de connexion vaut pour le chargement de l'app. Lighthouse ne conserve pas la session ; les pages connectées n'ont
pas été mesurées séparément.

### Décisions de la phase 6

- **Contrastes** : jetons ajustés pour 4,5:1 minimum sur tous les fonds, y compris teintés (`coral-soft`…), dans les
  deux thèmes ; couleurs fixes hors jetons retirées (tampons de villes).
- **Polices** : `preload: false` sur les deux polices Google. Pour les polices japonaises, Next préchargeait les
  ~300 tranches Unicode de chaque graisse (607 fichiers, ~20 Mo). Le service worker ne met en cache que les tranches
  latines, repérées dans les `@font-face` (`unicode-range`) ; hors ligne, les kanji utilisent les polices du téléphone.
- **Service worker** enregistré 2 s après le chargement de la page : le précache ne concurrence plus le premier affichage.
- **CSP** : `unsafe-inline` conservé pour les scripts (pages statiques sans nonce) ; `wasm-unsafe-eval` pour le
  lecteur de codes ; zod configuré sans `eval` (`lib/validation/zod-config.ts`) pour ne déclencher aucune violation.
- **Export** : sauvegarde de dernier recours lisible ; les dépenses personnelles des autres et les fichiers ne sont
  pas exportés. CSV au format Excel français (`;`, virgule décimale, BOM UTF-8), formules neutralisées.
- **Duplication** : billets, hébergements et dépenses non repris (propres à chaque voyage) ; taux manuel réinitialisé.

### Bugs trouvés par les tests et corrigés

1. **Plusieurs voyages : retour forcé au premier voyage après un rechargement** (`AppShell`) : pendant un instant, le
   voyage actif était connu mais pas encore sa fiche, et l'app basculait sur le premier voyage. La bascule ne se fait
   plus qu'après vérification dans la base locale.
2. 313 fichiers de polices préchargés sur chaque page (voir « Polices ») ; test SQL qui supposait une base vide.

## 19. Après la phase 6 — Import de lieux et Parcours (novembre 2026)

| Élément | Fichiers | Vérification |
|---|---|---|
| Convertisseur : heure de la dernière vérification du taux BCE (publié une fois par jour ouvré) | `lib/fx.ts` (`checkedLabel`), `Converter.tsx` | tests unitaires |
| Lecture CSV (séparateur détecté) et XLSX (fflate, sans dépendance lourde) | `lib/import/table.ts` | tests unitaires |
| Préparation de l'import : colonnes reconnues par synonymes, catégories, ville déduite, contrôle « au Japon » (colonnes inversées corrigées), précision approximative signalée, doublons à 150 m | `lib/import/places.ts` | tests unitaires |
| Import (lieux + entrées du carnet facultatives) via le moteur de synchro | `lib/db/import.ts`, `components/features/map/ImportPlaces.tsx` | E2E `import.e2e.mjs` |
| Parcours par journée : ordre du planning, hôtel du matin → hôtel du soir, 10 couleurs de jour, trajets entre villes (Billets) | `lib/route-plan.ts`, `TripMap.tsx`, `RoutePanel.tsx`, `/carte?parcours=` | tests unitaires + E2E `route.e2e.mjs` |
| Gares proches et lignes (code, nom, couleur officielle), trajet « sans changement » | `lib/transit.ts`, `components/features/map/useTransit.ts` | tests unitaires + E2E (vrai service, puis hors ligne) |

### Décisions

- **Import : aucune position devinée.** Une ligne sans coordonnées est importée « à placer » ; Nominatim a été
  testé sur les adresses réelles du groupe : 0/19 trouvées par l'adresse, 10/19 par le nom (souvent le mauvais
  quartier). Une précision « approximative » dans le fichier est reprise dans les notes du lieu.
- **Parcours = lignes droites**, libellées « à vol d'oiseau » : aucun chemin ni durée inventés. Au-delà de 1,5 km,
  « Transports conseillés » + lien Google Maps en transports pour le tronçon ; la journée entière s'ouvre à pied
  (Google n'accepte pas d'étapes en mode transports). Le vrai tracé à pied (openrouteservice, clé gratuite) reste
  possible plus tard, côté serveur.
- **Gares et lignes depuis OpenStreetMap (Overpass)**, demandées une seule fois pour toutes les extrémités de
  tronçons longs, puis **gardées dans IndexedDB** (`meta`, clé `transit:lat,lng` arrondie à ~100 m) : consultables
  hors ligne. Les données des tuiles de la carte ont été écartées : les gares n'y figurent qu'à fort zoom.
- **Lignes « officielles » uniquement** : une par code de ligne (C, JY, G…), sans les sens ni les variantes de
  service. « Sans changement » signifie seulement qu'une même ligne dessert les deux gares (3 plus proches de
  chaque côté, marche totale minimale) ; horaires, durée et correspondances restent dans Google Maps.
- **Particularités des données OSM au Japon** : certaines compagnies (Keihan) n'ont qu'une relation d'infrastructure
  (`route=railway`, sans code) rattachée au nœud de la gare et non aux points d'arrêt : elle n'est affichée qu'à
  défaut de ligne codée. Les nœuds d'une même gare (un par compagnie) sont fusionnés par nom à moins de 500 m.
- **Overpass** : instance publique souvent saturée (réponses d'erreur sans en-tête CORS) : trois essais espacés,
  puis message et bouton « Réessayer » uniques en haut du parcours ; nouvel essai automatique au retour du réseau.

### Bugs trouvés par les tests et corrigés

1. **Carte : page en erreur en revenant du planning** (`?lieu=`) : la couche des tracés était ajoutée pendant le
   chargement du style de la carte recréée. Rien n'est ajouté en mode Lieux, et en Parcours on attend que le style soit prêt.
2. Trois boutons « Réessayer » identiques (un par tronçon) : un seul message pour tout le parcours.

## 20. Décisions prises (détails secondaires)

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
