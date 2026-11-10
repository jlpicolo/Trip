"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { convertMinor } from "@/lib/budget/money";
import { formatDate, formatMoney, todayIn } from "@/lib/formatters";
import { minorToInput, parseAmountToMinor } from "@/lib/money";
import { formatRate, rateLabel } from "@/lib/fx";
import { parseRate } from "@/lib/validation/budget";
import type { KnownRate } from "@/lib/types/budget";
import type { Trip } from "@/lib/types/trip";

/** Convertisseur dans les deux sens, avec le taux connu (toujours daté) ; utilisable hors ligne. */
export function Converter({ trip, known, loading, error, onRefresh, onManual }: {
  trip: Trip; known: KnownRate | null | undefined; loading: boolean; error: string | null;
  onRefresh: () => void; onManual: (rate: number | null) => Promise<void>;
}) {
  const base = trip.base_currency;
  const quote = trip.secondary_currency;
  const [from, setFrom] = useState<"base" | "quote">("quote");
  const [amount, setAmount] = useState("");
  const [manual, setManual] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const today = todayIn(trip.timezone);
  if (!quote) return <Card><p className="text-sm text-dim">Ajoutez une devise secondaire au voyage (Paramètres) pour utiliser le convertisseur.</p></Card>;

  const src = from === "base" ? base : quote;
  const dst = from === "base" ? quote : base;
  const minor = parseAmountToMinor(amount, src);
  const result = known && minor ? convertMinor(minor, src, dst, from === "base" ? known.rate : 1 / known.rate) : null;
  const fmtDay = (iso: string) => formatDate(iso, { day: "numeric", month: "long", year: "numeric" });

  return (
    <Card className="flex flex-col gap-4">
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <Field label={`Montant en ${src}`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoComplete="off" />
        <Button variant="subtle" icon="sync" aria-label="Inverser les devises" onClick={() => {
          setFrom(from === "base" ? "quote" : "base");
          setAmount(result ? minorToInput(result, dst) : "");
        }} />
      </div>
      <p className="font-display text-3xl font-bold" aria-live="polite">
        {result !== null ? formatMoney(result, dst) : <span className="text-mute">— {dst}</span>}
      </p>
      {known ? (
        <p className="text-xs text-dim">
          1 {base} = {formatRate(known.rate)} {quote} · {rateLabel(known, today, fmtDay)}
        </p>
      ) : (
        <p className="text-xs text-warning">Aucun taux connu sur cet appareil : connectez-vous une fois, ou saisissez un taux manuel.</p>
      )}
      {error && <p role="alert" className="text-xs text-warning">{error}</p>}
      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <Button variant="ghost" icon="sync" onClick={onRefresh} loading={loading} disabled={known?.source === "manual"}>Mettre à jour (BCE)</Button>
      </div>
      <details className="text-sm">
        <summary className="min-h-11 cursor-pointer py-2 text-dim">Taux manuel (partagé avec le groupe)</summary>
        <div className="mt-2 flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <Field label={`1 ${base} = … ${quote}`} inputMode="decimal" value={manual} onChange={(e) => setManual(e.target.value)} error={manualError ?? undefined} />
            <Button variant="subtle" onClick={async () => {
              const r = parseRate(manual);
              if (!r) return setManualError("Taux invalide");
              setManualError(null);
              await onManual(r);
            }}>Appliquer</Button>
          </div>
          {known?.source === "manual" && <Button variant="ghost" onClick={() => onManual(null)}>Revenir au taux BCE</Button>}
          <p className="text-xs text-mute">Utile si votre banque applique un autre taux. Les dépenses déjà saisies gardent leur taux.</p>
        </div>
      </details>
    </Card>
  );
}
