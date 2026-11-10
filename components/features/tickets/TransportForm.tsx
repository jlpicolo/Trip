"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, FormError, SelectField, TextAreaField } from "@/components/ui/Field";
import { TravelerPicker } from "./TravelerPicker";
import { TRANSPORT_META } from "@/lib/tickets";
import { formatDayShort, tripDates } from "@/lib/formatters";
import { fieldErrors } from "@/lib/validation/schemas";
import { transportSchema, type TransportForm as FormValues, type TransportPatch } from "@/lib/validation/transport";
import { TRANSPORT_KINDS, type Transport } from "@/lib/types/tickets";
import type { Traveler } from "@/hooks/useTrip";
import type { Trip } from "@/lib/types/trip";

export function initialTransportForm(t?: Transport, defaultDate = ""): FormValues {
  return {
    kind: t?.kind ?? "train",
    carrier: t?.carrier ?? "",
    reference: t?.reference ?? "",
    booking_ref: t?.booking_ref ?? "",
    departure_date: t?.departure_date ?? defaultDate,
    departure_time: t?.departure_time?.slice(0, 5) ?? "",
    departure_name: t?.departure_name ?? "",
    arrival_date: t?.arrival_date && t.arrival_date !== t.departure_date ? t.arrival_date : "",
    arrival_time: t?.arrival_time?.slice(0, 5) ?? "",
    arrival_name: t?.arrival_name ?? "",
    seat_info: t?.seat_info ?? "",
    booking_url: t?.booking_url ?? "",
    notes: t?.notes ?? "",
    traveler_ids: t?.traveler_ids ?? [],
  };
}

const shift = (iso: string, d: number) => {
  const x = new Date(`${iso}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
};

export function TransportForm({ trip, travelers, initial, isNew, onSubmit }: {
  trip: Trip; travelers: Traveler[]; initial: FormValues; isNew: boolean; onSubmit: (patch: TransportPatch) => Promise<void>;
}) {
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof FormValues) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  // Une journée de marge de chaque côté : vol de nuit au départ, retour le lendemain.
  const dates = useMemo(() => tripDates(shift(trip.start_date, -1), shift(trip.end_date, 1)), [trip.start_date, trip.end_date]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = transportSchema({ start: trip.start_date, end: trip.end_date }).safeParse(v);
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
      <SelectField label="Type" value={v.kind} onChange={set("kind")} error={errors.kind}>
        {TRANSPORT_KINDS.map((k) => <option key={k} value={k}>{TRANSPORT_META[k].label}</option>)}
      </SelectField>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Compagnie" value={v.carrier} onChange={set("carrier")} error={errors.carrier} maxLength={120} placeholder="JR West" />
        <Field label="N° de vol / train" value={v.reference} onChange={set("reference")} error={errors.reference} maxLength={60} placeholder="Nozomi 21" />
      </div>
      <Field label="Départ de" value={v.departure_name} onChange={set("departure_name")} error={errors.departure_name} maxLength={160} placeholder="Gare de Kyoto" />
      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <SelectField label="Date de départ" value={v.departure_date} onChange={set("departure_date")} error={errors.departure_date}>
          <option value="">Choisir…</option>
          {dates.map((d) => <option key={d} value={d}>{formatDayShort(d)}</option>)}
        </SelectField>
        <Field label="Heure" type="time" value={v.departure_time} onChange={set("departure_time")} error={errors.departure_time} />
      </div>
      <Field label="Arrivée à" value={v.arrival_name} onChange={set("arrival_name")} error={errors.arrival_name} maxLength={160} placeholder="Tokyo" />
      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <SelectField label="Date d'arrivée" value={v.arrival_date} onChange={set("arrival_date")} error={errors.arrival_date}>
          <option value="">Le même jour</option>
          {dates.filter((d) => !v.departure_date || d > v.departure_date).map((d) => <option key={d} value={d}>{formatDayShort(d)}</option>)}
        </SelectField>
        <Field label="Heure" type="time" value={v.arrival_time} onChange={set("arrival_time")} error={errors.arrival_time} />
      </div>
      <Field label="Places (voiture, siège…)" value={v.seat_info} onChange={set("seat_info")} error={errors.seat_info} maxLength={400} placeholder="Voiture 7, sièges 12A à 12D" />
      <Field label="Référence de réservation" value={v.booking_ref} onChange={set("booking_ref")} error={errors.booking_ref} maxLength={120} autoComplete="off" />
      <Field label="Lien de la réservation" type="url" inputMode="url" value={v.booking_url} onChange={set("booking_url")} error={errors.booking_url} />
      <TravelerPicker legend="Voyageurs concernés" travelers={travelers} value={v.traveler_ids}
        onChange={(ids) => setV((x) => ({ ...x, traveler_ids: ids }))} hint="Aucun coché : tout le groupe." />
      <TextAreaField label="Notes" value={v.notes} onChange={set("notes")} maxLength={10000} />
      <Button type="submit" loading={saving} block>{isNew ? "Ajouter le trajet" : "Enregistrer"}</Button>
    </form>
  );
}
