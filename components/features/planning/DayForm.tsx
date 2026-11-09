"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, TextAreaField } from "@/components/ui/Field";
import type { TripDay } from "@/lib/types/planning";

export function DayForm({ day, cities, onSubmit }: {
  day?: TripDay;
  cities: string[];
  onSubmit: (v: { title: string | null; city: string | null; notes: string | null; is_free: boolean }) => Promise<void>;
}) {
  const [title, setTitle] = useState(day?.title ?? "");
  const [city, setCity] = useState(day?.city ?? "");
  const [notes, setNotes] = useState(day?.notes ?? "");
  const [isFree, setIsFree] = useState(day?.is_free ?? false);
  const [saving, setSaving] = useState(false);
  const clean = (s: string) => (s.trim() ? s.trim() : null);

  return (
    <form className="flex flex-col gap-4" onSubmit={async (e) => {
      e.preventDefault();
      setSaving(true);
      await onSubmit({ title: clean(title), city: clean(city), notes: clean(notes), is_free: isFree });
    }}>
      <Field label="Titre de la journée (facultatif)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      <Field label="Ville" value={city} onChange={(e) => setCity(e.target.value)} list="villes-du-voyage" maxLength={80} />
      <datalist id="villes-du-voyage">{cities.map((c) => <option key={c} value={c} />)}</datalist>
      <TextAreaField label="Notes du jour" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={10000} />
      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line-strong px-3">
        <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} className="size-5 accent-[var(--vermillion)]" />
        <span className="text-sm">Journée libre (aucun programme prévu)</span>
      </label>
      <Button type="submit" loading={saving} block>Enregistrer la journée</Button>
    </form>
  );
}
