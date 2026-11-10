import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/connexion", "/inscription", "/mot-de-passe-oublie", "/nouveau-mot-de-passe", "/auth", "/invitation"];

/**
 * Redirection d'ergonomie uniquement (aucune donnée n'est servie par le serveur :
 * la sécurité repose sur la RLS). Ne fait aucun appel réseau, pour rester instantané.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
  if (hasSession) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/connexion";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/|api/|favicon.ico|icons/|maplibre/|manifest.webmanifest|sw.js|robots.txt).*)"],
};
