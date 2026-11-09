/**
 * Connexion par nom d'utilisateur. Supabase Auth exige un email : on en dérive un,
 * interne et invisible, sur le domaine réservé `.invalid` (RFC 2606), qui ne peut
 * recevoir aucun courrier. Doit rester identique à scripts/lib/username.mjs.
 */
export const LOGIN_DOMAIN = "japan-trip.invalid";

const PATTERN = /^[a-z0-9][a-z0-9._-]{1,31}$/;

/** « Chloé Martin » → « chloe-martin » ; null si le nom est inutilisable. */
export function normalizeUsername(input: string): string | null {
  const u = input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "-");
  return PATTERN.test(u) ? u : null;
}

export function usernameToEmail(username: string): string | null {
  const u = normalizeUsername(username);
  return u ? `${u}@${LOGIN_DOMAIN}` : null;
}

/** Nom affichable pour un compte (le nom d'utilisateur, jamais l'adresse interne). */
export function emailToUsername(email: string | null | undefined): string {
  if (!email) return "";
  const [local, domain] = email.split("@");
  return domain === LOGIN_DOMAIN ? local : email;
}
