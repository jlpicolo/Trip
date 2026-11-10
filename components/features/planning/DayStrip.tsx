"use client";

import { useEffect, useRef } from "react";
import { formatDate } from "@/lib/formatters";
import type { PlanningData } from "./usePlanning";

/**
 * Bandeau des journées, collé en haut du parcours : montre la journée affichée et
 * permet d'y sauter d'un geste.
 */
export function DayStrip({ data, active, today, onJump }: {
  data: PlanningData; active: string | null; today: string; onJump: (date: string) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);

  // Garder la journée active visible dans le bandeau pendant le défilement.
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>(`[data-strip="${active}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "auto" });
  }, [active]);

  return (
    <nav aria-label="Aller à une journée"
      className="sticky top-[calc(56px+env(safe-area-inset-top))] z-20 -mx-4 border-b border-line bg-canvas/95 px-4 py-2 backdrop-blur md:-mx-8 md:px-8">
      <div ref={strip} className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
        {data.dates.map((d, i) => {
          const count = data.byDate.get(d)?.length ?? 0;
          const free = data.days.get(d)?.is_free;
          const on = d === active;
          return (
            <button key={d} data-strip={d} onClick={() => onJump(d)} aria-current={on ? "true" : undefined}
              aria-label={`Jour ${i + 1}, ${formatDate(d, { weekday: "long", day: "numeric", month: "long" })}${count ? `, ${count} activité(s)` : free ? ", journée libre" : ""}`}
              className={`flex min-h-12 min-w-11 shrink-0 flex-col items-center justify-center rounded-xl border px-1.5 text-[11px] leading-tight transition-colors
                ${on ? "border-transparent bg-coral text-on-accent" : `bg-card text-dim ${free ? "border-dashed border-teal/50" : "border-line"}`}
                ${d === today && !on ? "ring-2 ring-sakura" : ""}`}>
              <span>{formatDate(d, { weekday: "short" }).replace(".", "")}</span>
              <span className={`text-[15px] font-bold ${on ? "" : "text-ink"}`}>{Number(d.slice(8))}</span>
              <span aria-hidden="true" className={`mt-0.5 h-1 w-3 rounded-full ${count ? (on ? "bg-on-accent/60" : "bg-sakura") : "bg-transparent"}`} />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
