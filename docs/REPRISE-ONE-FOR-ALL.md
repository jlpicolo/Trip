# Reprise des spécifications de One for All

Source : `jlpicolo/one-for-all` (`PROJET.md`, `ARCHITECTURE.md`, `AGENTS.md`), lus le 9 novembre 2026.
Règle convenue : seules les **spécifications** sont reprises, pas le code. En cas de conflit avec le
cahier des charges de Japan Trip, c'est le choix le plus adapté à Japan Trip qui l'emporte, et le
conflit est signalé ci-dessous.

## Repris tel quel

| Spécification One for All | Où dans Japan Trip |
|---|---|
| Next.js 16 : `proxy.ts`, `cookies()` async, `next.config.ts` ESM, Tailwind 4 `@theme`, `eslint` direct | `AGENTS.md` § Pièges |
| Code à la racine du dépôt (pas de `src/`) | arborescence |
| PWA sans plugin : manifest + `sw.js` écrit à la main + enregistrement client idempotent | remplace Serwist prévu initialement |
| `sw.js` servi en `no-cache`, en-têtes `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` | `next.config.ts` (fait) |
| Palette sombre `#0a0a0f` / cartes `#141418` / bord `rgba(255,255,255,.06)` / textes | design system |
| Cartes arrondies 12–16 px, padding 16 px, espacement 10–12 px, 80 px sous la barre du bas, safe areas, pas de surbrillance au toucher | design system |
| Couleurs succès / erreur / alerte (`#5fe0a0`, `#f07052`, `#eab245`) | design system |
| Composants minimaux : Card, Button (primary/ghost/danger), BottomNav, Drawer (bottom sheet), Toast, Badge, BackButton | `components/ui/` |
| Un seul Drawer par page, contrôlé par état | conventions |
| Icônes SVG inline, pas de bibliothèque d'icônes ; animations CSS, pas de Framer Motion | conventions |
| `inputMode="decimal"` + saisie numérique tamponnée (commit au blur) | formulaires (montants) |
| Graphiques en Canvas 2D sans bibliothèque, avec gestion du `devicePixelRatio` | budget |
| Types partagés dans `lib/types/`, accès données via `lib/db/<domaine>.ts` uniquement | conventions |
| Texte 100 % français ; commentaires = le pourquoi uniquement | conventions |
| `AGENTS.md` + `ARCHITECTURE.md` mis à jour avec le code, phase par phase | méthode |
| Aucune donnée sensible dans la console / les logs | sécurité |

## Conflits — choix retenu pour Japan Trip

| # | One for All | Japan Trip (retenu) | Raison |
|---|---|---|---|
| 1 | Mot de passe unique côté serveur, JWT maison (`jose`) | **Supabase Auth, un compte par voyageur** | 4 comptes individuels, auteur de chaque modification, invitations, réinitialisation du mot de passe |
| 2 | Turso, une ligne JSON par module | **Postgres relationnel + RLS** | multi-utilisateurs, conflits ligne par ligne, isolation entre groupes ; une colonne JSON unique ferait écraser les modifications des autres |
| 3 | « Toutes les données en DB, pas de stockage local », pages *network-first*, mise à jour optimiste puis **rollback** en cas d'erreur | **Offline-first : IndexedDB + file d'attente** ; en cas d'échec réseau la modification reste en attente (pas de rollback) | utilisation au Japon sans réseau ; un rollback ferait perdre la saisie hors ligne |
| 4 | Identifiants `uid()` = `'x' + Date.now()…` | **UUID** (`crypto.randomUUID()`, UUID v5 pour les journées) | type `uuid` Postgres, unicité garantie entre 4 appareils hors ligne |
| 5 | Photos en base64 dans le JSON | **Supabase Storage privé** + cache local des fichiers | billets PDF jusqu'à 25 Mo, URLs signées, RLS sur les fichiers |
| 6 | Mode sombre strict | **Sombre par défaut + thème clair facultatif** | exigé par le cahier des charges |
| 7 | Largeur max. 440 px partout | **440 px sur mobile, mise en page élargie sur tablette/ordinateur** | « également agréable sur ordinateur et tablette » |
| 8 | `user-scalable=no` dans le viewport | **Zoom autorisé** | accessibilité (et lisibilité des billets/QR codes) |
| 9 | Accents de couleur par module (vert, ambre, bleu…) | **Accents japonais** (vermillon, cerisier, bleu nuit) ; couleurs d'état de One for All conservées | direction artistique demandée |
| 10 | Schéma créé au démarrage (`instrumentation.ts`) | **Migrations SQL versionnées** (`supabase/migrations`) | RLS, triggers et fonctions doivent être versionnés et testés |
| 11 | Repli base en mémoire si pas d'URL en dev | **Pas de repli silencieux** : l'app fonctionne sur IndexedDB et indique « non synchronisé » | consigne « ne pas simuler une synchronisation » |
| 12 | Rate-limit de connexion en mémoire | **Limitations de Supabase Auth** | plus robuste, rien à maintenir |
| 13 | Retour toujours vers `/` (`router.push('/')`) | Retour vers la **section parente** (ex. fiche transport → Transports) | navigation à plusieurs niveaux via la barre du bas |
| 14 | Pas de synchronisation multi-appareils ni de gestion de conflit (limitation acceptée) | **Synchronisation + conflits obligatoires** | exigence centrale de Japan Trip |

## Non applicable

Modules métier (Diet, Note, Charles, Budget par enveloppes, Physique, Look), couplages inter-modules,
mini-jeu, prompts d'import JSON, chemins Windows des plans Claude.
