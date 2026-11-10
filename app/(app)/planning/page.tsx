"use client";

import { useCallback, useEffect, useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Spinner } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { Card, SectionTitle } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { useCurrentTrip } from "@/components/app/TripContext";
import { usePlanning } from "@/components/features/planning/usePlanning";
import { ActivityList, DaySection } from "@/components/features/planning/DaySection";
import { ActivityCard } from "@/components/features/planning/ActivityCard";
import { ActivityForm, initialActivityForm } from "@/components/features/planning/ActivityForm";
import { DayForm } from "@/components/features/planning/DayForm";
import { CalendarView } from "@/components/features/planning/CalendarView";
import { DayStrip } from "@/components/features/planning/DayStrip";
import { getEngine } from "@/lib/sync/client";
import { getLocalDb } from "@/lib/db/schema";
import { deleteActivity, reorderActivity, saveActivity, saveDay, setActivityDone } from "@/lib/db/planning";
import { formatDayLong, formatDayShort, todayIn } from "@/lib/formatters";
import { toMessage } from "@/lib/errors/messages";
import type { Activity } from "@/lib/types/planning";

type DrawerState = null | { kind: "activity"; activity?: Activity; date?: string | null } | { kind: "day"; date: string };
type View = "timeline" | "calendar";
const VIEW_KEY = "jt-planning-view";

function readView(): View {
  try {
    return typeof window !== "undefined" && localStorage.getItem(VIEW_KEY) === "calendar" ? "calendar" : "timeline";
  } catch {
    return "timeline";
  }
}

export default function PlanningPage() {
  const { trip } = useCurrentTrip();
  const data = usePlanning(trip);
  const toast = useToast();
  const engine = getEngine();
  const db = getLocalDb();
  const today = todayIn(trip.timezone);
  // Préférence par appareil, lue au premier rendu (la page n'affiche rien avant le chargement local).
  const [view, setView] = useState<View>(readView);
  const [selected, setSelected] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [visibleDay, setVisibleDay] = useState<string | null>(null);
  const close = useCallback(() => setDrawer(null), []);
  const ready = data !== undefined;

  // Journée affichée : la première section dont le haut a passé le bandeau collant.
  useEffect(() => {
    if (!ready || view !== "timeline") return;
    const sections = [...document.querySelectorAll<HTMLElement>("section[data-day]")];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setVisibleDay((visible[0].target as HTMLElement).dataset.day ?? null);
      },
      { rootMargin: "-140px 0px -55% 0px" },
    );
    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ready, view]);

  const jumpTo = (date: string) => {
    setVisibleDay(date);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(`jour-${date}`)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // idem
    }
  };

  if (!data) return <Spinner />;
  const selectedDate = selected ?? (data.dates.includes(today) ? today : data.dates[0]);
  const saved = () => toast(navigator.onLine ? "Enregistré." : "Enregistré sur l'appareil, envoyé au retour du réseau.");
  const run = async (fn: () => Promise<unknown>, message = true) => {
    try {
      await fn();
      if (message) saved();
    } catch (e) {
      toast(toMessage(e), "error");
    }
  };
  const toggleDone = (a: Activity) => run(() => setActivityDone(engine, a, !a.is_done), false);
  const reorder = (a: Activity, i: number) => run(() => reorderActivity(engine, db, trip.id, a, i), false);
  const open = (a: Activity) => setDrawer({ kind: "activity", activity: a });
  const destinations = trip.destinations.map((d) => d.name);

  const daySection = (date: string) => (
    <DaySection key={date} date={date} dayNumber={data.dates.indexOf(date) + 1} isToday={date === today}
      day={data.days.get(date)} items={data.byDate.get(date) ?? []} transports={data.transportsByDate.get(date)} stays={data.stays} places={data.places}
      onOpen={open} onToggleDone={toggleDone} onReorder={reorder}
      onAdd={() => setDrawer({ kind: "activity", date })} onEditDay={() => setDrawer({ kind: "day", date })} />
  );

  const editing = drawer?.kind === "activity" ? drawer.activity : undefined;
  const editingPlace = editing?.place_id ? data.places.get(editing.place_id) : undefined;

  return (
    <div className="flex flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Planning</h1>
        <div role="tablist" aria-label="Affichage du planning" className="flex max-w-full rounded-xl bg-elev p-1">
          {([["timeline", "Parcours", "list"], ["calendar", "Calendrier", "grid"]] as const).map(([v, label, icon]) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => changeView(v)}
              className={`flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold sm:px-3 ${view === v ? "bg-card text-ink shadow" : "text-dim"}`}>
              <Icon name={icon} size={16} />{label}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-4 text-sm text-dim">
        Les activités sont des propositions : ajoutez des idées sans horaire, laissez des journées libres.
      </p>

      {data.ideas.length > 0 || view === "timeline" ? (
        <section aria-labelledby="titre-idees" className="mb-6">
          <SectionTitle action={
            <button onClick={() => setDrawer({ kind: "activity", date: null })} className="flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-sakura">
              <Icon name="plus" size={16} /> Idée
            </button>
          }><span id="titre-idees">Idées non planifiées ({data.ideas.length})</span></SectionTitle>
          {data.ideas.length > 0 ? (
            <ActivityList items={data.ideas} places={data.places} onOpen={open} onToggleDone={toggleDone} onReorder={reorder} label="Idées non planifiées" />
          ) : (
            <p className="text-sm text-mute">Une envie sans date précise ? Ajoutez-la ici, vous la placerez plus tard.</p>
          )}
        </section>
      ) : null}

      {data.outside.length > 0 && (
        <Card className="mb-6 border-warning/40">
          <p className="mb-2 text-sm text-warning">Ces activités sont datées hors des dates actuelles du voyage. Ouvrez-les pour les replacer.</p>
          <ul className="flex flex-col gap-2">
            {data.outside.map((a) => (
              <ActivityCard key={a.id} activity={a} place={a.place_id ? data.places.get(a.place_id) : undefined}
                sortable={false} onOpen={() => open(a)} onToggleDone={() => toggleDone(a)} />
            ))}
          </ul>
        </Card>
      )}

      {view === "timeline" ? (
        <div className="flex flex-col gap-4">
          <DayStrip data={data} active={visibleDay ?? (data.dates.includes(today) ? today : data.dates[0])} today={today} onJump={jumpTo} />
          {/* Parcours continu : un tracé relie toutes les journées. */}
          <div className="relative flex flex-col gap-7 pb-4">
            <span aria-hidden="true" className="absolute bottom-2 left-[10px] top-3 w-1 rounded-full opacity-80" style={{ background: "var(--route)" }} />
            {data.dates.map(daySection)}
          </div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <CalendarView data={data} selected={selectedDate} today={today} onSelect={setSelected} />
          <div>{daySection(selectedDate)}</div>
        </div>
      )}

      <Drawer open={drawer !== null} onClose={close}
        title={drawer?.kind === "day" ? formatDayLong(drawer.date) : editing ? "Modifier l'activité"
          : drawer?.kind === "activity" && drawer.date ? `Nouvelle activité · ${formatDayShort(drawer.date)}` : "Nouvelle idée"}>
        {drawer?.kind === "activity" && (
          <ActivityForm key={editing ? `${editing.id}:${editing.version}` : `new:${drawer.date}`} trip={trip} dates={data.dates}
            existing={editing} initial={initialActivityForm(trip, editing, editingPlace, drawer.date)}
            onSubmit={async (value) => {
              await saveActivity(engine, db, trip.id, value, editing);
              close();
              saved();
            }}
            onDelete={editing ? async () => {
              await run(() => deleteActivity(engine, editing), false);
              close();
              toast("Activité supprimée.");
            } : undefined} />
        )}
        {drawer?.kind === "day" && (
          <DayForm key={drawer.date} day={data.days.get(drawer.date)} cities={destinations}
            onSubmit={async (v) => {
              await run(() => saveDay(engine, db, trip.id, drawer.date, v));
              close();
            }} />
        )}
      </Drawer>
    </div>
  );
}
