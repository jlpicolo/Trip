"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, FormError, SelectField } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { ACTIVE_TRIP_KEY, useTravelers, useTrips } from "@/hooks/useTrip";
import { getLocalDb } from "@/lib/db/schema";
import { exportTrip } from "@/lib/db/export";
import { expensesOfTrip, personalOfTrip, settlementsOfTrip } from "@/lib/db/budget";
import { duplicateTrip } from "@/lib/db/duplicate";
import { getEngine } from "@/lib/sync/client";
import { expensesCsv, exportFileName, personalCsv } from "@/lib/export";
import { formatDate, todayIn } from "@/lib/formatters";
import { toMessage } from "@/lib/errors/messages";
import type { Trip } from "@/lib/types/trip";

function download(content: string, type: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Voyage affiché, exports (sauvegarde de dernier recours) et duplication pour un autre voyage. */
export function DataSection({ trip, userId }: { trip: Trip; userId: string }) {
  const toast = useToast();
  const trips = useTrips() ?? [];
  const travelers = useTravelers(trip.group_id) ?? [];
  const db = getLocalDb();
  const today = todayIn(trip.timezone);
  const [dup, setDup] = useState<{ name: string; start: string } | null>(null);
  const [dupError, setDupError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const name = (id: string) => travelers.find((t) => t.id === id)?.display_name ?? "Ancien membre";

  async function run(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (e) {
      toast(toMessage(e), "error");
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      {trips.length > 1 && (
        <SelectField label="Voyage affiché" value={trip.id} onChange={(e) => void db.setMeta(ACTIVE_TRIP_KEY, e.target.value)}>
          {trips.map((t) => <option key={t.id} value={t.id}>{t.name} · {formatDate(t.start_date, { month: "short", year: "numeric" })}</option>)}
        </SelectField>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-sm">Exporter les données de ce voyage</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="subtle" icon="download" onClick={() => run(async () => {
            const data = await exportTrip(db, trip.id, userId, travelers);
            download(JSON.stringify(data, null, 2), "application/json", exportFileName(trip.name, today, "json"));
          })}>Tout (JSON)</Button>
          <Button variant="subtle" icon="download" onClick={() => run(async () => {
            const [e, s] = await Promise.all([expensesOfTrip(db, trip.id), settlementsOfTrip(db, trip.id)]);
            download(expensesCsv(e, s, trip.base_currency, name), "text/csv;charset=utf-8", exportFileName(trip.name, today, "csv", "pot-commun"));
          })}>Pot commun (CSV)</Button>
          <Button variant="subtle" icon="download" onClick={() => run(async () => {
            const p = (await personalOfTrip(db, trip.id)).filter((x) => x.owner_id === userId);
            download(personalCsv(p, trip.base_currency), "text/csv;charset=utf-8", exportFileName(trip.name, today, "csv", "mes-depenses"));
          })}>Mes dépenses (CSV)</Button>
        </div>
        <p className="text-xs text-mute">Sauvegarde lisible de ce qui est sur l&apos;appareil (fichiers des billets non inclus). Le CSV s&apos;ouvre dans Excel ou Google Sheets.</p>
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        {!dup ? (
          <>
            <Button variant="ghost" icon="copy" onClick={() => setDup({ name: `${trip.name} (copie)`, start: "" })}>Dupliquer ce voyage</Button>
            <p className="text-xs text-mute">Reprend destinations, lieux, carnet et planning (décalé) ; pas les billets, hébergements ni dépenses.</p>
          </>
        ) : (
          <form className="flex flex-col gap-3" noValidate onSubmit={async (e) => {
            e.preventDefault();
            if (!dup.name.trim()) return setDupError("Nom requis");
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dup.start)) return setDupError("Choisissez la date de début du nouveau voyage");
            setDupError(null);
            setBusy(true);
            try {
              const id = await duplicateTrip(getEngine(), db, trip, { name: dup.name.trim().slice(0, 80), start_date: dup.start });
              await db.setMeta(ACTIVE_TRIP_KEY, id);
              toast(`Voyage « ${dup.name.trim()} » créé et affiché.`);
              setDup(null);
            } catch (err) {
              setDupError(toMessage(err));
            } finally {
              setBusy(false);
            }
          }}>
            <FormError message={dupError} />
            <Field label="Nom du nouveau voyage" value={dup.name} maxLength={80} onChange={(e) => setDup({ ...dup, name: e.target.value })} />
            <Field label="Date de début" type="date" value={dup.start} onChange={(e) => setDup({ ...dup, start: e.target.value })}
              hint={dup.start ? `Le planning est décalé pour commencer le ${formatDate(dup.start, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}.` : undefined} />
            <div className="flex gap-2">
              <Button type="submit" loading={busy}>Créer le voyage</Button>
              <Button variant="ghost" onClick={() => setDup(null)}>Annuler</Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}
