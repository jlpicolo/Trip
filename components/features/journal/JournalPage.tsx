"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SectionTitle } from "@/components/ui/Card";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState, Spinner } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useCurrentTrip } from "@/components/app/TripContext";
import { JournalCard } from "./JournalCard";
import { JournalDetails } from "./JournalDetails";
import { JournalForm, initialJournalForm } from "./JournalForm";
import { getEngine } from "@/lib/sync/client";
import { getLocalDb } from "@/lib/db/schema";
import { placesOfTrip } from "@/lib/db/planning";
import { deleteEntry, entriesOfTrip, planEntry, plannedFromJournal, saveEntry } from "@/lib/db/journal";
import { JOURNAL_META, PRIORITY_META, filterEntries, isJournalCategory } from "@/lib/journal";
import { formatDayShort, tripDates } from "@/lib/formatters";
import { toMessage } from "@/lib/errors/messages";
import { JOURNAL_CATEGORIES } from "@/lib/types/journal";

type DrawerState = null | { kind: "entry"; id: string } | { kind: "form"; id?: string };

const chip = "min-h-10 shrink-0 rounded-full border border-line-strong px-3 text-sm aria-pressed:border-sun aria-pressed:bg-sun-soft aria-pressed:font-semibold aria-pressed:text-sun";

export function JournalPage() {
  const { trip } = useCurrentTrip();
  const toast = useToast();
  const engine = getEngine();
  const db = getLocalDb();
  const data = useLiveQuery(async () => {
    const [entries, planned, places] = await Promise.all([entriesOfTrip(db, trip.id), plannedFromJournal(db, trip.id), placesOfTrip(db, trip.id)]);
    return { entries, planned, places };
  }, [trip.id]);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [unplannedOnly, setUnplannedOnly] = useState(false);
  const [query, setQuery] = useState("");
  const close = useCallback(() => setDrawer(null), []);
  const dates = useMemo(() => tripDates(trip.start_date, trip.end_date), [trip.start_date, trip.end_date]);

  const visible = useMemo(() => {
    if (!data) return [];
    return filterEntries(data.entries, { category, city, unplannedOnly, query }, new Set(data.planned.keys()));
  }, [data, category, city, unplannedOnly, query]);

  if (!data) return <Spinner />;

  const saved = (msg: string) => toast(navigator.onLine ? msg : `${msg} Enregistré sur l'appareil, envoyé au retour du réseau.`);
  const guard = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      saved(msg);
      return true;
    } catch (e) {
      toast(toMessage(e), "error");
      return false;
    }
  };

  const byId = new Map(data.entries.map((e) => [e.id, e]));
  const current = drawer && drawer.kind !== "form" ? byId.get(drawer.id) : drawer?.id ? byId.get(drawer.id) : undefined;
  const cities = [...new Set([...trip.destinations.map((d) => d.name), ...data.entries.map((e) => e.city).filter((c): c is string => !!c)])];
  const usedCities = cities.filter((c) => data.entries.some((e) => e.city === c));
  const usedCategories = JOURNAL_CATEGORIES.filter((c) => data.entries.some((e) => e.category === c));
  const unplannedCount = data.entries.filter((e) => !data.planned.has(e.id)).length;
  const groups = ([1, 2, 3, null] as const)
    .map((p) => ({ p, items: visible.filter((e) => (e.priority ?? null) === p) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Carnet</h1>
          <p className="text-sm text-dim">
            {data.entries.length === 0 ? "Bonnes adresses, envies et conseils du groupe." : `${data.entries.length} envie${data.entries.length > 1 ? "s" : ""} · ${unplannedCount} à planifier`}
          </p>
        </div>
        <Button icon="plus" onClick={() => setDrawer({ kind: "form" })}>Envie</Button>
      </div>

      {data.entries.length === 0 ? (
        <EmptyState icon="book" title="Le carnet est vide">
          Notez restaurants, temples, boutiques ou conseils d&apos;amis au fil de vos lectures ; classez-les par priorité,
          puis ajoutez-les au planning en un geste, sans ressaisie.
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-elev px-3">
              <Icon name="search" size={18} className="text-mute" />
              <span className="sr-only">Rechercher dans le carnet</span>
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher…" className="min-w-0 flex-1 bg-transparent text-base outline-none" />
            </label>
            <div role="group" aria-label="Filtrer par catégorie" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              <button aria-pressed={category === null} onClick={() => setCategory(null)} className={chip}>Tout</button>
              {usedCategories.map((c) => (
                <button key={c} aria-pressed={category === c} onClick={() => setCategory(category === c ? null : c)} className={chip}>{JOURNAL_META[c].label}</button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {usedCities.length > 0 && (
                <select aria-label="Filtrer par ville" value={city ?? ""} onChange={(e) => setCity(e.target.value || null)}
                  className="min-h-10 rounded-full border border-line-strong bg-elev px-3 text-sm">
                  <option value="">Toutes les villes</option>
                  {usedCities.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              <button aria-pressed={unplannedOnly} onClick={() => setUnplannedOnly(!unplannedOnly)} className={chip}>À planifier</button>
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="text-sm text-dim">Aucune envie ne correspond à ces filtres.</p>
          ) : (
            groups.map((g) => (
              <section key={g.p ?? "none"} aria-label={g.p ? PRIORITY_META[g.p].label : "Sans priorité"}>
                <SectionTitle>{g.p ? `${PRIORITY_META[g.p].short} ${PRIORITY_META[g.p].label}` : "Sans priorité"}</SectionTitle>
                <ul className="flex flex-col gap-2">
                  {g.items.map((e) => (
                    <JournalCard key={e.id} entry={e} planned={data.planned.get(e.id) ?? []} onOpen={() => setDrawer({ kind: "entry", id: e.id })} />
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}

      <Drawer open={drawer !== null} title={drawer?.kind === "form" ? (drawer.id ? "Modifier" : "Nouvelle envie") : (current?.title ?? "Entrée introuvable")} onClose={close}>
        {drawer?.kind === "entry" && current && (
          <JournalDetails entry={current} place={current.place_id ? data.places.get(current.place_id) : undefined}
            planned={data.planned.get(current.id) ?? []} dates={dates}
            onEdit={() => setDrawer({ kind: "form", id: current.id })}
            onDelete={async () => {
              if (await guard(() => deleteEntry(engine, current), "Entrée supprimée.")) close();
            }}
            onPlan={async (date) => {
              await guard(() => planEntry(engine, db, trip.id, current, date), date ? `Ajouté au ${formatDayShort(date)}.` : "Ajouté aux idées du planning.");
            }} />
        )}
        {drawer?.kind === "form" && (
          <JournalForm key={drawer.id ?? "new"} isNew={!drawer.id} cities={cities}
            initial={initialJournalForm(current, current?.place_id ? data.places.get(current.place_id) : undefined,
              !drawer.id && category && isJournalCategory(category) ? { category, city: city ?? "" } : undefined)}
            onSubmit={async (input) => {
              const id = await saveEntry(engine, db, trip.id, input, current);
              saved(current ? "Entrée enregistrée." : "Ajouté au carnet.");
              setDrawer({ kind: "entry", id });
            }} />
        )}
      </Drawer>
    </div>
  );
}
