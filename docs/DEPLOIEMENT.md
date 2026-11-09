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

## Gestion des comptes (propriétaire du service)

Pas d'administrateur dans l'application : la gestion des comptes se fait depuis un ordinateur avec
`.env.local` contenant `NEXT_PUBLIC_SUPABASE_URL` et `SUPABASE_SECRET_KEY`.

```bash
npm run travelers -- list
npm run travelers -- create thomas@exemple.fr Thomas
npm run travelers -- create chloe@exemple.fr Chloé --group <id-du-groupe>
npm run travelers -- password thomas@exemple.fr
npm run travelers -- add-to-group thomas@exemple.fr <id-du-groupe>
npm run travelers -- delete thomas@exemple.fr
```

- Sans `--password`, un mot de passe aléatoire (ex. `Pu4C-TsL4-Ay3Z`) est généré et affiché **une seule fois**.
- `list` affiche les groupes et leur identifiant (nécessaire pour `--group` / `add-to-group`).
- Chaque voyageur peut ensuite changer son mot de passe dans *Paramètres › Compte*.
- Mot de passe oublié : `npm run travelers -- password <email>` puis transmettre le nouveau.
- Ajouter quelqu'un à un groupe peut aussi se faire depuis l'app (*Paramètres › Voyageurs*, lien
  d'invitation) si son compte existe déjà avec la même adresse email.

### Mise en route du premier voyage

1. `npm run travelers -- create <votre-email> <votre-prénom>`
2. Se connecter sur le site : l'écran « Bienvenue » propose de créer le voyage (pré-rempli Japon 2027).
3. `npm run travelers -- list` pour obtenir l'identifiant du groupe créé.
4. Pour chacun des 3 autres : `npm run travelers -- create <email> <prénom> --group <id>`.

## Base de données

```bash
SUPABASE_PROJECT_REF=brbhfakxpozrqdfgywdv SUPABASE_ACCESS_TOKEN=sbp_... npm run db:push:remote
SUPABASE_PROJECT_REF=brbhfakxpozrqdfgywdv SUPABASE_ACCESS_TOKEN=sbp_... npm run test:db:remote
```

Le jeton `sbp_…` se crée dans Supabase › *Account preferences › Access Tokens*.
