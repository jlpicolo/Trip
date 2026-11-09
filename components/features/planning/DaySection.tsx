"use client";

import {
  DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { formatDayLong } from "@/lib/formatters";
import type { Activity, Place, TripDay } from "@/lib/types/planning";
import { ActivityCard } from "./ActivityCard";

export function useDragSensors() {
  return useSensors(
    // Souris : petit seuil pour distinguer clic et glisser. Tactile : appui long pour
    // ne pas gêner le défilement de la page.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

const announcements = {
  onDragStart: () => "Déplacement commencé. Flèches haut et bas pour changer la position, Espace pour valider, Échap pour annuler.",
  onDragOver: () => "",
  onDragEnd: () => "Activité déplacée.",
  onDragCancel: () => "Déplacement annulé.",
};

export function ActivityList({ items, places, onOpen, onToggleDone, onReorder, label }: {
  items: Activity[];
  places: Map<string, Place>;
  onOpen: (a: Activity) => void;
  onToggleDone: (a: Activity) => void;
  onReorder: (a: Activity, newIndex: number) => void;
  label: string;
}) {
  const sensors = useDragSensors();
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const moved = items.find((a) => a.id === e.active.id);
    const newIndex = items.findIndex((a) => a.id === e.over!.id);
    if (moved && newIndex >= 0) onReorder(moved, newIndex);
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}
      accessibility={{ announcements, screenReaderInstructions: { draggable: "Pour réordonner, appuyez sur Espace puis utilisez les flèches." } }}>
      <SortableContext items={items.map((a) => a.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-2" aria-label={label}>
          {items.map((a) => (
            <ActivityCard key={a.id} activity={a} place={a.place_id ? places.get(a.place_id) : undefined}
              onOpen={() => onOpen(a)} onToggleDone={() => onToggleDone(a)} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

export function DaySection({ date, dayNumber, isToday, day, items, places, onOpen, onToggleDone, onReorder, onAdd, onEditDay }: {
  date: string;
  dayNumber: number;
  isToday: boolean;
  day?: TripDay;
  items: Activity[];
  places: Map<string, Place>;
  onOpen: (a: Activity) => void;
  onToggleDone: (a: Activity) => void;
  onReorder: (a: Activity, newIndex: number) => void;
  onAdd: () => void;
  onEditDay: () => void;
}) {
  const title = formatDayLong(date);
  return (
    <section id={`jour-${date}`} aria-labelledby={`titre-${date}`} className="scroll-mt-20">
      <div className="mb-2 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-mute">
            Jour {dayNumber}{isToday && <span className="ml-2 text-vermillion">· Aujourd&apos;hui</span>}
          </p>
          <h2 id={`titre-${date}`} className="truncate text-lg font-bold">
            {title}{day?.city && <span className="font-normal text-dim"> · {day.city}</span>}
          </h2>
          {day?.title && <p className="truncate text-sm text-dim">{day.title}</p>}
        </div>
        <button onClick={onEditDay} aria-label={`Note et ville du ${title}`}
          className="grid size-11 shrink-0 place-items-center rounded-full text-dim hover:bg-elev"><Icon name="edit" size={18} /></button>
      </div>
      {(day?.is_free || day?.notes) && (
        <div className="mb-2 flex flex-col gap-1 rounded-xl bg-elev px-3 py-2 text-sm">
          {day.is_free && <Badge tone="success">Journée libre</Badge>}
          {day.notes && <p className="whitespace-pre-line text-dim">{day.notes}</p>}
        </div>
      )}
      {items.length > 0 ? (
        <ActivityList items={items} places={places} onOpen={onOpen} onToggleDone={onToggleDone} onReorder={onReorder}
          label={`Activités du ${title}`} />
      ) : (
        !day?.is_free && <p className="rounded-xl border border-dashed border-line-strong px-3 py-3 text-sm text-mute">Rien de prévu, et c&apos;est très bien aussi.</p>
      )}
      <button onClick={onAdd} className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-sakura hover:bg-sakura-soft">
        <Icon name="plus" size={18} /> Ajouter au {formatDayLong(date).toLowerCase()}
      </button>
    </section>
  );
}
