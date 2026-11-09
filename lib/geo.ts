/**
 * Coordonnées depuis une saisie libre : « 34.9671, 135.7727 » ou un lien Google Maps
 * (…/@34.9671,135.7727,17z ou ?q=34.9671,135.7727). null si rien d'exploitable.
 */
export function parseCoordinates(input: string): { lat: number; lng: number } | null {
  const s = input.trim();
  if (!s) return null;
  const patterns = [/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/, /[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i,
    /^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/];
  for (const p of patterns) {
    const m = s.match(p);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  }
  return null;
}

export const formatCoordinates = (lat: number | null | undefined, lng: number | null | undefined) =>
  lat != null && lng != null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : "";
