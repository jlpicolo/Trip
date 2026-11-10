"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, FormError, SelectField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { newId } from "@/lib/ids";
import { formatDate } from "@/lib/formatters";
import { fieldErrors, tripSchema, type TripInput } from "@/lib/validation/schemas";
import type { Destination } from "@/lib/types/trip";

// Le sélecteur de date natif affiche le format du téléphone (parfois mois/jour) : on rappelle la date en toutes lettres.
const longDate = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? formatDate(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : undefined);

const CURRENCIES = ["EUR", "JPY", "USD", "GBP", "CHF", "CAD", "KRW", "CNY", "THB", "AUD"];

export function TripForm({ initial, submitLabel, onSubmit }: {
  initial: TripInput;
  submitLabel: string;
  onSubmit: (value: TripInput) => Promise<void>;
}) {
  const [value, setValue] = useState<TripInput>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [newDest, setNewDest] = useState("");
  const [saving, setSaving] = useState(false);
  const zones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [value.timezone];
    }
  }, [value.timezone]);

  const set = <K extends keyof TripInput>(k: K, v: TripInput[K]) => setValue((x) => ({ ...x, [k]: v }));

  function addDestination() {
    const name = newDest.trim();
    if (!name) return;
    set("destinations", [...value.destinations, { id: newId(), name } as Destination & { id: string; name: string }]);
    setNewDest("");
  }

  function move(i: number, delta: number) {
    const list = [...value.destinations];
    const j = i + delta;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    set("destinations", list);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = tripSchema.safeParse(value);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      await onSubmit(parsed.data);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormError message={formError} />
      <Field label="Nom du voyage" value={value.name} onChange={(e) => set("name", e.target.value)} error={errors.name} maxLength={80} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Début" type="date" value={value.start_date} onChange={(e) => set("start_date", e.target.value)} error={errors.start_date}
          hint={longDate(value.start_date)} />
        <Field label="Fin (incluse)" type="date" value={value.end_date} onChange={(e) => set("end_date", e.target.value)} error={errors.end_date}
          hint={longDate(value.end_date)} />
      </div>
      <SelectField label="Fuseau horaire du voyage" value={value.timezone} onChange={(e) => set("timezone", e.target.value)}>
        {zones.map((z) => <option key={z} value={z}>{z}</option>)}
      </SelectField>
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Devise principale" value={value.base_currency} onChange={(e) => set("base_currency", e.target.value)}>
          {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
        </SelectField>
        <SelectField label="Devise secondaire" value={value.secondary_currency ?? ""}
          onChange={(e) => set("secondary_currency", e.target.value || null)}>
          <option value="">Aucune</option>
          {CURRENCIES.filter((c) => c !== value.base_currency).map((c) => <option key={c}>{c}</option>)}
        </SelectField>
      </div>

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-dim">Destinations (dans l&apos;ordre du voyage)</legend>
        {value.destinations.length === 0 && <p className="text-sm text-mute">Aucune destination pour l&apos;instant.</p>}
        <ol className="flex flex-col gap-2">
          {value.destinations.map((d, i) => (
            <li key={d.id} className="flex min-w-0 items-center gap-1 rounded-xl border border-line bg-elev py-1 pl-3 pr-1">
              <span className="w-5 text-xs text-mute">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{d.name}</span>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Monter ${d.name}`}
                className="grid size-9 place-items-center rounded-lg text-dim hover:bg-card disabled:opacity-30"><Icon name="back" size={16} className="rotate-90" /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === value.destinations.length - 1} aria-label={`Descendre ${d.name}`}
                className="grid size-9 place-items-center rounded-lg text-dim hover:bg-card disabled:opacity-30"><Icon name="back" size={16} className="-rotate-90" /></button>
              <button type="button" onClick={() => set("destinations", value.destinations.filter((x) => x.id !== d.id))}
                aria-label={`Retirer ${d.name}`} className="grid size-9 place-items-center rounded-lg text-dim hover:bg-card hover:text-error">
                <Icon name="close" size={16} /></button>
            </li>
          ))}
        </ol>
        <div className="flex gap-2">
          <input value={newDest} onChange={(e) => setNewDest(e.target.value)} placeholder="Ajouter une ville"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDestination(); } }}
            aria-label="Nouvelle destination" maxLength={80}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-elev px-3 text-base placeholder:text-mute focus:border-sakura focus:outline-none" />
          <Button type="button" variant="subtle" icon="plus" onClick={addDestination} disabled={!newDest.trim()}>Ajouter</Button>
        </div>
      </fieldset>

      <Button type="submit" loading={saving} block>{submitLabel}</Button>
    </form>
  );
}
