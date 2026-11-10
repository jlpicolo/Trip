"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { getLocalDb } from "@/lib/db/schema";
import { documentsOfTrip, localFileIds } from "@/lib/db/tickets";
import { placesOfTrip } from "@/lib/db/planning";
import { getFileSync } from "@/lib/sync/client";
import { deleteCityMap, downloadCityMap, offlineMapKey, type OfflineMapRecord } from "@/lib/sync/offline-map";
import { bboxAround, bboxOfPoints, unionBbox, type Bbox } from "@/lib/map-tiles";
import { cityArea, sameCity } from "@/lib/japan";
import { concerns, formatBytes } from "@/lib/tickets";
import { formatRelative } from "@/lib/formatters";
import { toMessage } from "@/lib/errors/messages";
import type { Trip } from "@/lib/types/trip";

type AppState = "checking" | "ready" | "pending" | "unsupported" | "dev";

/** État réel de l'application hors ligne : service worker actif ET coquille en cache. */
function useAppOffline(): AppState {
  const [state, setState] = useState<AppState>("checking");
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!("serviceWorker" in navigator) || !("caches" in window)) return setState("unsupported");
      if (process.env.NODE_ENV !== "production") return setState("dev");
      const keys = await caches.keys();
      if (alive) setState(navigator.serviceWorker.controller && keys.some((k) => k.startsWith("jt-shell-")) ? "ready" : "pending");
    })().catch(() => alive && setState("pending"));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

function useStorage() {
  const [info, setInfo] = useState<{ persisted: boolean | null; usage: number | null; quota: number | null }>({ persisted: null, usage: null, quota: null });
  useEffect(() => {
    let alive = true;
    (async () => {
      const persisted = (await navigator.storage?.persisted?.()) ?? null;
      const est = await navigator.storage?.estimate?.();
      if (alive) setInfo({ persisted, usage: est?.usage ?? null, quota: est?.quota ?? null });
    })().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return info;
}

const APP_LABEL: Record<AppState, { tone: "success" | "warning" | "neutral"; text: string }> = {
  checking: { tone: "neutral", text: "Vérification…" },
  ready: { tone: "success", text: "Prête hors ligne" },
  pending: { tone: "warning", text: "Pas encore : ouvrez l'app une fois connecté" },
  unsupported: { tone: "warning", text: "Navigateur non compatible" },
  dev: { tone: "neutral", text: "Désactivé en développement" },
};

export function OfflineSection({ trip, userId }: { trip: Trip; userId: string }) {
  const toast = useToast();
  const app = useAppOffline();
  const storage = useStorage();
  const db = getLocalDb();
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ city: string; done: number; total: number } | null>(null);

  const data = useLiveQuery(async () => {
    const [docs, places] = await Promise.all([documentsOfTrip(db, trip.id), placesOfTrip(db, trip.id)]);
    const files = docs.filter((d) => d.kind === "file" && concerns(d, userId));
    const local = await localFileIds(db, files.map((d) => d.id));
    const maps = new Map<string, OfflineMapRecord>();
    for (const d of trip.destinations) {
      const r = await db.getMeta<OfflineMapRecord>(offlineMapKey(trip.id, d.name));
      if (r) maps.set(d.name, r);
    }
    return { files, local, maps, places: [...places.values()] };
  }, [trip.id, userId, trip.destinations]);

  if (!data) return null;

  const areaOf = (city: string): Bbox | null => {
    const a = cityArea(city);
    const pts = data.places.filter((p) => sameCity(p.city, city) && p.lat != null && p.lng != null).map((p) => ({ lat: p.lat!, lng: p.lng! }));
    return unionBbox(a ? bboxAround(a.lat, a.lng, a.km) : null, bboxOfPoints(pts));
  };

  async function downloadAll() {
    setBusy("files");
    try {
      // Téléchargement explicite : pièces d'identité comprises (elles ne le sont pas automatiquement).
      let n = 0;
      for (const d of data!.files) {
        if (data!.local.has(d.id)) continue;
        await getFileSync().download(d);
        n++;
      }
      toast(n ? `${n} fichier${n > 1 ? "s" : ""} téléchargé${n > 1 ? "s" : ""}.` : "Tout est déjà sur l'appareil.");
    } catch (e) {
      toast(toMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function downloadMap(city: string, bbox: Bbox) {
    if (!navigator.onLine) return toast("Connexion nécessaire pour télécharger une carte.", "error");
    setBusy(city);
    setProgress({ city, done: 0, total: 0 });
    try {
      const r = await downloadCityMap(db, trip.id, city, bbox, (done, total) => setProgress({ city, done, total }));
      toast(r.failed ? `Carte de ${city} téléchargée, ${r.failed} fichier(s) manquant(s) : relancez pour compléter.` : `Carte de ${city} disponible hors ligne.`,
        r.failed ? "error" : undefined);
    } catch (e) {
      toast(toMessage(e), "error");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  const missing = data.files.filter((d) => !data.local.has(d.id)).length;
  return (
    <Card className="flex flex-col gap-4" id="hors-ligne">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">Application</span>
        <Badge tone={APP_LABEL[app].tone}>{APP_LABEL[app].text}</Badge>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>Stockage protégé contre l&apos;effacement</span>
        <Badge tone={storage.persisted ? "success" : "warning"}>{storage.persisted === null ? "Inconnu" : storage.persisted ? "Oui" : "Non (le navigateur peut vider l'espace)"}</Badge>
      </div>
      {storage.usage !== null && (
        <p className="-mt-2 text-xs text-mute">Espace utilisé par l&apos;app : {formatBytes(storage.usage)}{storage.quota ? ` sur ${formatBytes(storage.quota)} disponibles` : ""}.</p>
      )}

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <p className="text-sm">
          Mes fichiers sur l&apos;appareil : <strong>{data.files.length - missing}</strong> / {data.files.length}
        </p>
        {data.files.length > 0 && (
          <Button variant="subtle" icon="download" onClick={downloadAll} loading={busy === "files"} disabled={missing === 0 || !!busy}>
            {missing === 0 ? "Tous mes fichiers sont sur l'appareil" : `Tout télécharger (${missing})`}
          </Button>
        )}
        <p className="text-xs text-mute">Billets et confirmations se téléchargent seuls ; les pièces d&apos;identité seulement ici ou à la demande.</p>
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <p className="text-sm">Cartes hors ligne</p>
        <ul className="flex flex-col gap-2">
          {trip.destinations.map((d) => {
            const bbox = areaOf(d.name);
            const rec = data.maps.get(d.name);
            const running = progress?.city === d.name;
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-elev px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{d.name}</span>
                  <span className="block text-xs text-mute">
                    {running ? `Téléchargement… ${progress.done}/${progress.total || "?"}`
                      : rec ? `${formatBytes(rec.bytes)} · ${formatRelative(rec.downloadedAt)}${rec.failed ? ` · ${rec.failed} manquant(s)` : ""}`
                      : bbox ? "Non téléchargée" : "Zone inconnue : ajoutez un lieu de cette ville sur la carte"}
                  </span>
                </span>
                {bbox && (
                  <Button variant={rec ? "ghost" : "subtle"} onClick={() => downloadMap(d.name, bbox)} loading={running} disabled={!!busy && !running}
                    aria-label={`${rec ? "Mettre à jour" : "Télécharger"} la carte de ${d.name}`}>
                    {rec ? "Mettre à jour" : "Télécharger"}
                  </Button>
                )}
                {rec && !running && (
                  <Button variant="ghost" icon="trash" aria-label={`Supprimer la carte de ${d.name}`} disabled={!!busy}
                    onClick={async () => { await deleteCityMap(db, trip.id, d.name); toast(`Carte de ${d.name} retirée de l'appareil.`); }} />
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-mute">À faire en Wi-Fi. Fond de carte OpenStreetMap (OpenFreeMap), noms japonais dessinés par le téléphone.</p>
      </div>
    </Card>
  );
}
