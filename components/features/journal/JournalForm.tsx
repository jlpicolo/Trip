"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, FormError, SelectField, TextAreaField } from "@/components/ui/Field";
import { JOURNAL_META, PRIORITY_META } from "@/lib/journal";
import { formatCoordinates } from "@/lib/geo";
import { fieldErrors } from "@/lib/validation/schemas";
import { journalSchema, type JournalForm as FormValues, type JournalPatch, type JournalPlace } from "@/lib/validation/journal";
import { JOURNAL_CATEGORIES, type JournalEntry } from "@/lib/types/journal";
import type { Place } from "@/lib/types/planning";

export function initialJournalForm(e?: JournalEntry, place?: Place, draft?: Partial<FormValues>): FormValues {
  return {
    title: e?.title ?? "",
    category: e?.category ?? "food",
    priority: e?.priority ? String(e.priority) : "2",
    city: e?.city ?? "",
    body: e?.body ?? "",
    url: e?.url ?? "",
    address: place?.address ?? "",
    coords: formatCoordinates(place?.lat, place?.lng),
    ...draft,
  };
}

export function JournalForm({ initial, isNew, cities, onSubmit }: {
  initial: FormValues; isNew: boolean; cities: string[]; onSubmit: (input: { entry: JournalPatch; place: JournalPlace }) => Promise<void>;
}) {
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof FormValues) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = journalSchema.safeParse(v);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setFormError("Vérifiez les champs signalés.");
      return;
    }
    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      await onSubmit(parsed.data);
    } catch (err) {
      setFormError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormError message={formError} />
      <Field label="Titre" value={v.title} onChange={set("title")} error={errors.title} maxLength={160} autoFocus={isNew} placeholder="Okonomiyaki chez Mizuno" />
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Catégorie" value={v.category} onChange={set("category")} error={errors.category}>
          {JOURNAL_CATEGORIES.map((c) => <option key={c} value={c}>{JOURNAL_META[c].label}</option>)}
        </SelectField>
        <Field label="Ville" value={v.city} onChange={set("city")} error={errors.city} list="villes-carnet" maxLength={80} />
      </div>
      <datalist id="villes-carnet">{cities.map((c) => <option key={c} value={c} />)}</datalist>
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-dim">Priorité</legend>
        <div className="grid grid-cols-3 gap-2">
          {([1, 2, 3] as const).map((p) => (
            <label key={p} className="flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-xl border border-line-strong px-1 py-1 text-center text-xs has-[:checked]:border-sun has-[:checked]:bg-sun-soft has-[:checked]:font-semibold">
              <input type="radio" name="priority" value={String(p)} checked={v.priority === String(p)} onChange={set("priority")} className="sr-only" />
              <span aria-hidden="true" className="text-sun">{PRIORITY_META[p].short}</span>
              {PRIORITY_META[p].label}
            </label>
          ))}
        </div>
      </fieldset>
      <TextAreaField label="Notes" value={v.body} onChange={set("body")} error={errors.body} maxLength={20000}
        placeholder="Pourquoi y aller, quoi commander, horaires, conseil d'un ami…" />
      <Field label="Lien (site, article, vidéo…)" type="url" inputMode="url" value={v.url} onChange={set("url")} error={errors.url} />
      <Field label="Adresse" value={v.address} onChange={set("address")} error={errors.address} autoComplete="off" />
      <Field label="Coordonnées GPS" value={v.coords} onChange={set("coords")} error={errors.coords} autoComplete="off"
        hint="Facultatif : ou collez un lien Google Maps. Place l'entrée sur la carte." />
      <Button type="submit" loading={saving} block>{isNew ? "Ajouter au carnet" : "Enregistrer"}</Button>
    </form>
  );
}
