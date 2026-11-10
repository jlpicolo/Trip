"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SectionTitle } from "@/components/ui/Card";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState, Spinner } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useCurrentTrip } from "@/components/app/TripContext";
import { useTravelers } from "@/hooks/useTrip";
import { useTickets } from "@/components/features/tickets/useTickets";
import { fileState } from "@/components/features/tickets/DocumentRow";
import { DocumentDetails } from "@/components/features/tickets/DocumentDetails";
import { DocumentForm, initialDocumentForm } from "@/components/features/tickets/DocumentForm";
import { FullscreenCode } from "@/components/features/tickets/FullscreenCode";
import { StayCard } from "./StayCard";
import { StayDetails } from "./StayDetails";
import { StayForm, initialStayForm } from "./StayForm";
import { getEngine, getFileSync } from "@/lib/sync/client";
import { getLocalDb } from "@/lib/db/schema";
import { placesOfTrip } from "@/lib/db/planning";
import { deleteStay, saveStay } from "@/lib/db/stays";
import { addFileDocument, deleteDocument, saveDocument } from "@/lib/db/tickets";
import { coversNight, nightsReport, toRanges, tripNights } from "@/lib/stays";
import { formatDayShort, todayIn } from "@/lib/formatters";
import { toMessage } from "@/lib/errors/messages";
import type { TripDocument } from "@/lib/types/tickets";

type DrawerState =
  | null
  | { kind: "stay"; id: string }
  | { kind: "stay-form"; id?: string }
  | { kind: "doc"; id: string }
  | { kind: "doc-form"; id?: string; stayId?: string };

function Stays() {
  const { trip } = useCurrentTrip();
  const travelers = useTravelers(trip.group_id) ?? [];
  const data = useTickets(trip.id);
  const places = useLiveQuery(() => placesOfTrip(getLocalDb(), trip.id), [trip.id]);
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const engine = getEngine();
  const db = getLocalDb();
  const [code, setCode] = useState<TripDocument | null>(null);
  const closeCode = useCallback(() => setCode(null), []);

  const sejour = params.get("sejour");
  const [drawer, setDrawer] = useState<DrawerState>(sejour ? { kind: "stay", id: sejour } : null);
  // Page conservée entre deux visites (cacheComponents) : réagir à un nouveau ?sejour=.
  const [lastSejour, setLastSejour] = useState(sejour);
  if (sejour !== lastSejour) {
    setLastSejour(sejour);
    if (sejour) setDrawer({ kind: "stay", id: sejour });
  }
  const close = useCallback(() => {
    setDrawer(null);
    if (params.get("sejour")) router.replace("/hebergements", { scroll: false });
  }, [params, router]);

  if (!data || !places) return <Spinner />;

  const saved = (msg: string) => toast(navigator.onLine ? msg : `${msg} Enregistré sur l'appareil, envoyé au retour du réseau.`);
  const guard = async (fn: () => Promise<unknown>, msg?: string) => {
    try {
      await fn();
      if (msg) saved(msg);
      return true;
    } catch (e) {
      toast(toMessage(e), "error");
      return false;
    }
  };

  const today = todayIn(trip.timezone);
  const stays = data.stays;
  const byId = new Map(stays.map((s) => [s.id, s]));
  const docById = new Map(data.documents.map((d) => [d.id, d]));
  const docsOf = (id: string) => data.documents.filter((d) => d.accommodation_id === id);
  const report = nightsReport(stays, trip.start_date, trip.end_date);
  const totalNights = tripNights(trip.start_date, trip.end_date).length;
  const current = drawer && (drawer.kind === "stay" || drawer.kind === "stay-form") && drawer.id ? byId.get(drawer.id) : undefined;
  const currentDoc = drawer && (drawer.kind === "doc" || drawer.kind === "doc-form") && drawer.id ? docById.get(drawer.id) : undefined;

  const title =
    drawer?.kind === "stay" ? (current?.name ?? "Hébergement introuvable")
    : drawer?.kind === "stay-form" ? (drawer.id ? "Modifier l'hébergement" : "Nouvel hébergement")
    : drawer?.kind === "doc" ? (currentDoc?.title ?? "Document introuvable")
    : drawer?.kind === "doc-form" ? (drawer.id ? "Modifier le document" : "Nouveau document") : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Hébergements</h1>
          {stays.length > 0 && (
            <p className="text-sm text-dim">{totalNights - report.uncovered.length} nuit{totalNights - report.uncovered.length > 1 ? "s" : ""} réservée{totalNights - report.uncovered.length > 1 ? "s" : ""} sur {totalNights}</p>
          )}
        </div>
        <Button icon="plus" onClick={() => setDrawer({ kind: "stay-form" })}>Hébergement</Button>
      </div>

      {stays.length === 0 ? (
        <EmptyState icon="bed" title="Aucun hébergement pour l'instant">
          Ajoutez hôtels, ryokans et appartements : nuits calculées, adresse en japonais pour le taxi, confirmations
          consultables hors ligne, et rattachement automatique aux journées du planning.
        </EmptyState>
      ) : (
        <>
          {(report.uncovered.length > 0 || report.overlaps.length > 0) && (
            <div className="flex flex-col gap-2 rounded-2xl border border-warning/40 bg-warning/10 p-3 text-sm" role="status">
              {report.uncovered.length > 0 && (
                <p className="flex gap-2"><Icon name="alert" size={18} className="shrink-0 text-warning" />
                  <span>
                    <strong>{report.uncovered.length} nuit{report.uncovered.length > 1 ? "s" : ""} sans hébergement</strong> :{" "}
                    {toRanges(report.uncovered).map((r) => (r.count === 1 ? `nuit du ${formatDayShort(r.from)}` : `nuits du ${formatDayShort(r.from)} au ${formatDayShort(r.to)}`)).join(" ; ")}
                  </span>
                </p>
              )}
              {report.overlaps.length > 0 && (
                <p className="flex gap-2"><Icon name="alert" size={18} className="shrink-0 text-warning" />
                  <span>
                    <strong>Plusieurs hébergements la même nuit</strong> :{" "}
                    {report.overlaps.map((o) => `${formatDayShort(o.date)} (${o.ids.map((id) => byId.get(id)?.name).join(", ")})`).join(" ; ")}.
                    Normal si le groupe se sépare, sinon vérifiez les dates.
                  </span>
                </p>
              )}
            </div>
          )}
          <section aria-labelledby="titre-sejours">
            <SectionTitle><span id="titre-sejours">Séjours</span></SectionTitle>
            <ul className="flex flex-col gap-3">
              {stays.map((s) => (
                <StayCard key={s.id} stay={s} docCount={docsOf(s.id).length} current={coversNight(s, today)} past={s.check_out_date <= today}
                  onOpen={() => setDrawer({ kind: "stay", id: s.id })} />
              ))}
            </ul>
          </section>
        </>
      )}

      <Drawer open={drawer !== null} title={title} onClose={close}>
        {drawer?.kind === "stay" && current && (
          <StayDetails stay={current} place={current.place_id ? places.get(current.place_id) : undefined} docs={docsOf(current.id)}
            local={data.local} pending={data.pending}
            onEdit={() => setDrawer({ kind: "stay-form", id: current.id })}
            onDelete={async () => {
              if (await guard(() => deleteStay(engine, db, current), "Hébergement supprimé.")) close();
            }}
            onAddDocument={() => setDrawer({ kind: "doc-form", stayId: current.id })}
            onOpenDocument={(id) => setDrawer({ kind: "doc", id })}
            onCode={setCode} />
        )}
        {drawer?.kind === "stay-form" && (
          <StayForm key={drawer.id ?? "new"} trip={trip} isNew={!drawer.id}
            initial={initialStayForm(current, current?.place_id ? places.get(current.place_id) : undefined)}
            onSubmit={async (input) => {
              const id = await saveStay(engine, db, trip.id, input, current);
              saved(current ? "Hébergement enregistré." : "Hébergement ajouté.");
              setDrawer({ kind: "stay", id });
            }} />
        )}
        {drawer?.kind === "doc" && currentDoc && (
          <DocumentDetails doc={currentDoc} state={fileState(currentDoc, data.local, data.pending)} travelers={travelers}
            pendingError={data.pending.get(currentDoc.id)}
            onEdit={() => setDrawer({ kind: "doc-form", id: currentDoc.id })}
            onDelete={async () => {
              if (await guard(() => deleteDocument(engine, db, currentDoc), "Document supprimé.")) {
                setDrawer(currentDoc.accommodation_id ? { kind: "stay", id: currentDoc.accommodation_id } : null);
              }
            }}
            onFullscreen={() => setCode(currentDoc)}
            onDownload={() => guard(() => getFileSync().download(currentDoc), "Fichier disponible hors ligne.").then(() => undefined)}
            onForget={() => guard(() => getFileSync().forget(currentDoc.id), "Fichier retiré de l'appareil.").then(() => undefined)}
            onOpenTransport={(id) => router.push(`/billets?trajet=${id}`)} />
        )}
        {drawer?.kind === "doc-form" && (
          <DocumentForm key={drawer.id ?? "new"} trip={trip} travelers={travelers} transports={data.transports} stays={stays} isNew={!drawer.id}
            initial={initialDocumentForm(currentDoc, drawer.id ? undefined : {
              accommodation_id: drawer.stayId ?? "", category: "hotel",
              date: drawer.stayId ? (byId.get(drawer.stayId)?.check_in_date ?? "") : "",
              title: drawer.stayId ? `Confirmation ${byId.get(drawer.stayId)?.name ?? ""}`.trim() : "",
            })}
            onSubmit={async (patch, file) => {
              const id = currentDoc
                ? await saveDocument(engine, trip.id, patch, currentDoc)
                : patch.kind === "file" && file
                  ? await addFileDocument(engine, db, trip.id, patch, file)
                  : await saveDocument(engine, trip.id, patch);
              saved(currentDoc ? "Document enregistré." : "Document ajouté.");
              setDrawer({ kind: "doc", id });
            }} />
        )}
      </Drawer>

      {code?.code_value && code.code_format && (
        <FullscreenCode title={code.title} format={code.code_format} value={code.code_value} onClose={closeCode} />
      )}
    </div>
  );
}

export function StaysPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Stays />
    </Suspense>
  );
}
