"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, FormError, SelectField, TextAreaField } from "@/components/ui/Field";
import { formatCoordinates } from "@/lib/geo";
import { formatDayShort, tripDates } from "@/lib/formatters";
import { nightsOf } from "@/lib/stays";
import { fieldErrors } from "@/lib/validation/schemas";
import { accommodationSchema, type AccommodationForm as FormValues, type AccommodationPatch, type StayLocation } from "@/lib/validation/accommodation";
import type { Accommodation } from "@/lib/types/stays";
import type { Place } from "@/lib/types/planning";
import type { Trip } from "@/lib/types/trip";

export function initialStayForm(s?: Accommodation, place?: Place, draft?: Partial<FormValues>): FormValues {
  return {
    name: s?.name ?? "",
    city: s?.city ?? "",
    address: s?.address ?? "",
    address_local: s?.address_local ?? "",
    coords: formatCoordinates(place?.lat, place?.lng),
    check_in_date: s?.check_in_date ?? "",
    check_in_time: s?.check_in_time?.slice(0, 5) ?? "",
    check_out_date: s?.check_out_date ?? "",
    check_out_time: s?.check_out_time?.slice(0, 5) ?? "",
    guests: s?.guests != null ? String(s.guests) : "",
    rooms: s?.rooms ?? "",
    booking_site: s?.booking_site ?? "",
    booking_ref: s?.booking_ref ?? "",
    booking_url: s?.booking_url ?? "",
    phone: s?.phone ?? "",
    email: s?.email ?? "",
    practical_info: s?.practical_info ?? "",
    notes: s?.notes ?? "",
    ...draft,
  };
}

export function StayForm({ trip, initial, isNew, onSubmit }: {
  trip: Trip; initial: FormValues; isNew: boolean; onSubmit: (input: { stay: AccommodationPatch; location: StayLocation }) => Promise<void>;
}) {
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof FormValues) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const dates = tripDates(trip.start_date, trip.end_date);
  const nights = v.check_in_date && v.check_out_date > v.check_in_date ? nightsOf(v) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = accommodationSchema(trip).safeParse(v);
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
      <Field label="Nom de l'hébergement" value={v.name} onChange={set("name")} error={errors.name} maxLength={160} autoFocus={isNew} placeholder="Hotel Gracery Kyoto" />
      <Field label="Ville" value={v.city} onChange={set("city")} error={errors.city} list="villes-hebergement" maxLength={80} />
      <datalist id="villes-hebergement">{trip.destinations.map((d) => <option key={d.id} value={d.name} />)}</datalist>
      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <SelectField label="Arrivée" value={v.check_in_date} onChange={set("check_in_date")} error={errors.check_in_date}>
          <option value="">Choisir…</option>
          {dates.slice(0, -1).map((d) => <option key={d} value={d}>{formatDayShort(d)}</option>)}
        </SelectField>
        <Field label="Dès" type="time" value={v.check_in_time} onChange={set("check_in_time")} error={errors.check_in_time} />
      </div>
      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <SelectField label="Départ" value={v.check_out_date} onChange={set("check_out_date")} error={errors.check_out_date}>
          <option value="">Choisir…</option>
          {dates.slice(1).filter((d) => !v.check_in_date || d > v.check_in_date).map((d) => <option key={d} value={d}>{formatDayShort(d)}</option>)}
        </SelectField>
        <Field label="Avant" type="time" value={v.check_out_time} onChange={set("check_out_time")} error={errors.check_out_time} />
      </div>
      {nights !== null && <p className="-mt-2 text-sm text-teal">{nights} nuit{nights > 1 ? "s" : ""}</p>}
      <Field label="Adresse" value={v.address} onChange={set("address")} error={errors.address} autoComplete="off" />
      <Field label="Adresse en japonais (pour le taxi)" value={v.address_local} onChange={set("address_local")} error={errors.address_local} lang="ja" />
      <Field label="Coordonnées GPS" value={v.coords} onChange={set("coords")} error={errors.coords} autoComplete="off"
        hint="Facultatif : ex. 35.0065, 135.7686 — ou collez un lien Google Maps. Place l'hébergement sur la carte." />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Voyageurs" inputMode="numeric" value={v.guests} onChange={set("guests")} error={errors.guests} />
        <Field label="Réservé via" value={v.booking_site} onChange={set("booking_site")} error={errors.booking_site} maxLength={80} placeholder="Booking, Airbnb…" />
      </div>
      <Field label="Référence de réservation" value={v.booking_ref} onChange={set("booking_ref")} error={errors.booking_ref} maxLength={120} autoComplete="off" />
      <Field label="Lien de la réservation" type="url" inputMode="url" value={v.booking_url} onChange={set("booking_url")} error={errors.booking_url} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Téléphone" type="tel" value={v.phone} onChange={set("phone")} error={errors.phone} />
        <Field label="Email" type="email" value={v.email} onChange={set("email")} error={errors.email} />
      </div>
      <TextAreaField label="Chambres (répartition)" value={v.rooms} onChange={set("rooms")} error={errors.rooms} maxLength={2000} placeholder="Ch. 1 : Aiko et Bastien…" />
      <TextAreaField label="Infos pratiques" value={v.practical_info} onChange={set("practical_info")} maxLength={10000} placeholder="Code de la porte, wifi, consigne à bagages…" />
      <TextAreaField label="Notes" value={v.notes} onChange={set("notes")} maxLength={10000} />
      <Button type="submit" loading={saving} block>{isNew ? "Ajouter l'hébergement" : "Enregistrer"}</Button>
    </form>
  );
}
