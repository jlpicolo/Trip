"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, FormError, SelectField, TextAreaField } from "@/components/ui/Field";
import { computeSplit } from "@/lib/budget/split";
import { EXPENSE_LABEL, SPLIT_LABEL } from "@/lib/budget/labels";
import { formatMoney } from "@/lib/formatters";
import { minorToInput, parseAmountToMinor } from "@/lib/money";
import { formatRate, rateToBase } from "@/lib/fx";
import { fieldErrors } from "@/lib/validation/schemas";
import { expenseSchema, parseRate, shareValue, type ExpenseForm as FormValues } from "@/lib/validation/budget";
import { EXPENSE_CATEGORIES, SPLIT_MODES, type Expense, type KnownRate, type SplitMode } from "@/lib/types/budget";
import type { ExpensePatch } from "@/lib/db/budget";
import type { Traveler } from "@/hooks/useTrip";
import type { Trip } from "@/lib/types/trip";

export function initialExpenseForm(trip: Trip, travelers: Traveler[], userId: string, today: string, known: KnownRate | null, e?: Expense): FormValues {
  const currency = e?.currency ?? trip.secondary_currency ?? trip.base_currency;
  const rate = e ? e.fx_rate : rateToBase(currency, trip.base_currency, known);
  const participants: FormValues["participants"] = {};
  for (const t of travelers) {
    const s = e?.shares.find((x) => x.user_id === t.id);
    const value = !s ? "" : e!.split_mode === "exact" ? minorToInput(s.weight, currency) : e!.split_mode === "equal" ? "" : String(s.weight).replace(".", ",");
    participants[t.id] = { on: e ? !!s : true, value };
  }
  return {
    title: e?.title ?? "", category: e?.category ?? "food", date: e?.date ?? today,
    amount: e ? minorToInput(e.amount_minor, e.currency) : "", currency,
    rate: rate ? formatRate(rate).replace(/\s/g, "") : "", paid_by: e?.paid_by ?? userId,
    mode: e?.split_mode ?? "equal", participants, notes: e?.notes ?? "",
  };
}

export function ExpenseForm({ trip, travelers, initial, isNew, known, onSubmit }: {
  trip: Trip; travelers: Traveler[]; initial: FormValues; isNew: boolean; known: KnownRate | null; onSubmit: (patch: ExpensePatch) => Promise<void>;
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
  const mode = v.mode as SplitMode;
  const members = travelers.map((t) => t.id);
  // Voyageur connu après l'ouverture du formulaire (liste encore en chargement) : inclus par défaut
  // dans une nouvelle dépense, exclu d'une dépense existante qui ne le mentionnait pas.
  const participantOf = (id: string) => v.participants[id] ?? { on: isNew, value: "" };
  const withDefaults = (): FormValues => ({ ...v, participants: Object.fromEntries(members.map((id) => [id, participantOf(id)])) });

  function changeCurrency(c: string) {
    const r = rateToBase(c, base, known);
    setV((x) => ({ ...x, currency: c, rate: r ? formatRate(r).replace(/\s/g, "") : "" }));
  }

  // Aperçu en direct des parts (mêmes calculs que l'enregistrement).
  const preview = useMemo(() => {
    const amount = parseAmountToMinor(v.amount, v.currency);
    const rate = v.currency === base ? 1 : parseRate(v.rate);
    if (!amount || !rate) return null;
    const participants = members.filter((id) => participantOf(id).on).map((id) => ({ user_id: id, value: shareValue(mode, participantOf(id).value, v.currency) ?? NaN }));
    return computeSplit({ mode, amountMinor: amount, currency: v.currency, baseCurrency: base, rate, participants });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- participantOf dérive de v et isNew
  }, [v, base, mode, members, isNew]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = expenseSchema({ baseCurrency: base, members }).safeParse(withDefaults());
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

  const unit = mode === "percent" ? "%" : mode === "shares" ? "parts" : v.currency;
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormError message={formError} />
      <Field label="Libellé" value={v.title} onChange={set("title")} error={errors.title} maxLength={160} autoFocus={isNew} placeholder="Dîner à Dōtonbori" />
      <div className="grid grid-cols-[1fr_6.5rem] gap-3">
        <Field label="Montant" inputMode="decimal" value={v.amount} onChange={set("amount")} error={errors.amount} autoComplete="off" placeholder={v.currency === "JPY" ? "4800" : "12,50"} />
        <SelectField label="Devise" value={v.currency} onChange={(e) => changeCurrency(e.target.value)}>
          {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
        </SelectField>
      </div>
      {v.currency !== base && (
        <Field label={`Taux : 1 ${v.currency} = … ${base}`} inputMode="decimal" value={v.rate} onChange={set("rate")} error={errors.rate} autoComplete="off"
          hint={known ? "Prérempli avec le taux connu, figé dans cette dépense (modifiable, ex. taux de votre carte)." : "Aucun taux connu : saisissez celui de votre banque."} />
      )}
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Payé par" value={v.paid_by} onChange={set("paid_by")} error={errors.paid_by}>
          {travelers.map((t) => <option key={t.id} value={t.id}>{t.display_name}</option>)}
        </SelectField>
        <Field label="Date" type="date" value={v.date} onChange={set("date")} error={errors.date} />
      </div>
      <SelectField label="Catégorie" value={v.category} onChange={set("category")}>
        {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{EXPENSE_LABEL[c]}</option>)}
      </SelectField>

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-dim">Répartition</legend>
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-elev p-1">
          {SPLIT_MODES.map((m) => (
            <label key={m} className="flex min-h-10 cursor-pointer items-center justify-center rounded-lg px-1 text-center text-xs has-[:checked]:bg-card has-[:checked]:font-semibold has-[:checked]:shadow">
              <input type="radio" name="mode" value={m} checked={mode === m} onChange={set("mode")} className="sr-only" />
              {SPLIT_LABEL[m]}
            </label>
          ))}
        </div>
        <ul className="flex flex-col gap-2">
          {travelers.map((t) => {
            const p = participantOf(t.id);
            const share = preview?.ok ? preview.shares.find((s) => s.user_id === t.id) : undefined;
            return (
              <li key={t.id} className="flex min-h-11 items-center gap-2">
                <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={p.on} className="size-5 accent-[var(--coral)]"
                    onChange={(e) => setV((x) => ({ ...x, participants: { ...x.participants, [t.id]: { ...p, on: e.target.checked } } }))} />
                  <span className="text-sm">{t.display_name}</span>
                </label>
                {mode !== "equal" && p.on && (
                  <input aria-label={`${SPLIT_LABEL[mode]} de ${t.display_name}`} inputMode="decimal" value={p.value} placeholder="0"
                    onChange={(e) => setV((x) => ({ ...x, participants: { ...x.participants, [t.id]: { ...p, value: e.target.value } } }))}
                    className="min-h-11 w-24 rounded-xl border border-line-strong bg-elev px-3 text-right text-base" />
                )}
                {mode !== "equal" && p.on && <span className="w-10 text-xs text-mute">{unit}</span>}
                <span className="w-20 text-right text-sm tabular-nums text-dim">{share ? formatMoney(share.base_minor, base) : ""}</span>
              </li>
            );
          })}
        </ul>
        {(errors.participants || (preview && !preview.ok)) && (
          <p className="text-xs text-error">{errors.participants ?? (preview && !preview.ok ? preview.error : "")}</p>
        )}
        {preview?.ok && v.currency !== base && <p className="text-xs text-mute">Total converti : {formatMoney(preview.baseAmountMinor, base)}</p>}
      </fieldset>
      <TextAreaField label="Notes" value={v.notes} onChange={set("notes")} maxLength={10000} />
      <Button type="submit" loading={saving} block>{isNew ? "Ajouter la dépense" : "Enregistrer"}</Button>
    </form>
  );
}
