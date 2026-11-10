import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalDb } from "@/lib/db/schema";
import { SyncEngine } from "@/lib/sync/engine";
import { FileMissingError, FileSync, sha256Hex, type FileRemote } from "@/lib/sync/files";
import { NetworkError } from "@/lib/sync/remote";
import { addFileDocument, deleteDocument, deleteTransport, documentsOfTrip, saveDocument, saveTransport, transportsOfTrip } from "@/lib/db/tickets";
import { codeFormatFromScan, concerns, detectMime, nextTransport, safeFileName, sortTransports, storagePathFor, transportTitle } from "@/lib/tickets";
import { codeValueError, documentSchema, validEan13, type DocumentForm } from "@/lib/validation/document";
import { transportSchema, type TransportForm } from "@/lib/validation/transport";
import type { TripDocument } from "@/lib/types/tickets";
import { FakeServer } from "../helpers/fake-server";

const TRIP = "20000000-0000-0000-0000-000000000001";
const ALICE = "10000000-0000-4000-8000-00000000000a";
const BRUNO = "10000000-0000-4000-8000-00000000000b";

class FakeStorage {
  objects = new Map<string, Blob>();
  online = true;
  refuse: string | null = null;
  calls: string[] = [];
  remote(): FileRemote {
    return {
      upload: async (path, blob) => {
        this.calls.push(`upload ${path}`);
        if (!this.online) throw new NetworkError("hors ligne");
        if (this.refuse) throw new Error(this.refuse);
        if (!this.objects.has(path)) this.objects.set(path, blob);
      },
      download: async (path) => {
        if (!this.online) throw new NetworkError("hors ligne");
        const b = this.objects.get(path);
        if (!b) throw new FileMissingError();
        return b;
      },
    };
  }
}

const transportForm = (o: Partial<TransportForm> = {}): TransportForm => ({
  kind: "shinkansen", carrier: "JR", reference: "Nozomi 21", booking_ref: "", departure_date: "2027-03-20", departure_time: "09:12",
  departure_name: "Kyoto", arrival_date: "", arrival_time: "11:24", arrival_name: "Tokyo", seat_info: "", booking_url: "", notes: "", traveler_ids: [], ...o,
});
const docForm = (o: Partial<DocumentForm> = {}): DocumentForm => ({
  title: "Billet", category: "train", kind: "code", url: "", code_value: "ABC123", code_format: "qrcode", for_travelers: false,
  traveler_ids: [], date: "", transport_id: "", accommodation_id: "", notes: "", ...o,
});
const pdf = (text = "%PDF-1.4 billet") => new File([text], "Billet Nozomi été.pdf", { type: "application/pdf" });

describe("helpers billets", () => {
  it("titre, tri et prochain trajet", () => {
    expect(transportTitle({ kind: "plane", carrier: "JAL", reference: "JL46", departure_name: "Paris", arrival_name: "Osaka" })).toBe("JAL JL46 · Paris → Osaka");
    expect(transportTitle({ kind: "bus", carrier: null, reference: null, departure_name: null, arrival_name: null })).toBe("Bus");
    const list = [
      { id: "c", departure_date: "2027-03-20", departure_time: null },
      { id: "b", departure_date: "2027-03-20", departure_time: "09:00" },
      { id: "a", departure_date: "2027-03-09", departure_time: "15:40" },
    ];
    expect(sortTransports(list).map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(nextTransport(list, "2027-03-09", "15:00")?.id).toBe("a");
    expect(nextTransport(list, "2027-03-09", "16:00")?.id).toBe("b");
    expect(nextTransport(list, "2027-03-20", "10:00")?.id).toBe("c"); // sans heure : encore à venir ce jour-là
    expect(nextTransport(list, "2027-03-21", "00:00")).toBeNull();
  });

  it("voyageurs concernés : vide = tout le groupe", () => {
    expect(concerns({ traveler_ids: [] }, ALICE)).toBe(true);
    expect(concerns({ traveler_ids: [BRUNO] }, ALICE)).toBe(false);
    expect(concerns({ traveler_ids: [ALICE, BRUNO] }, ALICE)).toBe(true);
  });

  it("noms et types de fichiers", () => {
    expect(safeFileName("Billet Nozomi été.PDF")).toBe("Billet-Nozomi-ete.pdf");
    expect(safeFileName("../../x")).toBe("x");
    expect(storagePathFor(TRIP, "d1", "a b.png")).toBe(`${TRIP}/d1/a-b.png`);
    expect(detectMime({ name: "IMG_1.HEIC", type: "" })).toBe("image/heic");
    expect(detectMime({ name: "x.jpg", type: "image/jpeg" })).toBe("image/jpeg");
    expect(detectMime({ name: "x.docx", type: "application/msword" })).toBeNull();
  });

  it("formats lus par le scanner", () => {
    expect(codeFormatFromScan("QRCode")).toBe("qrcode");
    expect(codeFormatFromScan("AztecCode")).toBe("azteccode");
    expect(codeFormatFromScan("PDF417")).toBe("pdf417");
    expect(codeFormatFromScan("EAN13")).toBe("ean13");
    expect(codeFormatFromScan("MaxiCode")).toBeNull();
  });
});

describe("validation", () => {
  const bounds = { start: "2027-03-09", end: "2027-03-30" };
  it("trajet : dates bornées au voyage (± 1 jour) et arrivée cohérente", () => {
    expect(transportSchema(bounds).safeParse(transportForm()).success).toBe(true);
    expect(transportSchema(bounds).safeParse(transportForm({ departure_date: "2027-03-08" })).success).toBe(true);
    expect(transportSchema(bounds).safeParse(transportForm({ departure_date: "2027-03-01" })).success).toBe(false);
    expect(transportSchema(bounds).safeParse(transportForm({ departure_time: "23:00", arrival_time: "07:00" })).success).toBe(false);
    expect(transportSchema(bounds).safeParse(transportForm({ departure_time: "23:00", arrival_time: "07:00", arrival_date: "2027-03-21" })).success).toBe(true);
    expect(transportSchema(bounds).safeParse(transportForm({ arrival_date: "2027-03-19" })).success).toBe(false);
    const ok = transportSchema(bounds).parse(transportForm({ carrier: "  ", traveler_ids: [BRUNO, ALICE, BRUNO] }));
    expect(ok.carrier).toBeNull();
    expect(ok.traveler_ids).toEqual([ALICE, BRUNO]);
  });

  it("document : contenu selon le type", () => {
    expect(documentSchema.safeParse(docForm()).success).toBe(true);
    expect(documentSchema.safeParse(docForm({ code_value: " " })).success).toBe(false);
    expect(documentSchema.safeParse(docForm({ kind: "link", url: "ftp://x" })).success).toBe(false);
    const link = documentSchema.parse(docForm({ kind: "link", url: "https://jr.example/r", code_value: "reste" }));
    expect(link).toMatchObject({ url: "https://jr.example/r", code_value: null, code_format: null, scope: "group" });
    expect(documentSchema.safeParse(docForm({ for_travelers: true })).success).toBe(false);
    expect(documentSchema.parse(docForm({ for_travelers: true, traveler_ids: [ALICE] }))).toMatchObject({ scope: "travelers", traveler_ids: [ALICE] });
  });

  it("codes-barres : EAN-13 avec clé, Code 39 restreint", () => {
    expect(validEan13("4006381333931")).toBe(true);
    expect(validEan13("4006381333932")).toBe(false);
    expect(validEan13("400638133393")).toBe(true);
    expect(codeValueError("code39", "abc")).not.toBeNull();
    expect(codeValueError("code39", "ABC-12")).toBeNull();
    expect(codeValueError("qrcode", "n'importe quoi ✓")).toBeNull();
  });
});

describe("billets : données locales, fichiers et synchro", () => {
  let server: FakeServer;
  let storage: FakeStorage;
  let n = 0;
  const dbs: LocalDb[] = [];
  const device = (user: string) => {
    const db = new LocalDb(`tickets-${++n}`);
    dbs.push(db);
    const files = new FileSync(db, storage.remote());
    const engine = new SyncEngine(db, server.remote(user), undefined, () => files.uploadPending());
    return { db, files, engine };
  };
  const docs = (db: LocalDb) => documentsOfTrip(db, TRIP);

  beforeEach(() => {
    server = new FakeServer();
    storage = new FakeStorage();
  });
  afterEach(async () => {
    await Promise.all(dbs.splice(0).map((d) => d.delete()));
  });

  it("un fichier ajouté hors ligne est consultable tout de suite, puis envoyé AVANT sa fiche", async () => {
    const a = device("alice");
    storage.online = false;
    const patch = documentSchema.parse(docForm({ kind: "file", title: "Billet Nozomi" }));
    const id = await addFileDocument(a.engine, a.db, TRIP, patch, pdf());
    expect((await a.db.files.get(id))?.blob.size).toBe(pdf().size);
    await a.engine.sync(TRIP);
    expect(a.engine.getStatus()).toMatchObject({ online: false, pendingFiles: 1, pending: 1 });

    storage.online = true;
    await a.engine.sync(TRIP);
    expect(a.engine.getStatus()).toMatchObject({ online: true, pendingFiles: 0, pending: 0 });
    const [doc] = await docs(a.db);
    expect(doc).toMatchObject({ kind: "file", mime_type: "application/pdf", storage_path: `${TRIP}/${id}/Billet-Nozomi-ete.pdf`, sha256: await sha256Hex(pdf()) });
    expect(storage.objects.has(doc.storage_path!)).toBe(true);
  });

  it("un autre appareil télécharge le fichier, vérifie son empreinte, et le garde hors ligne", async () => {
    const a = device("alice");
    const b = device("bruno");
    const id = await addFileDocument(a.engine, a.db, TRIP, documentSchema.parse(docForm({ kind: "file" })), pdf());
    await a.engine.sync(TRIP);
    await b.engine.sync(TRIP);
    expect(await b.db.files.get(id)).toBeUndefined();
    expect(await b.files.autoDownload(TRIP, "bruno")).toBe(1);
    const local = await b.db.files.get(id);
    expect(await local!.blob.text()).toBe("%PDF-1.4 billet");
    expect(local!.blob.type).toBe("application/pdf");
    storage.online = false;
    expect(await b.files.autoDownload(TRIP, "bruno")).toBe(0); // déjà présent : aucun appel réseau
  });

  it("fichier altéré ou absent du stockage : erreur claire, rien d'enregistré", async () => {
    const a = device("alice");
    const b = device("bruno");
    const id = await addFileDocument(a.engine, a.db, TRIP, documentSchema.parse(docForm({ kind: "file" })), pdf());
    await a.engine.sync(TRIP);
    await b.engine.sync(TRIP);
    const doc = (await docs(b.db))[0] as TripDocument;
    storage.objects.set(doc.storage_path!, new Blob(["autre contenu"]));
    await expect(b.files.download(doc)).rejects.toThrow(/altéré/);
    storage.objects.clear();
    await expect(b.files.download(doc)).rejects.toBeInstanceOf(FileMissingError);
    expect(await b.db.files.get(id)).toBeUndefined();
  });

  it("envoi refusé : l'erreur est conservée et la synchro des fiches continue", async () => {
    const a = device("alice");
    storage.refuse = "mime type not allowed";
    const id = await addFileDocument(a.engine, a.db, TRIP, documentSchema.parse(docForm({ kind: "file" })), pdf());
    await a.engine.sync(TRIP);
    expect((await a.db.uploads.get(id))?.last_error).toMatch(/mime/);
    expect(a.engine.getStatus()).toMatchObject({ pending: 0, pendingFiles: 1 });
    await expect(a.files.forget(id)).rejects.toThrow(/pas encore été envoyé/);
    storage.refuse = null;
    await a.engine.sync(TRIP);
    expect(await a.db.uploads.count()).toBe(0);
  });

  it("téléchargement automatique : billets du voyageur, jamais les pièces d'identité", async () => {
    const a = device("alice");
    const b = device("bruno");
    const add = (o: Partial<DocumentForm>) => addFileDocument(a.engine, a.db, TRIP, documentSchema.parse(docForm({ kind: "file", ...o })), pdf());
    const groupe = await add({ title: "Groupe" });
    const passport = await add({ title: "Passeport", category: "id" });
    const pourAlice = await add({ title: "Alice", for_travelers: true, traveler_ids: [ALICE] });
    const pourBruno = await add({ title: "Bruno", for_travelers: true, traveler_ids: [BRUNO] });
    await a.engine.sync(TRIP);
    await b.engine.sync(TRIP);
    await b.files.autoDownload(TRIP, BRUNO);
    const present = new Set(await b.db.files.toCollection().primaryKeys());
    expect([groupe, passport, pourAlice, pourBruno].map((x) => present.has(x))).toEqual([true, false, false, true]);
    // À la demande, la pièce d'identité reste téléchargeable.
    await b.files.download((await b.db.data("documents").get(passport)) as TripDocument);
    expect(await b.db.files.get(passport)).toBeDefined();
    await b.files.forget(passport);
    expect(await b.db.files.get(passport)).toBeUndefined();
  });

  it("trajets, codes et suppression : le trajet supprimé conserve ses billets, détachés", async () => {
    const a = device("alice");
    const b = device("bruno");
    const tid = await saveTransport(a.engine, TRIP, transportSchema({ start: "2027-03-09", end: "2027-03-30" }).parse(transportForm()));
    const did = await saveDocument(a.engine, TRIP, documentSchema.parse(docForm({ transport_id: tid })));
    await a.engine.sync(TRIP);
    await b.engine.sync(TRIP);
    expect((await transportsOfTrip(b.db, TRIP)).map((t) => t.reference)).toEqual(["Nozomi 21"]);
    expect(await docs(b.db)).toMatchObject([{ id: did, kind: "code", code_value: "ABC123", transport_id: tid }]);

    await deleteTransport(b.engine, b.db, (await transportsOfTrip(b.db, TRIP))[0]);
    await b.engine.sync(TRIP);
    await a.engine.sync(TRIP);
    expect(await transportsOfTrip(a.db, TRIP)).toEqual([]);
    expect(await docs(a.db)).toMatchObject([{ id: did, transport_id: null }]);

    await deleteDocument(a.engine, a.db, (await docs(a.db))[0]);
    await a.engine.sync(TRIP);
    await b.engine.sync(TRIP);
    expect(await docs(b.db)).toEqual([]);
  });

  it("modifier un document fichier ne change ni son type ni son fichier", async () => {
    const a = device("alice");
    const id = await addFileDocument(a.engine, a.db, TRIP, documentSchema.parse(docForm({ kind: "file" })), pdf());
    const doc = (await a.db.data("documents").get(id)) as TripDocument;
    await saveDocument(a.engine, TRIP, documentSchema.parse(docForm({ kind: "code", title: "Renommé" })), doc);
    expect(await a.db.data("documents").get(id)).toMatchObject({ title: "Renommé", kind: "file", code_value: null, storage_path: doc.storage_path });
  });

  it("fichiers refusés : format, vide, trop lourd", async () => {
    const a = device("alice");
    const p = documentSchema.parse(docForm({ kind: "file" }));
    await expect(addFileDocument(a.engine, a.db, TRIP, p, new File(["x"], "a.docx", { type: "application/msword" }))).rejects.toThrow(/Format/);
    await expect(addFileDocument(a.engine, a.db, TRIP, p, new File([], "a.pdf", { type: "application/pdf" }))).rejects.toThrow(/vide/);
    const big = new File([new Uint8Array(25 * 1024 * 1024 + 1)], "a.pdf", { type: "application/pdf" });
    await expect(addFileDocument(a.engine, a.db, TRIP, p, big)).rejects.toThrow(/25 Mo/);
    expect(await a.db.files.count()).toBe(0);
  });
});
