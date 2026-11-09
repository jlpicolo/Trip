"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, FormError, SelectField, TextAreaField } from "@/components/ui/Field";
import { ACTIVITY_CATEGORIES, TRAVEL_MODES, type Activity, type Place } from "@/lib/types/planning";
import { CATEGORY_META, hm, mapsLinks, TRAVEL_MODE_LABEL } from "@/lib/planning";
import { formatDayShort } from "@/lib/formatters";
import { formatCoordinates } from "@/lib/geo";
import { minorToInput } from "@/lib/money";
import { fieldErrors } from "@/lib/validation/schemas";
import { activitySchema, type ActivityForm as FormValues, type ActivityPatch, type PlaceFields } from "@/lib/validation/activity";
import type { Trip } from "@/lib/types/trip";

export function initialActivityForm(trip: Trip, activity?: Activity, place?: Place, date?: string | null): FormValues {
  const currency = activity?.estimated_cost_currency ?? trip.secondary_currency ?? trip.base_currency;
  return {
    title: activity?.title ?? "",
    category: activity?.category ?? (date === null ? "idea" : "visit"),
    date: activity ? (activity.date ?? "") : (date ?? ""),
    start_time: hm(activity?.start_time) ?? "",
    end_time: hm(activity?.end_time) ?? "",
    duration: activity?.duration_minutes?.toString() ?? "",
    description: activity?.description ?? "",
    notes: activity?.notes ?? "",
    url: activity?.url ?? "",
    cost: minorToInput(activity?.estimated_cost_minor, currency),
    cost_currency: currency,
    travel_minutes: activity?.travel_minutes_estimate?.toString() ?? "",
    travel_mode: activity?.travel_mode ?? "",
    address: place?.address ?? "",
    coords: formatCoordinates(place?.lat, place?.lng),
  };
}

export function ActivityForm({ trip, dates, initial, existing, onSubmit, onDelete }: {
  trip: Trip;
  dates: string[];
  initial: FormValues;
  existing?: Activity;
  onSubmit: (value: { activity: ActivityPatch; place: PlaceFields | null }) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (k: keyof FormValues) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const currencies = [...new Set([trip.base_currency, trip.secondary_currency, v.cost_currency].filter(Boolean) as string[])];
  const links = mapsLinks({ address: v.address, name: v.title, ...(() => {
    const m = v.coords.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    return m ? { lat: Number(m[1]), lng: Number(m[2]) } : {};
  })() });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = activitySchema(trip).safeParse(v);
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
      <Field label="Titre" value={v.title} onChange={set("title")} error={errors.title} maxLength={160} autoFocus={!existing} />
      <SelectField label="Catégorie" value={v.category} onChange={set("category")} error={errors.category}>
        {ACTIVITY_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
      </SelectField>
      <SelectField label="Journée" value={v.date} onChange={set("date")} error={errors.date}>
        <option value="">Non planifiée (idée)</option>
        {dates.map((d, i) => <option key={d} value={d}>Jour {i + 1} · {formatDayShort(d)}</option>)}
      </SelectField>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Début (facultatif)" type="time" value={v.start_time} onChange={set("start_time")} error={errors.start_time} disabled={!v.date} />
        <Field label="Fin (facultatif)" type="time" value={v.end_time} onChange={set("end_time")} error={errors.end_time} disabled={!v.start_time} />
      </div>
      <Field label="Durée estimée (minutes, facultatif)" inputMode="numeric" value={v.duration} onChange={set("duration")} error={errors.duration} />

      <fieldset className="flex flex-col gap-3 rounded-2xl border border-line p-3">
        <legend className="px-1 text-sm font-medium text-dim">Lieu (facultatif)</legend>
        <Field label="Adresse" value={v.address} onChange={set("address")} error={errors.address} autoComplete="off" />
        <Field label="Coordonnées GPS" value={v.coords} onChange={set("coords")} error={errors.coords} autoComplete="off"
          hint="Ex. 34.9671, 135.7727 — ou collez un lien Google Maps" />
        {links && (
          <div className="flex flex-wrap gap-3 text-sm">
            <a href={links.view} target="_blank" rel="noopener noreferrer" className="font-semibold text-night">Voir dans Google Maps</a>
            <a href={links.apple} target="_blank" rel="noopener noreferrer" className="font-semibold text-night">Plans (Apple)</a>
          </div>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-2xl border border-line p-3">
        <legend className="px-1 text-sm font-medium text-dim">Trajet depuis l&apos;activité précédente</legend>
        <p className="text-xs text-mute">Saisie manuelle, affichée comme une <strong>estimation</strong> : l&apos;application ne calcule aucun temps de trajet.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Durée (min)" inputMode="numeric" value={v.travel_minutes} onChange={set("travel_minutes")} error={errors.travel_minutes} />
          <SelectField label="Moyen" value={v.travel_mode} onChange={set("travel_mode")}>
            <option value="">—</option>
            {TRAVEL_MODES.map((m) => <option key={m} value={m}>{m === "other" ? "autre" : TRAVEL_MODE_LABEL[m]}</option>)}
          </SelectField>
        </div>
      </fieldset>

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="Budget estimé (facultatif)" inputMode="decimal" value={v.cost} onChange={set("cost")} error={errors.cost} />
        <SelectField label="Devise" value={v.cost_currency} onChange={set("cost_currency")}>
          {currencies.map((c) => <option key={c}>{c}</option>)}
        </SelectField>
      </div>
      <Field label="Lien externe (réservation, site…)" type="url" inputMode="url" value={v.url} onChange={set("url")} error={errors.url} />
      <TextAreaField label="Description" value={v.description} onChange={set("description")} maxLength={10000} />
      <TextAreaField label="Notes" value={v.notes} onChange={set("notes")} maxLength={10000} />
      {existing?.url && (
        <a href={existing.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-night">Ouvrir le lien enregistré</a>
      )}

      <Button type="submit" loading={saving} block>{existing ? "Enregistrer" : "Ajouter l'activité"}</Button>
      {existing && onDelete && (
        confirmDelete ? (
          <div role="alert" className="flex flex-col gap-2 rounded-xl border border-error/40 bg-error/10 p-3 text-sm">
            <p>Supprimer « {existing.title} » pour tous les voyageurs ?</p>
            <div className="flex gap-2">
              <Button type="button" variant="danger" className="flex-1" onClick={() => onDelete()}>Supprimer</Button>
              <Button type="button" variant="ghost" className="flex-1" onClick={() => setConfirmDelete(false)}>Annuler</Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="danger" icon="trash" onClick={() => setConfirmDelete(true)}>Supprimer l&apos;activité</Button>
        )
      )}
    </form>
  );
}
