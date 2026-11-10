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

- Tuiles de carte : `tiles.openfreemap.org` (aucune clé).
- Recherche de lieux : `nominatim.openstreetmap.org` (aucune clé, 1 requête/seconde).

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
