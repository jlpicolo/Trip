"use client";

import { useId, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/Field";
import { readTableFile } from "@/lib/import/table";
import { importable, prepareImport, type ImportRow } from "@/lib/import/places";
import { JOURNAL_META } from "@/lib/journal";
import type { Place } from "@/lib/types/planning";

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

type Prepared = ReturnType<typeof prepareImport> & { fileName: string };

const STATUS: Record<ImportRow["status"], { label: string; tone: "success" | "warning" | "neutral" | "error" }> = {
  ok: { label: "Position précise", tone: "success" },
  approx: { label: "Position approximative", tone: "warning" },
  "no-position": { label: "À placer", tone: "neutral" },
  duplicate: { label: "Doublon ignoré", tone: "neutral" },
  error: { label: "Erreur", tone: "error" },
};

/**
 * Import d'une liste de lieux (CSV Google My Maps, CSV Excel, .xlsx). Rien n'est écrit avant
 * validation de l'aperçu ; aucune position n'est devinée.
 */
export function ImportPlaces({ destinations, existing, onImport }: {
  destinations: string[];
  existing: Place[];
  onImport: (rows: ImportRow[], withJournal: boolean, onProgress: (done: number, total: number) => void) => Promise<number>;
}) {
  const inputId = useId();
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [withJournal, setWithJournal] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function pick(file: File | null) {
    setError(null);
    setPrepared(null);
    if (!file) return;
    try {
      const table = await readTableFile(file);
      setPrepared({ ...prepareImport(table, { destinations, existing }), fileName: file.name });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const count = prepared ? prepared.rows.filter(importable).length : 0;
  return (
    <div className="flex flex-col gap-4">
      <FormError message={error} />
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-sm font-medium text-dim">Fichier (.csv ou .xlsx)</label>
        <input id={inputId} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => void pick(e.target.files?.[0] ?? null)} disabled={!!progress}
          className="min-h-11 w-full rounded-xl border border-line-strong bg-elev px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-card file:px-3 file:py-1.5 file:text-ink" />
        <p className="text-xs text-mute">
          Colonnes reconnues : Nom (obligatoire), Latitude, Longitude, Adresse, Catégorie, Pourquoi l&apos;ajouter, Note de
          vérification, Précision des coordonnées, Lien Google Maps… Sans coordonnées, le lieu est importé « à placer » :
          aucune position n&apos;est devinée.
        </p>
      </div>

      {prepared && (
        <>
          <div className="flex flex-wrap gap-2" aria-label="Résumé de l'import">
            {prepared.counts.ok > 0 && <Badge tone="success">{prepared.counts.ok} précis</Badge>}
            {prepared.counts.approx > 0 && <Badge tone="warning">{plural(prepared.counts.approx, "approximatif", "approximatifs")}</Badge>}
            {prepared.counts.noPosition > 0 && <Badge>{prepared.counts.noPosition} à placer</Badge>}
            {prepared.counts.duplicate > 0 && <Badge>{plural(prepared.counts.duplicate, "doublon ignoré", "doublons ignorés")}</Badge>}
            {prepared.counts.error > 0 && <Badge tone="error">{prepared.counts.error} en erreur</Badge>}
          </div>
          <ul className="flex max-h-[40dvh] flex-col divide-y divide-line overflow-y-auto rounded-xl border border-line" aria-label="Aperçu de l'import" tabIndex={0}>
            {prepared.rows.map((r) => (
              <li key={r.line} className="flex flex-col gap-0.5 px-3 py-2 text-sm">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 font-semibold">{r.name}</span>
                  <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                </span>
                <span className="text-xs text-dim">
                  Ligne {r.line} · {JOURNAL_META[r.journalCategory].label}{r.city ? ` · ${r.city}` : ""}
                  {r.message && r.status !== "approx" && r.status !== "ok" ? ` · ${r.message}` : ""}
                </span>
              </li>
            ))}
          </ul>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line-strong px-3">
            <input type="checkbox" checked={withJournal} onChange={(e) => setWithJournal(e.target.checked)} className="size-5 accent-[var(--coral)]" />
            <span className="text-sm">Ajouter aussi chaque lieu au carnet (envie à planifier)</span>
          </label>
          {prepared.counts.approx > 0 && (
            <p className="text-xs text-mute">Les positions approximatives sont signalées dans la fiche du lieu, pour les affiner (« Déplacer le point »).</p>
          )}
          <Button disabled={count === 0} loading={!!progress} block onClick={async () => {
            setProgress({ done: 0, total: count });
            try {
              await onImport(prepared.rows, withJournal, (done, total) => setProgress({ done, total }));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setProgress(null);
            }
          }}>
            {progress ? `Import… ${progress.done}/${progress.total}` : `Importer ${count} lieu${count > 1 ? "x" : ""}`}
          </Button>
        </>
      )}
    </div>
  );
}
