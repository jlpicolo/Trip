"use client";

import { categoryMeta } from "@/lib/planning";
import { formatDate } from "@/lib/formatters";
import type { PlanningData } from "./usePlanning";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

/** Grille mensuelle (lundi en premier) couvrant les dates du voyage. */
export function CalendarView({ data, selected, today, onSelect }: {
  data: PlanningData; selected: string; today: string; onSelect: (date: string) => void;
}) {
  const inTrip = new Set(data.dates);
  const months = [...new Set(data.dates.map((d) => d.slice(0, 7)))];
  return (
    <div className="flex flex-col gap-4">
      {months.map((month) => {
        const first = new Date(`${month}-01T00:00:00Z`);
        const offset = (first.getUTCDay() + 6) % 7;
        const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
        const cells = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
        return (
          <div key={month}>
            <h3 className="mb-2 font-semibold capitalize">{formatDate(`${month}-01`, { month: "long", year: "numeric" })}</h3>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-mute" aria-hidden="true">
              {WEEKDAYS.map((w, i) => <span key={i}>{w}</span>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1" role="grid" aria-label={formatDate(`${month}-01`, { month: "long", year: "numeric" })}>
              {cells.map((d, i) => {
                if (!d) return <span key={`v${i}`} />;
                const active = inTrip.has(d);
                const items = data.byDate.get(d) ?? [];
                const day = data.days.get(d);
                const isSel = d === selected;
                return (
                  <button key={d} disabled={!active} onClick={() => onSelect(d)} aria-pressed={isSel}
                    aria-label={`${formatDate(d, { weekday: "long", day: "numeric", month: "long" })} : ${items.length} activité(s)${day?.is_free ? ", journée libre" : ""}`}
                    className={`flex aspect-square min-h-11 flex-col items-center justify-center gap-1 rounded-xl text-sm transition
                      ${!active ? "text-mute/50" : isSel ? "bg-coral text-on-accent" : "bg-card hover:bg-elev"}
                      ${d === today && !isSel ? "ring-2 ring-sakura" : ""}`}>
                    <span className="font-semibold">{Number(d.slice(8))}</span>
                    {active && (
                      <span className="flex h-1.5 gap-0.5">
                        {day?.is_free && items.length === 0 && <span className="size-1.5 rounded-full bg-success" />}
                        {items.slice(0, 3).map((a) => (
                          <span key={a.id} className="size-1.5 rounded-full" style={{ background: isSel ? "currentColor" : categoryMeta(a.category).color }} />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
