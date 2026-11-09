// Copie de lib/auth/username.ts pour les scripts Node (sans compilation TypeScript).
// Un test unitaire vérifie que les deux implémentations donnent le même résultat.
export const LOGIN_DOMAIN = "japan-trip.invalid";
const PATTERN = /^[a-z0-9][a-z0-9._-]{1,31}$/;

export function normalizeUsername(input) {
  const u = input.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-");
  return PATTERN.test(u) ? u : null;
}

export function usernameToEmail(username) {
  const u = normalizeUsername(username);
  return u ? `${u}@${LOGIN_DOMAIN}` : null;
}

export function emailToUsername(email) {
  if (!email) return "";
  const [local, domain] = email.split("@");
  return domain === LOGIN_DOMAIN ? local : email;
}
