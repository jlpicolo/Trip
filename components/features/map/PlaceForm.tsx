"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, FormError, SelectField, TextAreaField } from "@/components/ui/Field";
import { PLACE_CATEGORIES, PLACE_META } from "@/lib/places";
import { formatCoordinates } from "@/lib/geo";
import { fieldErrors } from "@/lib/validation/schemas";
import { placeSchema, type PlaceForm as FormValues, type PlacePatch } from "@/lib/validation/place";
import type { Place } from "@/lib/types/planning";

export function initialPlaceForm(place?: Place, draft?: Partial<FormValues>): FormValues {
  return {
    name: place?.name ?? "",
    category: place?.category ?? "other",
    address: place?.address ?? "",
    address_local: place?.address_local ?? "",
    city: place?.city ?? "",
    coords: formatCoordinates(place?.lat, place?.lng),
    description: place?.description ?? "",
    notes: place?.notes ?? "",
    url: place?.url ?? "",
    is_favorite: place?.is_favorite ?? false,
    ...draft,
  };
}

export function PlaceForm({ initial, isNew, cities, onSubmit }: {
  initial: FormValues;
  isNew: boolean;
  cities: string[];
  onSubmit: (patch: PlacePatch) => Promise<void>;
}) {
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof FormValues) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = placeSchema.safeParse(v);
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
      <Field label="Nom" value={v.name} onChange={set("name")} error={errors.name} maxLength={160} autoFocus={isNew && !v.name} />
      <SelectField label="Catégorie" value={v.category} onChange={set("category")} error={errors.category}>
        {PLACE_CATEGORIES.map((c) => <option key={c} value={c}>{PLACE_META[c].label}</option>)}
      </SelectField>
      <Field label="Coordonnées GPS" value={v.coords} onChange={set("coords")} error={errors.coords} autoComplete="off"
        hint={v.coords ? "Ex. 34.9671, 135.7727 — ou collez un lien Google Maps" : "Sans coordonnées, le lieu est listé mais pas affiché sur la carte."} />
      <Field label="Adresse" value={v.address} onChange={set("address")} error={errors.address} autoComplete="off" />
      <Field label="Adresse en japonais (facultatif)" value={v.address_local} onChange={set("address_local")} error={errors.address_local} lang="ja" />
      <Field label="Ville" value={v.city} onChange={set("city")} list="villes-carte" error={errors.city} maxLength={80} />
      <datalist id="villes-carte">{cities.map((c) => <option key={c} value={c} />)}</datalist>
      <Field label="Lien externe" type="url" inputMode="url" value={v.url} onChange={set("url")} error={errors.url} />
      <TextAreaField label="Description" value={v.description} onChange={set("description")} maxLength={10000} />
      <TextAreaField label="Notes" value={v.notes} onChange={set("notes")} maxLength={10000} />
      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line-strong px-3">
        <input type="checkbox" checked={v.is_favorite} onChange={(e) => setV((x) => ({ ...x, is_favorite: e.target.checked }))}
          className="size-5 accent-[var(--coral)]" />
        <span className="text-sm">Lieu favori</span>
      </label>
      <Button type="submit" loading={saving} block>{isNew ? "Ajouter le lieu" : "Enregistrer"}</Button>
    </form>
  );
}
