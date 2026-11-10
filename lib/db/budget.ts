import type { LocalDb } from "./schema";
import type { SyncEngine } from "@/lib/sync/engine";
import { convertMinor } from "@/lib/budget/money";
import type { Expense, PersonalExpense, Settlement } from "@/lib/types/budget";
import type { RowData } from "@/lib/types/sync";

const alive = <T extends { deleted_at: string | null }>(rows: T[]) => rows.filter((r) => !r.deleted_at);
const byDateDesc = <T extends { date: string; created_at?: unknown }>(a: T, b: T) =>
  b.date.localeCompare(a.date) || String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));

export async function expensesOfTrip(db: LocalDb, tripId: string): Promise<Expense[]> {
  return alive((await db.data("expenses").where("trip_id").equals(tripId).toArray()) as Expense[]).sort(byDateDesc);
}

export async function settlementsOfTrip(db: LocalDb, tripId: string): Promise<Settlement[]> {
  return alive((await db.data("settlements").where("trip_id").equals(tripId).toArray()) as Settlement[]).sort(byDateDesc);
}

export async function personalOfTrip(db: LocalDb, tripId: string): Promise<PersonalExpense[]> {
  return alive((await db.data("personal_expenses").where("trip_id").equals(tripId).toArray()) as PersonalExpense[]).sort(byDateDesc);
}

export type ExpensePatch = Pick<Expense, "title" | "category" | "date" | "amount_minor" | "currency" | "fx_rate" | "base_amount_minor"
  | "paid_by" | "split_mode" | "shares" | "notes">;

export async function saveExpense(engine: SyncEngine, tripId: string, patch: ExpensePatch, existing?: Expense) {
  if (existing) {
    await engine.update("expenses", existing.id, patch as unknown as RowData);
    return existing.id;
  }
  return engine.insert("expenses", { ...(patch as unknown as RowData), trip_id: tripId });
}

export const deleteExpense = (engine: SyncEngine, e: Expense) => engine.remove("expenses", e.id);

/** Remboursement effectué, saisi en devise de base (montant suggéré par l'app, modifiable). */
export function recordSettlement(engine: SyncEngine, tripId: string, input: { from: string; to: string; amountMinor: number; currency: string; date: string; notes?: string | null }) {
  return engine.insert("settlements", {
    trip_id: tripId, from_user: input.from, to_user: input.to, amount_minor: input.amountMinor, currency: input.currency,
    fx_rate: 1, base_amount_minor: input.amountMinor, date: input.date, notes: input.notes ?? null,
  });
}

export const deleteSettlement = (engine: SyncEngine, s: Settlement) => engine.remove("settlements", s.id);

export type PersonalPatch = Pick<PersonalExpense, "title" | "category" | "date" | "amount_minor" | "currency" | "fx_rate" | "notes">;

/** Dépense personnelle : jamais dans le pot commun ; modifiable par son seul propriétaire (RLS). */
export async function savePersonal(engine: SyncEngine, tripId: string, ownerId: string, baseCurrency: string, patch: PersonalPatch, existing?: PersonalExpense) {
  if (existing && existing.owner_id !== ownerId) throw new Error("Seul son auteur peut modifier cette dépense personnelle.");
  const row = { ...patch, base_amount_minor: convertMinor(patch.amount_minor, patch.currency, baseCurrency, patch.fx_rate) };
  if (existing) {
    await engine.update("personal_expenses", existing.id, row);
    return existing.id;
  }
  return engine.insert("personal_expenses", { ...row, trip_id: tripId, owner_id: ownerId });
}

export function deletePersonal(engine: SyncEngine, p: PersonalExpense, userId: string) {
  if (p.owner_id !== userId) throw new Error("Seul son auteur peut supprimer cette dépense personnelle.");
  return engine.remove("personal_expenses", p.id);
}
