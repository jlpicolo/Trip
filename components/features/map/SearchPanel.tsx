"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { searchPlaces, type GeocodeResult } from "@/lib/geocoding";
import { placeMeta } from "@/lib/places";
import { toMessage } from "@/lib/errors/messages";

export function SearchPanel({ onPreview, onAdd }: {
  onPreview: (r: GeocodeResult | null) => void;
  onAdd: (r: GeocodeResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const abort = useRef<AbortController | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!navigator.onLine) return setError("La recherche nécessite une connexion. Vous pouvez saisir les coordonnées à la main.");
    abort.current?.abort();
    abort.current = new AbortController();
    setLoading(true);
    setError(null);
    try {
      setResults(await searchPlaces(query, { countryCodes: "jp", signal: abort.current.signal }));
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError(toMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={search} role="search" className="flex gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un lieu au Japon"
          aria-label="Rechercher un lieu" enterKeyHint="search"
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-elev px-3 text-base placeholder:text-mute focus:border-sakura focus:outline-none" />
        <Button type="submit" variant="subtle" icon="search" loading={loading} disabled={query.trim().length < 2} aria-label="Lancer la recherche">
          <span className="sr-only sm:not-sr-only">Rechercher</span>
        </Button>
      </form>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      {results && (
        <div className="rounded-2xl border border-line bg-card">
          {results.length === 0 ? (
            <p className="p-3 text-sm text-dim">Aucun résultat. Essayez un autre nom, ou ajoutez le lieu à la main avec ses coordonnées.</p>
          ) : (
            <ul className="divide-y divide-line" aria-label="Résultats de recherche">
              {results.map((r) => (
                <li key={r.sourceRef} className="flex items-center gap-2 p-2">
                  <button onClick={() => onPreview(r)} className="min-w-0 flex-1 rounded-lg p-1 text-left hover:bg-elev" aria-label={`Voir « ${r.name} » sur la carte`}>
                    <p className="truncate text-sm font-semibold">{r.name}</p>
                    <p className="truncate text-xs text-dim">{placeMeta(r.category).label} · {r.address}</p>
                  </button>
                  <Button variant="subtle" icon="plus" onClick={() => onAdd(r)} aria-label={`Ajouter « ${r.name} »`}>Ajouter</Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between border-t border-line px-3 py-2 text-xs text-mute">
            <span>Recherche : © contributeurs OpenStreetMap</span>
            <button onClick={() => { setResults(null); onPreview(null); }} className="flex min-h-9 items-center gap-1 font-semibold text-dim">
              <Icon name="close" size={14} /> Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
