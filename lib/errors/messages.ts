import { NetworkError } from "@/lib/sync/remote";

const AUTH: Record<string, string> = {
  invalid_credentials: "Email ou mot de passe incorrect.",
  email_not_confirmed: "Adresse email non confirmée : ouvrez le lien reçu par email.",
  user_already_exists: "Un compte existe déjà avec cet email.",
  weak_password: "Mot de passe trop faible (10 caractères minimum).",
  over_email_send_rate_limit: "Trop d'emails envoyés récemment. Réessayez dans une heure.",
  over_request_rate_limit: "Trop de tentatives. Patientez quelques minutes.",
  same_password: "Le nouveau mot de passe doit être différent de l'ancien.",
  session_not_found: "Session expirée : reconnectez-vous.",
};

const DB: Record<string, string> = {
  invitation_invalid: "Lien d'invitation invalide ou expiré.",
  invitation_used: "Ce lien d'invitation a déjà été utilisé par un autre compte.",
  invitation_email_mismatch: "Ce lien d'invitation est destiné à une autre adresse email.",
  forbidden: "Accès refusé : vous n'êtes pas membre de ce voyage.",
  not_authenticated: "Vous devez être connecté.",
};

/** Message compréhensible en français pour toute erreur (auth, base, réseau). */
export function toMessage(error: unknown): string {
  if (error instanceof NetworkError) return "Pas de connexion internet. Réessayez une fois en ligne.";
  if (error && typeof error === "object") {
    const e = error as { code?: string; message?: string; name?: string };
    if (e.code && AUTH[e.code]) return AUTH[e.code];
    for (const [k, v] of Object.entries(DB)) if (e.message?.includes(k)) return v;
    if (e.name === "AuthRetryableFetchError" || /fetch|network|Load failed/i.test(e.message ?? ""))
      return "Pas de connexion internet. Réessayez une fois en ligne.";
    if (e.message) return e.message;
  }
  return "Une erreur inattendue est survenue.";
}
