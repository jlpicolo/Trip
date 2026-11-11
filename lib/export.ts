import { EXPENSE_LABEL, PERSONAL_LABEL, SPLIT_LABEL } from "@/lib/budget/labels";
import { currencyDigits } from "@/lib/money";
import type { Expense, PersonalExpense, Settlement } from "@/lib/types/budget";

/** Champ CSV : séparateur « ; » (Excel en français), guillemets doublés, formules neutralisées. */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  // Une cellule commençant par = + - @ serait exécutée comme formule par un tableur.
  if (/^[=+\-@]/.test(s) && !/^-?\d+([,.]\d+)?$/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  // BOM : sans lui, Excel lit l'UTF-8 (accents, kanji) comme du Latin-1.
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

/** Montant en unités mineures → nombre décimal à la française (« 1 250 » JPY → « 1250 », 1250 c → « 12,50 »). */
export function csvAmount(minor: number, currency: string): string {
  const d = currencyDigits(currency);
  if (d === 0) return String(minor);
  const neg = minor < 0;
  const s = String(Math.abs(minor)).padStart(d + 1, "0");
  return `${neg ? "-" : ""}${s.slice(0, -d)},${s.slice(-d)}`;
}

export function expensesCsv(expenses: Expense[], settlements: Settlement[], base: string, name: (id: string) => string): string {
  const header = ["Date", "Type", "Libellé", "Catégorie", "Payé par", "Montant", "Devise", "Taux figé", `Montant (${base})`, "Répartition", "Détail des parts"];
  const rows: unknown[][] = [
    ...expenses.map((e) => [
      e.date, "Dépense", e.title, EXPENSE_LABEL[e.category] ?? e.category, name(e.paid_by), csvAmount(e.amount_minor, e.currency), e.currency,
      String(e.fx_rate).replace(".", ","), csvAmount(e.base_amount_minor, base), SPLIT_LABEL[e.split_mode] ?? e.split_mode,
      e.shares.map((s) => `${name(s.user_id)} ${csvAmount(s.base_minor, base)}`).join(" | "),
    ]),
    ...settlements.map((s) => [
      s.date, "Remboursement", `${name(s.from_user)} → ${name(s.to_user)}`, "", name(s.from_user), csvAmount(s.amount_minor, s.currency), s.currency,
      String(s.fx_rate).replace(".", ","), csvAmount(s.base_amount_minor, base), "", "",
    ]),
  ].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return toCsv(header, rows);
}

export function personalCsv(rows: PersonalExpense[], base: string): string {
  return toCsv(["Date", "Libellé", "Catégorie", "Montant", "Devise", "Taux figé", `Montant (${base})`, "Notes"],
    [...rows].sort((a, b) => a.date.localeCompare(b.date)).map((p) => [
      p.date, p.title, PERSONAL_LABEL[p.category] ?? p.category, csvAmount(p.amount_minor, p.currency), p.currency,
      String(p.fx_rate).replace(".", ","), csvAmount(p.base_amount_minor, base), p.notes ?? "",
    ]));
}

/** Nom de fichier sûr : « Japan Trip » → « japan-trip-2026-11-10.json ». */
export function exportFileName(tripName: string, today: string, ext: string, suffix = ""): string {
  const slug = tripName.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "voyage";
  return `${slug}${suffix ? `-${suffix}` : ""}-${today}.${ext}`;
}
