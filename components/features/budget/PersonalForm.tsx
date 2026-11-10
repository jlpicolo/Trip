"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, FormError, SelectField, TextAreaField } from "@/components/ui/Field";
import { PERSONAL_LABEL } from "@/lib/budget/labels";
import { minorToInput } from "@/lib/money";
import { formatRate, rateToBase } from "@/lib/fx";
import { fieldErrors } from "@/lib/validation/schemas";
import { personalSchema, type PersonalForm as FormValues } from "@/lib/validation/budget";
import { PERSONAL_CATEGORIES, type KnownRate, type PersonalExpense } from "@/lib/types/budget";
import type { PersonalPatch } from "@/lib/db/budget";
import type { Trip } from "@/lib/types/trip";

export function initialPersonalForm(trip: Trip, today: string, known: KnownRate | null, p?: PersonalExpense): FormValues {
  const currency = p?.currency ?? trip.secondary_currency ?? trip.base_currency;
  const rate = p ? p.fx_rate : rateToBase(currency, trip.base_currency, known);
  return {
    title: p?.title ?? "", category: p?.category ?? "souvenir", date: p?.date ?? today,
    amount: p ? minorToInput(p.amount_minor, p.currency) : "", currency,
    rate: rate ? formatRate(rate).replace(/\s/g, "") : "", notes: p?.notes ?? "",
  };
}

export function PersonalForm({ trip, initial, isNew, known, onSubmit }: {
  trip: Trip; initial: FormValues; isNew: boolean; known: KnownRate | null; onSubmit: (patch: PersonalPatch) => Promise<void>;
}) {
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof FormValues) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const base = trip.base_currency;
  // Taux arrivé après l'ouverture du formulaire (première visite) : on remplit un champ resté vide.
  const [lastKnown, setLastKnown] = useState(known);
  if (known !== lastKnown) {
    setLastKnown(known);
    const r = rateToBase(v.currency, base, known);
    if (r && !v.rate && v.currency !== base) setV((x) => ({ ...x, rate: formatRate(r).replace(/\s/g, "") }));
  }
  const currencies = [base, trip.secondary_currency].filter((c): c is string => !!c);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = personalSchema(base).safeParse(v);
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
      <p className="text-xs text-mute">Dépense à votre charge : elle n&apos;entre jamais dans le pot commun.</p>
      <Field label="Libellé" value={v.title} onChange={set("title")} error={errors.title} maxLength={160} autoFocus={isNew} placeholder="Furoshiki" />
      <div className="grid grid-cols-[1fr_6.5rem] gap-3">
        <Field label="Montant" inputMode="decimal" value={v.amount} onChange={set("amount")} error={errors.amount} autoComplete="off" />
        <SelectField label="Devise" value={v.currency} onChange={(e) => {
          const r = rateToBase(e.target.value, base, known);
          setV((x) => ({ ...x, currency: e.target.value, rate: r ? formatRate(r).replace(/\s/g, "") : "" }));
        }}>
          {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
        </SelectField>
      </div>
      {v.currency !== base && (
        <Field label={`Taux : 1 ${v.currency} = … ${base}`} inputMode="decimal" value={v.rate} onChange={set("rate")} error={errors.rate} autoComplete="off" />
      )}
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Catégorie" value={v.category} onChange={set("category")}>
          {PERSONAL_CATEGORIES.map((c) => <option key={c} value={c}>{PERSONAL_LABEL[c]}</option>)}
        </SelectField>
        <Field label="Date" type="date" value={v.date} onChange={set("date")} error={errors.date} />
      </div>
      <TextAreaField label="Notes" value={v.notes} onChange={set("notes")} maxLength={10000} />
      <Button type="submit" loading={saving} block>{isNew ? "Ajouter" : "Enregistrer"}</Button>
    </form>
  );
}
