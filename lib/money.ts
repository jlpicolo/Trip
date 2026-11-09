export function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/**
 * Saisie utilisateur → unités mineures entières, sans passer par un flottant pour
 * l'arrondi (« 12,5 » EUR → 1250 ; « 1 500 » JPY → 1500). null si invalide.
 */
export function parseAmountToMinor(input: string, currency: string): number | null {
  const digits = currencyDigits(currency);
  const s = input.replace(/[\s  ]/g, "").replace(",", ".");
  const m = s.match(/^(\d+)(?:\.(\d*))?$/);
  if (!m) return null;
  const frac = m[2] ?? "";
  if (frac.length > digits) return null;
  const minor = Number(m[1]) * 10 ** digits + Number(frac.padEnd(digits, "0") || "0");
  return Number.isSafeInteger(minor) ? minor : null;
}

/** Unités mineures → texte éditable (« 1250 » EUR → « 12,50 »). */
export function minorToInput(minor: number | null | undefined, currency: string): string {
  if (minor == null) return "";
  const digits = currencyDigits(currency);
  if (digits === 0) return String(minor);
  const s = String(minor).padStart(digits + 1, "0");
  return `${s.slice(0, -digits)},${s.slice(-digits)}`;
}
