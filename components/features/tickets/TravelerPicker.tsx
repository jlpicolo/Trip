"use client";

import type { Traveler } from "@/hooks/useTrip";

/** Choix des voyageurs concernés (cases à cocher, zones tactiles de 44 px). */
export function TravelerPicker({ legend, travelers, value, onChange, error, hint }: {
  legend: string; travelers: Traveler[]; value: string[]; onChange: (ids: string[]) => void; error?: string; hint?: string;
}) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1 text-sm font-medium text-dim">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {travelers.map((t) => (
          <label key={t.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line-strong px-3 has-[:checked]:border-sakura has-[:checked]:bg-sakura-soft">
            <input type="checkbox" checked={value.includes(t.id)} onChange={() => toggle(t.id)} className="size-5 accent-[var(--sakura)]" />
            <span className="grid size-6 place-items-center rounded-full text-xs font-bold text-[#0b1020]" style={{ background: t.color }} aria-hidden="true">
              {t.display_name.slice(0, 1).toUpperCase()}
            </span>
            <span className="text-sm">{t.display_name}</span>
          </label>
        ))}
      </div>
      {(error || hint) && <p className={`text-xs ${error ? "text-error" : "text-mute"}`}>{error ?? hint}</p>}
    </fieldset>
  );
}
