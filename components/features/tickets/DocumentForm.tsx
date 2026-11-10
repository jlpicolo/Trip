"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, FormError, SelectField, TextAreaField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { TravelerPicker } from "./TravelerPicker";
import { CodeView } from "./CodeView";
import { CODE_FORMAT_LABEL, DOCUMENT_CATEGORY_LABEL, formatBytes, transportTitle } from "@/lib/tickets";
import { checkFile } from "@/lib/db/tickets";
import { scanCodeImage } from "@/lib/codes";
import { formatDayShort, tripDates } from "@/lib/formatters";
import { fieldErrors } from "@/lib/validation/schemas";
import { documentSchema, type DocumentForm as FormValues, type DocumentPatch } from "@/lib/validation/document";
import { CODE_FORMATS, DOCUMENT_CATEGORIES, type Transport, type TripDocument } from "@/lib/types/tickets";
import type { Traveler } from "@/hooks/useTrip";
import type { Trip } from "@/lib/types/trip";

export function initialDocumentForm(d?: TripDocument, draft?: Partial<FormValues>): FormValues {
  return {
    title: d?.title ?? "",
    category: d?.category ?? "confirmation",
    kind: d?.kind ?? "file",
    url: d?.url ?? "",
    code_value: d?.code_value ?? "",
    code_format: d?.code_format ?? "qrcode",
    for_travelers: d?.scope === "travelers",
    traveler_ids: d?.traveler_ids ?? [],
    date: d?.date ?? "",
    transport_id: d?.transport_id ?? "",
    notes: d?.notes ?? "",
    ...draft,
  };
}

const KIND_LABEL = { file: "Fichier (PDF, image)", link: "Lien", code: "QR / code-barres" } as const;

export function DocumentForm({ trip, travelers, transports, initial, isNew, onSubmit }: {
  trip: Trip;
  travelers: Traveler[];
  transports: Transport[];
  initial: FormValues;
  isNew: boolean;
  onSubmit: (patch: DocumentPatch, file: File | null) => Promise<void>;
}) {
  const [v, setV] = useState(initial);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scan, setScan] = useState<{ state: "idle" | "busy" | "ok" | "none" | "error"; message?: string }>({ state: "idle" });
  const fileId = useId();
  const scanId = useId();
  const set = (k: keyof FormValues) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const dates = tripDates(trip.start_date, trip.end_date);

  function pickFile(f: File | null) {
    setErrors((x) => ({ ...x, file: "" }));
    if (!f) return setFile(null);
    try {
      checkFile(f);
      setFile(f);
      setV((x) => ({ ...x, title: x.title || f.name.replace(/\.[^.]+$/, "").slice(0, 160) }));
    } catch (e) {
      setFile(null);
      setErrors((x) => ({ ...x, file: (e as Error).message }));
    }
  }

  async function scanImage(f: File | null) {
    if (!f) return;
    setScan({ state: "busy" });
    try {
      const found = await scanCodeImage(f);
      if (!found) return setScan({ state: "none", message: "Aucun code reconnu dans cette image : recadrez-la sur le code, ou saisissez son contenu." });
      setV((x) => ({ ...x, code_value: found.value, code_format: found.format }));
      setScan({ state: "ok", message: `${CODE_FORMAT_LABEL[found.format]} reconnu.` });
    } catch {
      setScan({ state: "error", message: "Lecture impossible sur cet appareil : saisissez le contenu du code." });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = documentSchema.safeParse(v);
    const errs = parsed.success ? {} : fieldErrors(parsed.error);
    if (isNew && v.kind === "file" && !file) errs.file = "Choisissez un fichier";
    if (!parsed.success || Object.keys(errs).length > 0) {
      setErrors(errs);
      setFormError("Vérifiez les champs signalés.");
      return;
    }
    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      await onSubmit(parsed.data, file);
    } catch (err) {
      setFormError((err as Error).message);
      setSaving(false);
    }
  }

  const codeOk = v.kind === "code" && v.code_value.trim() && !errors.code_value;
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormError message={formError} />
      {isNew ? (
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-dim">Type de document</legend>
          <div className="grid grid-cols-3 gap-2">
            {(["file", "code", "link"] as const).map((k) => (
              <label key={k} className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-line-strong px-2 text-center text-sm has-[:checked]:border-coral has-[:checked]:bg-coral-soft has-[:checked]:font-semibold">
                <input type="radio" name="kind" value={k} checked={v.kind === k} onChange={set("kind")} className="sr-only" />
                {KIND_LABEL[k]}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="text-sm text-dim">Type : {KIND_LABEL[v.kind as keyof typeof KIND_LABEL]}</p>
      )}

      {v.kind === "file" && isNew && (
        <div className="flex flex-col gap-1">
          <label htmlFor={fileId} className="text-sm font-medium text-dim">Fichier</label>
          <input id={fileId} type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,.heic,.heif,.pdf"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)} aria-invalid={errors.file ? true : undefined}
            className="min-h-11 w-full rounded-xl border border-line-strong bg-elev px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-card file:px-3 file:py-1.5 file:text-ink" />
          <p className={`text-xs ${errors.file ? "text-error" : "text-mute"}`}>
            {errors.file || (file ? `${file.name} · ${formatBytes(file.size)}` : "PDF, JPEG, PNG, WebP ou HEIC, 25 Mo maximum. Sur téléphone : photo ou capture d'écran.")}
          </p>
        </div>
      )}

      {v.kind === "link" && (
        <Field label="Adresse du lien" type="url" inputMode="url" value={v.url} onChange={set("url")} error={errors.url} placeholder="https://…" />
      )}

      {v.kind === "code" && (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor={scanId} className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-3 text-sm font-semibold hover:bg-elev">
              <Icon name="camera" size={18} /> {scan.state === "busy" ? "Lecture du code…" : "Lire le code depuis une image"}
            </label>
            <input id={scanId} type="file" accept="image/*" className="sr-only" onChange={(e) => void scanImage(e.target.files?.[0] ?? null)} />
            {scan.message && <p role="status" className={`text-xs ${scan.state === "ok" ? "text-success" : "text-warning"}`}>{scan.message}</p>}
          </div>
          <SelectField label="Format du code" value={v.code_format} onChange={set("code_format")} error={errors.code_format}>
            {CODE_FORMATS.map((f) => <option key={f} value={f}>{CODE_FORMAT_LABEL[f]}</option>)}
          </SelectField>
          <TextAreaField label="Contenu du code" value={v.code_value} onChange={set("code_value")} error={errors.code_value} maxLength={4000}
            hint="Texte exact encodé dans le code (lu depuis une image, ou recopié)." spellCheck={false} autoComplete="off" />
          {codeOk && (
            <div className="rounded-xl border border-line bg-elev p-3">
              <p className="mb-2 text-xs text-mute">Aperçu</p>
              <CodeView format={v.code_format as (typeof CODE_FORMATS)[number]} value={v.code_value.trim()} label="Aperçu du code" />
            </div>
          )}
        </>
      )}

      <Field label="Titre" value={v.title} onChange={set("title")} error={errors.title} maxLength={160} placeholder="Billet Shinkansen Kyoto → Tokyo" />
      <SelectField label="Catégorie" value={v.category} onChange={set("category")} error={errors.category}>
        {DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{DOCUMENT_CATEGORY_LABEL[c]}</option>)}
      </SelectField>
      {transports.length > 0 && (
        <SelectField label="Trajet associé" value={v.transport_id} onChange={set("transport_id")}>
          <option value="">Aucun</option>
          {transports.map((t) => <option key={t.id} value={t.id}>{formatDayShort(t.departure_date)} · {transportTitle(t)}</option>)}
        </SelectField>
      )}
      <SelectField label="Journée" value={v.date} onChange={set("date")} error={errors.date}>
        <option value="">Aucune journée précise</option>
        {dates.map((d) => <option key={d} value={d}>{formatDayShort(d)}</option>)}
      </SelectField>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line-strong px-3">
        <input type="checkbox" checked={v.for_travelers} onChange={(e) => setV((x) => ({ ...x, for_travelers: e.target.checked }))} className="size-5 accent-[var(--coral)]" />
        <span className="text-sm">Ne concerne que certains voyageurs</span>
      </label>
      {v.for_travelers && (
        <TravelerPicker legend="Voyageurs concernés" travelers={travelers} value={v.traveler_ids} error={errors.traveler_ids}
          onChange={(ids) => setV((x) => ({ ...x, traveler_ids: ids }))} hint="Le document reste visible par tout le groupe (droits égaux) ; il est classé dans « Mes billets » des voyageurs cochés." />
      )}
      <TextAreaField label="Notes" value={v.notes} onChange={set("notes")} maxLength={10000} />
      <Button type="submit" loading={saving} block>{isNew ? "Ajouter le document" : "Enregistrer"}</Button>
    </form>
  );
}
