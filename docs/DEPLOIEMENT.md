# Déploiement et exploitation

## Production

| Élément | Valeur |
|---|---|
| Site | https://trip-teal-three.vercel.app (Vercel, projet `trip`, déploiement automatique à chaque push sur `main`) |
| Supabase | projet `brbhfakxpozrqdfgywdv` (« Trip », eu-west-3 Paris) |
| Inscription publique | **désactivée** (`disable_signup`) : comptes créés par le propriétaire du service |
| URL du site (Supabase Auth) | `https://trip-teal-three.vercel.app` ; redirections autorisées : ce domaine + `http://localhost:3000` |

## Variables d'environnement Vercel

*Settings › Environment Variables*, pour **Production, Preview et Development** :

| Nom | Valeur | Secrète ? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://brbhfakxpozrqdfgywdv.supabase.co` | non |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | clé `sb_publishable_…` (Supabase › Project Settings › API Keys) | non (protégée par la RLS) |
| `NEXT_PUBLIC_SITE_URL` | `https://trip-teal-three.vercel.app` | non |

Les variables `NEXT_PUBLIC_*` sont **intégrées au moment du build** : après les avoir ajoutées ou modifiées,
il faut **redéployer** (*Deployments › … › Redeploy*).

⚠️ Ne **jamais** ajouter `SUPABASE_SECRET_KEY` dans Vercel : l'application ne l'utilise pas. Elle ne sert
qu'aux scripts du propriétaire, exécutés sur son ordinateur.

Vérification : sur le site, la page de connexion doit permettre de se connecter. Si la console du navigateur
affiche « Variable d'environnement manquante », les variables n'étaient pas présentes lors du build.

## Services externes utilisés par le navigateur

Aucune clé n'est nécessaire. Ce sont les seuls domaines autorisés par la politique de sécurité du contenu
(`Content-Security-Policy`, dans `next.config.ts`) : **ajouter un service externe = l'ajouter aussi à `connect-src`**.

- Supabase : l'URL de `NEXT_PUBLIC_SUPABASE_URL` (base, authentification, fichiers).
- Tuiles de carte : `tiles.openfreemap.org` (en ligne et cartes hors ligne téléchargées ville par ville).
- Recherche de lieux : `nominatim.openstreetmap.org` (1 requête/seconde).
- Taux de change : `api.frankfurter.dev` (taux de référence BCE, une fois par jour au plus).

## Mises à jour de l'application

Chaque push sur `main` déclenche un déploiement Vercel. Le build génère `public/sw.js` (service worker)
avec le numéro du commit : les téléphones détectent la nouvelle version et affichent « Nouvelle version
disponible — Recharger ». Vérifier la version en ligne :

```bash
curl -s https://trip-teal-three.vercel.app/sw.js | grep VERSION
```

Migrations de base : `npm run db:push:remote` (voir plus bas) **avant** de pousser un code qui en dépend.

## Avant le voyage (février–mars 2027)

1. **Supabase en Pro** pour février–mars : pas de mise en pause après 7 jours sans activité, sauvegardes
   quotidiennes. En gratuit, ouvrir l'app au moins une fois par semaine pendant la préparation.
2. Sur chaque téléphone (Android, Chrome) : installer l'app (⋮ › « Installer l'application »), puis
   *Paramètres › Hors ligne* : vérifier « Prête hors ligne », « Tout télécharger » et télécharger la carte de
   chaque ville, en Wi-Fi.
3. *Paramètres › Données et voyages* : exporter le voyage (JSON) et le pot commun (CSV) comme sauvegarde.
4. Test en mode avion : rouvrir l'app, afficher un billet, la carte d'une ville.

## Sécurité (audit de novembre 2026)

| Point | État |
|---|---|
| Droits d'accès (RLS, stockage privé, dépenses personnelles) | 53 assertions SQL vertes sur le projet réel (`npm run test:db:remote`) |
| Clé secrète | absente des fichiers servis au navigateur (vérifié dans le build) ; jamais dans Vercel |
| Dépendances livrées | `npm audit --omit=dev` : 0 vulnérabilité (alerte modérée sur un outil de lint uniquement) |
| En-têtes | CSP limitée aux services ci-dessus, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` |
| Données sur l'appareil | effacées à la déconnexion ; pièces d'identité jamais téléchargées automatiquement |
| Exports CSV | formules neutralisées (pas d'exécution à l'ouverture dans un tableur) |

⚠️ Clés à **régénérer** (elles ont circulé dans une conversation) : clé secrète `sb_secret_…`
(*Project Settings › API Keys*) puis mettre à jour `.env.local` ; jeton `sbp_…` (*Account › Access Tokens*).

## Gestion des comptes (propriétaire du service)

Les voyageurs se connectent avec un **nom d'utilisateur** et un mot de passe, **sans email**.
Supabase exigeant une adresse, une adresse interne est dérivée du nom (`chloe` → `chloe@japan-trip.invalid`,
domaine réservé qui ne peut recevoir aucun courrier) ; elle n'apparaît jamais dans l'application.

Pas d'administrateur dans l'application : la gestion des comptes se fait depuis un ordinateur avec
`.env.local` contenant `NEXT_PUBLIC_SUPABASE_URL` et `SUPABASE_SECRET_KEY`.

```bash
npm run travelers -- list
npm run travelers -- create Thomas
npm run travelers -- create Chloé --group <id-du-groupe>        # nom d'utilisateur : chloe
npm run travelers -- create jl --affiche "Jean-Luc"             # nom affiché différent
npm run travelers -- password thomas
npm run travelers -- add-to-group thomas <id-du-groupe>
npm run travelers -- delete thomas
```

Noms d'utilisateur : 2 à 32 caractères ; majuscules et accents sont convertis (« Chloé » → `chloe`), la
casse est ignorée à la connexion.

- Sans `--password`, un mot de passe aléatoire (ex. `Pu4C-TsL4-Ay3Z`) est généré et affiché **une seule fois**.
- `list` affiche les groupes et leur identifiant (nécessaire pour `--group` / `add-to-group`).
- Chaque voyageur peut ensuite changer son mot de passe dans *Paramètres › Compte*.
- Mot de passe oublié : `npm run travelers -- password <nom>` puis transmettre le nouveau.
- Ajouter quelqu'un à un groupe peut aussi se faire depuis l'app (*Paramètres › Voyageurs*, lien
  d'invitation à partager) si son compte existe déjà.

### Mise en route du premier voyage

1. `npm run travelers -- create <votre-prénom>`
2. Se connecter sur le site : l'écran « Bienvenue » propose de créer le voyage (pré-rempli Japon 2027).
3. `npm run travelers -- list` pour obtenir l'identifiant du groupe créé.
4. Pour chacun des 3 autres : `npm run travelers -- create <prénom> --group <id>`, puis transmettre
   nom d'utilisateur + mot de passe.

## Base de données

```bash
SUPABASE_PROJECT_REF=brbhfakxpozrqdfgywdv SUPABASE_ACCESS_TOKEN=sbp_... npm run db:push:remote
SUPABASE_PROJECT_REF=brbhfakxpozrqdfgywdv SUPABASE_ACCESS_TOKEN=sbp_... npm run test:db:remote
```

Le jeton `sbp_…` se crée dans Supabase › *Account preferences › Access Tokens*.
