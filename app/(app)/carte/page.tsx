"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, SectionTitle } from "@/components/ui/Card";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState, Spinner } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useCurrentTrip } from "@/components/app/TripContext";
import { TripMap, type MapStatus } from "@/components/features/map/TripMap";
import { PlaceForm, initialPlaceForm } from "@/components/features/map/PlaceForm";
import { PlaceDetails } from "@/components/features/map/PlaceDetails";
import { SearchPanel } from "@/components/features/map/SearchPanel";
import { ImportPlaces } from "@/components/features/map/ImportPlaces";
import { RoutePanel } from "@/components/features/map/RoutePanel";
import { staysOfTrip } from "@/lib/db/stays";
import { transportsOfTrip } from "@/lib/db/tickets";
import { buildDayRoutes } from "@/lib/route-plan";
import { useTransit } from "@/components/features/map/useTransit";
import { importPlaces } from "@/lib/db/import";
import { getEngine } from "@/lib/sync/client";
import { getLocalDb } from "@/lib/db/schema";
import { activitiesOfTrip, placesOfTrip } from "@/lib/db/planning";
import { addPlaceToPlanning, deletePlace, movePlace, savePlace, setPlaceFavorite } from "@/lib/db/places";
import { PLACE_CATEGORIES, PLACE_META, placeMeta } from "@/lib/places";
import { formatCoordinates } from "@/lib/geo";
import { formatDayShort, tripDates } from "@/lib/formatters";
import { toMessage } from "@/lib/errors/messages";
import type { GeocodeResult } from "@/lib/geocoding";
import type { PlaceForm as PlaceFormValues } from "@/lib/validation/place";
import type { Place } from "@/lib/types/planning";

type DrawerState = null | { kind: "details"; id: string } | { kind: "form"; id?: string; draft?: Partial<PlaceFormValues> } | { kind: "import" };

function MapPage() {
  const { trip } = useCurrentTrip();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const engine = getEngine();
  const db = getLocalDb();
  const dates = useMemo(() => tripDates(trip.start_date, trip.end_date), [trip.start_date, trip.end_date]);

  const data = useLiveQuery(async () => {
    const [places, activities, stays, transports] = await Promise.all([
      placesOfTrip(db, trip.id), activitiesOfTrip(db, trip.id), staysOfTrip(db, trip.id), transportsOfTrip(db, trip.id),
    ]);
    return { placeMap: places, places: [...places.values()].sort((a, b) => a.name.localeCompare(b.name, "fr")), activities, stays, transports };
  }, [trip.id]);

  const lieu = params.get("lieu");
  // ?parcours=AAAA-MM-JJ (depuis le planning) ou ?parcours=tous : ouvre le mode Parcours.
  const parcours = params.get("parcours");
  const [mode, setMode] = useState<"lieux" | "parcours">(parcours ? "parcours" : "lieux");
  const [routeDay, setRouteDay] = useState(parcours && parcours !== "tous" ? parcours : "");
  const [lastParcours, setLastParcours] = useState(parcours);
  if (parcours !== lastParcours) {
    setLastParcours(parcours);
    if (parcours) {
      setMode("parcours");
      setRouteDay(parcours === "tous" ? "" : parcours);
    }
  }
  const [selectedId, setSelectedId] = useState<string | null>(lieu);
  const [drawer, setDrawer] = useState<DrawerState>(lieu ? { kind: "details", id: lieu } : null);
  // La page reste montée entre deux visites (cacheComponents) : un nouveau ?lieu= venu du
  // planning doit ouvrir la fiche, même si la carte avait déjà été affichée.
  const [lastLieu, setLastLieu] = useState(lieu);
  if (lieu !== lastLieu) {
    setLastLieu(lieu);
    if (lieu) {
      setSelectedId(lieu);
      setDrawer({ kind: "details", id: lieu });
    }
  }
  const [categories, setCategories] = useState<Set<string>>(new Set());
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [day, setDay] = useState("");
  const [picking, setPicking] = useState<null | "new" | string>(null);
  const [moving, setMoving] = useState<{ id: string; lat?: number; lng?: number } | null>(null);
  const [preview, setPreview] = useState<GeocodeResult | null>(null);
  const [mapStatus, setMapStatus] = useState<MapStatus>("loading");
  const close = useCallback(() => setDrawer(null), []);

  const allRoutes = useMemo(() => (data ? buildDayRoutes({ dates, activities: data.activities, places: data.placeMap, stays: data.stays, transports: data.transports }) : []),
    [data, dates]);
  const routes = useMemo(() => (mode !== "parcours" ? [] : routeDay ? allRoutes.filter((r) => r.date === routeDay) : allRoutes),
    [allRoutes, mode, routeDay]);
  const transit = useTransit(routes);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (mode === "parcours") {
      const ids = new Set(routes.flatMap((r) => r.stops.map((s) => s.placeId).filter((x): x is string => !!x)));
      return data.places.filter((p) => ids.has(p.id));
    }
    const dayPlaces = day ? new Set(data.activities.filter((a) => a.date === day && a.place_id).map((a) => a.place_id!)) : null;
    return data.places.filter((p) =>
      (categories.size === 0 || categories.has(p.category)) && (!favoritesOnly || p.is_favorite) && (!dayPlaces || dayPlaces.has(p.id)));
  }, [data, categories, favoritesOnly, day, mode, routes]);

  if (!data) return <Spinner />;
  const byId = new Map(data.places.map((p) => [p.id, p]));
  const current = drawer?.kind === "details" ? byId.get(drawer.id) : drawer?.kind === "form" && drawer.id ? byId.get(drawer.id) : undefined;
  const present = PLACE_CATEGORIES.filter((c) => data.places.some((p) => p.category === c));
  const cities = trip.destinations.map((d) => d.name);
  const saved = (msg = "Enregistré.") => toast(navigator.onLine ? msg : "Enregistré sur l'appareil, envoyé au retour du réseau.");
  const guard = async (fn: () => Promise<unknown>, msg?: string) => {
    try {
      await fn();
      if (msg) saved(msg);
    } catch (e) {
      toast(toMessage(e), "error");
    }
  };

  const select = (id: string) => {
    setSelectedId(id);
    setDrawer({ kind: "details", id });
    router.replace(`/carte?lieu=${id}`, { scroll: false });
  };
  const toggleCategory = (c: string) =>
    setCategories((s) => {
      const n = new Set(s);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });

  const onPick = (lat: number, lng: number) => {
    const target = picking;
    setPicking(null);
    if (target === "new") setDrawer({ kind: "form", draft: { coords: formatCoordinates(lat, lng) } });
    else if (target) {
      const p = byId.get(target);
      if (p) void guard(() => movePlace(engine, p, lat, lng), "Lieu placé sur la carte.");
      setDrawer({ kind: "details", id: target });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">Carte</h1>
      {/* Carte de bord à bord sur téléphone ; recherche et filtres flottants par-dessus. */}
      <div className="relative -mx-4 -mt-3 h-[calc(100dvh-56px-64px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] min-h-80 overflow-hidden border-b border-line md:mx-0 md:mt-0 md:h-[68vh] md:rounded-2xl md:border">
        {mapStatus === "unsupported" ? (
          <p className="m-4 mt-40 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
            Cet appareil ne peut pas afficher la carte (WebGL indisponible). La liste des lieux reste utilisable ci-dessous.
          </p>
        ) : (
          <TripMap places={filtered} selectedId={selectedId} onSelect={select}
            picking={picking !== null} onPick={onPick}
            movingId={moving?.id ?? null} onMoved={(lat, lng) => setMoving((m) => (m ? { ...m, lat, lng } : m))}
            preview={preview ? { lat: preview.lat, lng: preview.lng } : null} onStatus={setMapStatus}
            routes={routes} />
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-3">
          <div className="pointer-events-auto rounded-2xl bg-card/95 p-1.5 shadow-[var(--shadow)] backdrop-blur">
            <SearchPanel onPreview={setPreview} onAdd={(r) => {
              setPreview(r);
              setDrawer({ kind: "form", draft: { name: r.name, category: r.category, address: r.address, city: r.city ?? "", coords: formatCoordinates(r.lat, r.lng) } });
            }} />
          </div>
          <div className="pointer-events-auto flex gap-1.5">
            <div role="tablist" aria-label="Mode de la carte" className="flex shrink-0 rounded-full bg-card/95 p-0.5 shadow">
              {([["lieux", "Lieux"], ["parcours", "Parcours"]] as const).map(([v, l]) => (
                <button key={v} role="tab" aria-selected={mode === v} onClick={() => setMode(v)}
                  className={`min-h-9 rounded-full px-3 text-xs font-semibold ${mode === v ? "bg-coral text-on-accent" : "text-ink"}`}>{l}</button>
              ))}
            </div>
            {mode === "parcours" && (
              <select value={routeDay} onChange={(e) => setRouteDay(e.target.value)} aria-label="Journée du parcours"
                className="min-h-9 min-w-0 flex-1 rounded-full border border-line-strong bg-card/95 px-3 text-xs font-semibold text-ink shadow">
                <option value="">Tous les jours</option>
                {allRoutes.map((r) => <option key={r.date} value={r.date}>Jour {r.index + 1} · {formatDayShort(r.date)}{r.stops.length > 1 ? "" : " (vide)"}</option>)}
              </select>
            )}
          </div>
          {mode === "lieux" && (
          <div className="pointer-events-auto -mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none]" role="group" aria-label="Filtrer les lieux">
            <select value={day} onChange={(e) => setDay(e.target.value)} aria-label="Afficher les lieux d'une journée"
              className={`min-h-9 shrink-0 rounded-full border px-3 text-xs font-semibold shadow ${day ? "border-transparent bg-teal text-on-accent" : "border-line-strong bg-card/95 text-ink"}`}>
              <option value="">Toutes les journées</option>
              {dates.map((d, i) => <option key={d} value={d}>Jour {i + 1} · {formatDayShort(d)}</option>)}
            </select>
            <button onClick={() => setFavoritesOnly((f) => !f)} aria-pressed={favoritesOnly}
              className={`flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-semibold shadow ${favoritesOnly ? "border-transparent bg-sakura text-on-accent" : "border-line-strong bg-card/95 text-ink"}`}>
              <Icon name="heart" size={14} />Favoris
            </button>
            {present.map((c) => {
              const on = categories.has(c);
              return (
                <button key={c} onClick={() => toggleCategory(c)} aria-pressed={on}
                  className={`flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-semibold shadow ${on ? "border-transparent text-[#0b1020]" : "border-line-strong bg-card/95 text-ink"}`}
                  style={on ? { background: PLACE_META[c].color } : undefined}>
                  <Icon name={PLACE_META[c].icon} size={14} />{PLACE_META[c].plural}
                </button>
              );
            })}
          </div>
          )}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 p-3 pb-9">
          {picking && (
            <div role="status" className="pointer-events-auto flex items-center justify-between gap-2 rounded-xl bg-card/95 px-3 py-2 text-sm text-sakura shadow-[var(--shadow)]">
              <span>Touchez la carte à l&apos;endroit du lieu.</span>
              <Button variant="ghost" onClick={() => setPicking(null)}>Annuler</Button>
            </div>
          )}
          {moving && (
            <div role="status" className="pointer-events-auto flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card/95 px-3 py-2 text-sm text-sakura shadow-[var(--shadow)]">
              <span>Faites glisser le point vers sa nouvelle position.</span>
              <div className="flex gap-2">
                <Button disabled={moving.lat == null} onClick={async () => {
                  const p = byId.get(moving.id);
                  if (p && moving.lat != null && moving.lng != null) await guard(() => movePlace(engine, p, moving.lat!, moving.lng!), "Position enregistrée.");
                  setMoving(null);
                }}>Valider</Button>
                <Button variant="ghost" onClick={() => setMoving(null)}>Annuler</Button>
              </div>
            </div>
          )}
          {mapStatus === "tiles-unavailable" && (
            <p role="status" className="pointer-events-auto rounded-xl border border-warning/40 bg-card/95 px-3 py-2 text-sm text-warning shadow-[var(--shadow)]">
              Fond de carte indisponible sans connexion pour cette zone. Vos lieux restent dans la liste sous la carte.{" "}
              <Link href="/parametres#hors-ligne" className="font-semibold underline">Télécharger les cartes des villes</Link>
            </p>
          )}
          {!picking && !moving && (
            <div className="pointer-events-auto flex justify-end gap-2">
              <Button variant="subtle" icon="crosshair" className="shadow-[var(--shadow)]" onClick={() => { setPicking("new"); setDrawer(null); }} disabled={mapStatus !== "ready"}>
                Placer sur la carte
              </Button>
              <Button icon="plus" className="shadow-[var(--shadow)]" onClick={() => setDrawer({ kind: "form" })} aria-label="Ajouter un lieu par formulaire">Ajouter</Button>
            </div>
          )}
        </div>
      </div>

      {mode === "parcours" ? (
        <>
          <SectionTitle>Parcours {routeDay ? "du jour" : "de tous les jours"}</SectionTitle>
          <RoutePanel routes={routes} transit={transit} totalDays={dates.length} />
        </>
      ) : (
      <>
      <SectionTitle action={<Button variant="ghost" icon="upload" onClick={() => setDrawer({ kind: "import" })}>Importer un fichier</Button>}>
        Lieux ({filtered.length}{filtered.length !== data.places.length ? ` sur ${data.places.length}` : ""})
      </SectionTitle>
      {data.places.length === 0 ? (
        <EmptyState icon="map" title="Aucun lieu pour l'instant" action={<Button icon="plus" onClick={() => setDrawer({ kind: "form" })}>Ajouter un lieu</Button>}>
          Recherchez un lieu, touchez la carte, ou ajoutez une adresse dans une activité du planning.
        </EmptyState>
      ) : filtered.length === 0 ? (
        <Card className="text-sm text-dim">Aucun lieu ne correspond aux filtres.</Card>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Liste des lieux">
          {filtered.map((p) => <PlaceRow key={p.id} place={p} selected={p.id === selectedId} onOpen={() => select(p.id)} />)}
        </ul>
      )}
      </>
      )}

      <Drawer open={drawer !== null} onClose={close}
        title={drawer?.kind === "import" ? "Importer des lieux" : drawer?.kind === "details" ? (current?.name ?? "Lieu") : drawer?.kind === "form" && drawer.id ? "Modifier le lieu" : "Nouveau lieu"}>
        {drawer?.kind === "import" && (
          <ImportPlaces destinations={cities} existing={data.places}
            onImport={async (rows, withJournal, onProgress) => {
              const n = await importPlaces(engine, trip.id, rows, withJournal, onProgress);
              saved(`${n} lieu${n > 1 ? "x" : ""} importé${n > 1 ? "s" : ""}${withJournal ? " (et ajoutés au carnet)" : ""}.`);
              close();
              return n;
            }} />
        )}
        {drawer?.kind === "details" && !current && <p className="text-sm text-dim">Ce lieu n&apos;existe plus.</p>}
        {drawer?.kind === "details" && current && (
          <PlaceDetails key={current.id} place={current} tripId={trip.id} dates={dates}
            onEdit={() => setDrawer({ kind: "form", id: current.id })}
            onMove={() => {
              setDrawer(null);
              if (current.lat == null) setPicking(current.id);
              else setMoving({ id: current.id });
            }}
            onToggleFavorite={() => guard(() => setPlaceFavorite(engine, current, !current.is_favorite))}
            onAddToPlanning={(date) => guard(() => addPlaceToPlanning(engine, db, trip.id, current, date),
              date ? `Ajouté au ${formatDayShort(date)}.` : "Ajouté aux idées du planning.")}
            onDelete={async () => {
              await guard(() => deletePlace(engine, current), "Lieu supprimé.");
              setSelectedId(null);
              close();
              router.replace("/carte", { scroll: false });
            }} />
        )}
        {drawer?.kind === "form" && (
          <PlaceForm key={drawer.id ?? JSON.stringify(drawer.draft ?? {})} isNew={!drawer.id} cities={cities}
            initial={initialPlaceForm(current, drawer.draft)}
            onSubmit={async (patch) => {
              const fromSearch = !drawer.id && preview && patch.name === preview.name;
              const id = await savePlace(engine, trip.id, { ...patch, ...(fromSearch ? { source: "search", source_ref: preview.sourceRef } : {}) }, current);
              setPreview(null);
              saved(drawer.id ? "Lieu enregistré." : "Lieu ajouté.");
              select(id);
            }} />
        )}
      </Drawer>
    </div>
  );
}

function PlaceRow({ place, selected, onOpen }: { place: Place; selected: boolean; onOpen: () => void }) {
  const meta = placeMeta(place.category);
  return (
    <li>
      <button onClick={onOpen} aria-label={`Ouvrir « ${place.name} »`}
        className={`flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left hover:bg-elev ${selected ? "border-sakura" : "border-line"}`}>
        <span className="grid size-9 shrink-0 place-items-center rounded-full text-white" style={{ background: meta.color }} aria-hidden="true">
          <Icon name={meta.icon} size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{place.name}{place.is_favorite && <span className="ml-1 text-sakura" aria-label="favori">♥</span>}</span>
          <span className="block truncate text-xs text-dim">{meta.label}{place.city ? ` · ${place.city}` : ""}{place.lat == null ? " · sans coordonnées" : ""}</span>
        </span>
        <Icon name="chevron" size={18} className="text-mute" />
      </button>
    </li>
  );
}

export default function Page() {
  return <Suspense fallback={<Spinner />}><MapPage /></Suspense>;
}
