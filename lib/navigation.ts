/** N'accepte qu'un chemin interne (évite les redirections ouvertes vers un autre site). */
export function safeNext(next: string | null | undefined, fallback = "/accueil"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
