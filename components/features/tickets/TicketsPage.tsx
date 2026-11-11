"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SectionTitle } from "@/components/ui/Card";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState, Spinner } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { useCurrentTrip } from "@/components/app/TripContext";
import { useTravelers } from "@/hooks/useTrip";
import { useTickets } from "./useTickets";
import { TransportCard } from "./TransportCard";
import { TransportDetails } from "./TransportDetails";
import { TransportForm, initialTransportForm } from "./TransportForm";
import { DocumentRow, fileState } from "./DocumentRow";
import { DocumentDetails } from "./DocumentDetails";
import { DocumentForm, initialDocumentForm } from "./DocumentForm";
import { FullscreenCode } from "./FullscreenCode";
import { getEngine, getFileSync } from "@/lib/sync/client";
import { getLocalDb } from "@/lib/db/schema";
import { addFileDocument, deleteDocument, deleteTransport, saveDocument, saveTransport } from "@/lib/db/tickets";
import { DOCUMENT_CATEGORY_LABEL, concerns, nextTransport, transportTitle } from "@/lib/tickets";
import { todayIn } from "@/lib/formatters";
import { nowHm } from "@/lib/dashboard";
import { toMessage } from "@/lib/errors/messages";
import { DOCUMENT_CATEGORIES, type TripDocument } from "@/lib/types/tickets";

type DrawerState =
  | null
  | { kind: "transport"; id: string }
  | { kind: "transport-form"; id?: string }
  | { kind: "doc"; id: string }
  | { kind: "doc-form"; id?: string; transportId?: string; date?: string };

function Tickets() {
  const { trip, userId } = useCurrentTrip();
  const travelers = useTravelers(trip.group_id) ?? [];
  const data = useTickets(trip.id);
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const engine = getEngine();
  const db = getLocalDb();
  const [mine, setMine] = useState(false);
  const [code, setCode] = useState<TripDocument | null>(null);

  const trajet = params.get("trajet");
  const [drawer, setDrawer] = useState<DrawerState>(trajet ? { kind: "transport", id: trajet } : null);
  // Page conservée entre deux visites (cacheComponents) : réagir à un nouveau ?trajet=.
  const [lastTrajet, setLastTrajet] = useState(trajet);
  if (trajet !== lastTrajet) {
    setLastTrajet(trajet);
    if (trajet) setDrawer({ kind: "transport", id: trajet });
  }
  const close = useCallback(() => {
    setDrawer(null);
    if (params.get("trajet")) router.replace("/billets", { scroll: false });
  }, [params, router]);
  const closeCode = useCallback(() => setCode(null), []);

  const today = todayIn(trip.timezone);
  const view = useMemo(() => {
    if (!data) return null;
    const transports = mine ? data.transports.filter((t) => concerns(t, userId)) : data.transports;
    const documents = mine ? data.documents.filter((d) => concerns(d, userId)) : data.documents;
    const next = nextTransport(transports, today, nowHm(trip.timezone));
    const loose = documents.filter((d) => !d.transport_id || !data.transports.some((t) => t.id === d.transport_id));
    return { transports, documents, next, loose };
  }, [data, mine, userId, today, trip.timezone]);

  if (!data || !view) return <Spinner />;

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

  const byId = new Map(data.transports.map((t) => [t.id, t]));
  const docById = new Map(data.documents.map((d) => [d.id, d]));
  const currentTransport = drawer && (drawer.kind === "transport" || drawer.kind === "transport-form") && drawer.id ? byId.get(drawer.id) : undefined;
  const currentDoc = drawer && (drawer.kind === "doc" || drawer.kind === "doc-form") && drawer.id ? docById.get(drawer.id) : undefined;
  const docsOf = (id: string) => data.documents.filter((d) => d.transport_id === id);
  const empty = data.transports.length === 0 && data.documents.length === 0;

  const title =
    drawer?.kind === "transport" ? (currentTransport ? transportTitle(currentTransport) : "Trajet introuvable")
    : drawer?.kind === "transport-form" ? (drawer.id ? "Modifier le trajet" : "Nouveau trajet")
    : drawer?.kind === "doc" ? (currentDoc?.title ?? "Document introuvable")
    : drawer?.kind === "doc-form" ? (drawer.id ? "Modifier le document" : "Nouveau document") : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Billets</h1>
          <p className="text-sm text-dim">Trajets, billets et réservations du voyage.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="subtle" icon="plus" onClick={() => setDrawer({ kind: "transport-form" })}>Trajet</Button>
          <Button icon="plus" onClick={() => setDrawer({ kind: "doc-form" })}>Document</Button>
        </div>
      </div>

      {!empty && (
        <div role="group" aria-label="Filtre" className="flex gap-2">
          {[{ v: false, l: "Tout le groupe" }, { v: true, l: "Mes billets" }].map((o) => (
            <button key={o.l} aria-pressed={mine === o.v} onClick={() => setMine(o.v)}
              className="min-h-11 rounded-full border border-line-strong px-4 text-sm aria-pressed:border-coral aria-pressed:bg-coral-soft aria-pressed:font-semibold aria-pressed:text-coral">
              {o.l}
            </button>
          ))}
        </div>
      )}

      {empty ? (
        <EmptyState icon="ticket" title="Aucun billet pour l'instant">
          Ajoutez un trajet (vol, shinkansen…) puis ses billets : PDF, capture d&apos;écran ou QR code. Ils seront consultables sans connexion.
        </EmptyState>
      ) : (
        <>
          <section aria-labelledby="titre-trajets">
            <SectionTitle><span id="titre-trajets">Trajets</span></SectionTitle>
            {view.transports.length === 0 ? (
              <p className="text-sm text-dim">{mine ? "Aucun trajet ne vous concerne." : "Aucun trajet."}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {view.transports.map((t) => (
                  <li key={t.id} className="flex flex-col gap-1">
                    {view.next?.id === t.id && <p className="text-xs font-semibold uppercase tracking-wider text-coral">Prochain trajet</p>}
                    <TransportCard transport={t} docs={docsOf(t.id)} travelers={travelers} past={t.departure_date < today}
                      onOpen={() => setDrawer({ kind: "transport", id: t.id })} onCode={setCode} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="titre-documents">
            <SectionTitle><span id="titre-documents">Documents</span></SectionTitle>
            {view.loose.length === 0 ? (
              <p className="text-sm text-dim">Tous les documents sont rattachés à un trajet.</p>
            ) : (
              DOCUMENT_CATEGORIES.filter((c) => view.loose.some((d) => d.category === c)).map((c) => (
                <div key={c} className="mb-4">
                  <h3 className="mb-2 text-sm font-semibold">{DOCUMENT_CATEGORY_LABEL[c]}</h3>
                  <ul className="flex flex-col gap-2">
                    {view.loose.filter((d) => d.category === c).map((d) => (
                      <DocumentRow key={d.id} doc={d} state={fileState(d, data.local, data.pending)}
                        onOpen={() => setDrawer({ kind: "doc", id: d.id })} onCode={() => setCode(d)} />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>
        </>
      )}

      <Drawer open={drawer !== null} title={title} onClose={close}>
        {drawer?.kind === "transport" && currentTransport && (
          <TransportDetails transport={currentTransport} docs={docsOf(currentTransport.id)} local={data.local} pending={data.pending} travelers={travelers}
            onEdit={() => setDrawer({ kind: "transport-form", id: currentTransport.id })}
            onDelete={async () => {
              if (await guard(() => deleteTransport(engine, db, currentTransport), "Trajet supprimé.")) close();
            }}
            onAddDocument={() => setDrawer({ kind: "doc-form", transportId: currentTransport.id, date: currentTransport.departure_date })}
            onOpenDocument={(id) => setDrawer({ kind: "doc", id })}
            onCode={setCode} />
        )}
        {drawer?.kind === "transport-form" && (
          <TransportForm key={drawer.id ?? "new"} trip={trip} travelers={travelers} isNew={!drawer.id}
            initial={initialTransportForm(currentTransport)}
            onSubmit={async (patch) => {
              const id = await saveTransport(engine, trip.id, patch, currentTransport);
              saved(currentTransport ? "Trajet enregistré." : "Trajet ajouté.");
              setDrawer({ kind: "transport", id });
            }} />
        )}
        {drawer?.kind === "doc" && currentDoc && (
          <DocumentDetails doc={currentDoc} state={fileState(currentDoc, data.local, data.pending)} travelers={travelers}
            transport={currentDoc.transport_id ? byId.get(currentDoc.transport_id) : undefined}
            stay={data.stays.find((h) => h.id === currentDoc.accommodation_id)}
            pendingError={data.pending.get(currentDoc.id)}
            onEdit={() => setDrawer({ kind: "doc-form", id: currentDoc.id })}
            onDelete={async () => {
              if (await guard(() => deleteDocument(engine, db, currentDoc), "Document supprimé.")) close();
            }}
            onFullscreen={() => setCode(currentDoc)}
            onDownload={() => guard(() => getFileSync().download(currentDoc), "Fichier disponible hors ligne.").then(() => undefined)}
            onForget={() => guard(() => getFileSync().forget(currentDoc.id), "Fichier retiré de l'appareil.").then(() => undefined)}
            onOpenTransport={(id) => setDrawer({ kind: "transport", id })} />
        )}
        {drawer?.kind === "doc-form" && (
          <DocumentForm key={drawer.id ?? "new"} trip={trip} travelers={travelers} transports={data.transports} stays={data.stays} isNew={!drawer.id}
            initial={initialDocumentForm(currentDoc, drawer.id ? undefined : {
              transport_id: drawer.transportId ?? "", date: drawer.date ?? "",
              category: drawer.transportId ? (byId.get(drawer.transportId)?.kind === "plane" ? "flight" : "train") : "confirmation",
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
        <FullscreenCode title={code.title} format={code.code_format} value={code.code_value}
          subtitle={code.transport_id && byId.get(code.transport_id) ? transportTitle(byId.get(code.transport_id)!) : null}
          onClose={closeCode} />
      )}
    </div>
  );
}

export function TicketsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Tickets />
    </Suspense>
  );
}
