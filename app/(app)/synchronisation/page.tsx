"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, SectionTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { useTripContext } from "@/components/app/TripContext";
import { useSyncStatus } from "@/hooks/useSync";
import { useTravelers } from "@/hooks/useTrip";
import { getEngine } from "@/lib/sync/client";
import { getLocalDb } from "@/lib/db/schema";
import { formatRelative } from "@/lib/formatters";
import { toMessage } from "@/lib/errors/messages";
import type { ConflictRecord, JsonValue } from "@/lib/types/sync";

const TABLE_LABEL: Record<string, string> = {
  trips: "Voyage", trip_days: "Journée", places: "Lieu", activities: "Activité", transports: "Transport",
  accommodations: "Hébergement", journal_entries: "Carnet", documents: "Document", expenses: "Dépense commune",
  settlements: "Remboursement", personal_expenses: "Dépense personnelle",
};

const FIELD_LABEL: Record<string, string> = {
  title: "Titre", name: "Nom", notes: "Notes", description: "Description", date: "Date", start_time: "Heure de début",
  end_time: "Heure de fin", city: "Ville", address: "Adresse", category: "Catégorie", start_date: "Date de début",
  end_date: "Date de fin", destinations: "Destinations", timezone: "Fuseau horaire", base_currency: "Devise principale",
  secondary_currency: "Devise secondaire", amount_minor: "Montant", is_done: "Réalisée",
};

const show = (v: JsonValue | undefined) =>
  v === null || v === undefined || v === "" ? "(vide)" : typeof v === "object" ? JSON.stringify(v) : String(v);

export default function SyncPage() {
  const { trip } = useTripContext();
  const status = useSyncStatus();
  const toast = useToast();
  const db = getLocalDb();
  const conflicts = useLiveQuery(() => db.conflicts.toArray(), []);
  const rejected = useLiveQuery(() => db.rejected.toArray(), []);
  const pending = useLiveQuery(() => db.outbox.orderBy("seq").toArray(), []);
  const travelers = useTravelers(trip?.group_id);
  const [busy, setBusy] = useState(false);

  async function syncNow() {
    setBusy(true);
    try {
      await getEngine().refreshDirectory();
      await getEngine().sync(trip?.id ?? null);
      const s = getEngine().getStatus();
      toast(s.online ? "Synchronisation terminée." : "Hors ligne : modifications conservées sur l'appareil.", s.online ? "success" : "info");
    } catch (e) {
      toast(toMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col">
      <h1 className="mb-4 text-2xl font-bold">Synchronisation</h1>
      <Card className="flex flex-col gap-3">
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-dim">Réseau</dt>
          <dd>{status.online ? <Badge tone="success">En ligne</Badge> : <Badge tone="warning">Hors ligne</Badge>}</dd>
          <dt className="text-dim">Dernière synchronisation</dt>
          <dd>{status.lastSyncAt ? formatRelative(status.lastSyncAt) : "Jamais"}</dd>
          <dt className="text-dim">En attente d&apos;envoi</dt>
          <dd>{status.pending}</dd>
          <dt className="text-dim">À vérifier</dt>
          <dd>{status.conflicts + status.rejected}</dd>
        </dl>
        {status.lastError && <p className="text-sm text-warning">{status.lastError}</p>}
        <Button icon="sync" onClick={syncNow} loading={busy || status.syncing}>Synchroniser maintenant</Button>
      </Card>

      <SectionTitle>Conflits</SectionTitle>
      {!conflicts?.length ? (
        <Card className="text-sm text-dim">Aucun conflit. Les modifications simultanées de champs différents sont fusionnées automatiquement.</Card>
      ) : (
        <div className="flex flex-col gap-3">
          {conflicts.map((c) => (
            <ConflictCard key={c.id} conflict={c}
              authorName={travelers?.find((t) => t.id === c.server_row.updated_by)?.display_name ?? "un autre voyageur"} />
          ))}
        </div>
      )}

      <SectionTitle>Modifications refusées par le serveur</SectionTitle>
      {!rejected?.length ? (
        <Card className="text-sm text-dim">Aucune.</Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {rejected.map((r) => (
            <li key={r.id}>
              <Card className="flex flex-col gap-2 text-sm">
                <p><Badge tone="error">{TABLE_LABEL[r.table] ?? r.table}</Badge> <span className="ml-1">{show(r.data.title ?? r.data.name)}</span></p>
                <p className="text-dim">Motif : {r.reason}</p>
                <Button variant="ghost" onClick={() => getEngine().dismissRejected(r.id!)}>J&apos;ai compris</Button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <SectionTitle>En attente d&apos;envoi</SectionTitle>
      {!pending?.length ? (
        <Card className="text-sm text-dim">Tout est envoyé.</Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line text-sm">
            {pending.map((p) => (
              <li key={p.mutation_id} className="flex justify-between px-4 py-2">
                <span>{TABLE_LABEL[p.table] ?? p.table} · {p.op === "insert" ? "création" : p.op === "update" ? "modification" : "suppression"}</span>
                <span className="text-mute">{formatRelative(p.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function ConflictCard({ conflict: c, authorName }: { conflict: ConflictRecord; authorName: string }) {
  const toast = useToast();
  const [choices, setChoices] = useState<Record<string, "local" | "server">>({});
  const title = show(c.server_row.title ?? c.server_row.name);
  const done = async (ch: Record<string, "local" | "server">) => {
    await getEngine().resolveConflict(c.id, ch);
    toast("Conflit résolu.");
  };

  if (c.kind === "delete_vs_update" || c.kind === "update_vs_delete") {
    const deletedByMe = c.kind === "delete_vs_update";
    return (
      <Card className="flex flex-col gap-3 text-sm">
        <p><Badge tone="warning">{TABLE_LABEL[c.table]}</Badge> <strong className="ml-1">{title}</strong></p>
        <p className="text-dim">
          {deletedByMe
            ? `Vous l'avez supprimé, mais ${authorName} l'a modifié entre-temps. Il a été conservé.`
            : `Vous l'avez modifié, mais ${authorName} l'a supprimé entre-temps.`}
        </p>
        <div className="flex gap-2">
          <Button className="flex-1" variant={deletedByMe ? "danger" : "primary"}
            onClick={() => done(deletedByMe ? { _delete: "local" } : { _restore: "local" })}>
            {deletedByMe ? "Supprimer quand même" : "Recréer avec mes modifications"}
          </Button>
          <Button className="flex-1" variant="ghost" onClick={() => done({})}>
            {deletedByMe ? "Le garder" : "Accepter la suppression"}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3 text-sm">
      <p><Badge tone="warning">{TABLE_LABEL[c.table]}</Badge> <strong className="ml-1">{title}</strong></p>
      <p className="text-dim">Modifié en même temps par vous et par {authorName}. Choisissez la valeur à garder pour chaque champ.</p>
      {c.fields.map((f) => (
        <fieldset key={f} className="flex flex-col gap-2">
          <legend className="mb-1 font-medium">{FIELD_LABEL[f] ?? f}</legend>
          {(["local", "server"] as const).map((side) => (
            <label key={side} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 ${choices[f] === side ? "border-vermillion bg-vermillion-soft" : "border-line-strong"}`}>
              <input type="radio" name={`${c.id}-${f}`} checked={choices[f] === side} onChange={() => setChoices((x) => ({ ...x, [f]: side }))} />
              <span className="text-dim">{side === "local" ? "Ma version :" : `Version de ${authorName} :`}</span>
              <span className="truncate">{show(side === "local" ? c.local_patch[f] : c.server_row[f])}</span>
            </label>
          ))}
        </fieldset>
      ))}
      <Button disabled={c.fields.some((f) => !choices[f])} onClick={() => done(choices)}>Valider</Button>
    </Card>
  );
}
