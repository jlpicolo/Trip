"use client";

import { useEffect, useMemo, useState } from "react";
import { getLocalDb } from "@/lib/db/schema";
import { TRANSIT_THRESHOLD_M, type DayRoute, type Point } from "@/lib/route-plan";
import { transitAround, type TransitStation } from "@/lib/transit";

export interface TransitState {
  status: "loading" | "ready" | "error";
  stations: TransitStation[];
  /** Points sans résultat faute de réseau (hors ligne). */
  missing: number;
  message: string | null;
  retry: () => void;
}

interface Result {
  key: string;
  stations: TransitStation[];
  missing: number;
  message: string | null;
}

/** Gares autour des extrémités des tronçons longs (ceux où les transports sont conseillés). */
export function useTransit(routes: DayRoute[]): TransitState {
  const points = useMemo(() => {
    const m = new Map<string, Point>();
    for (const r of routes) for (const l of r.legs) {
      if (l.distance <= TRANSIT_THRESHOLD_M) continue;
      for (const p of [l.from, l.to]) m.set(`${p.lat.toFixed(3)},${p.lng.toFixed(3)}`, p);
    }
    return [...m.values()];
  }, [routes]);
  const key = points.map((p) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`).join(";");
  const [attempt, setAttempt] = useState(0);
  const request = `${key}#${attempt}`;
  const [result, setResult] = useState<Result>({ key: "", stations: [], missing: 0, message: null });

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    transitAround(getLocalDb(), points)
      .then((r) => !cancelled && setResult({ key: request, stations: r.stations, missing: r.missing, message: null }))
      .catch((e: unknown) => !cancelled && setResult((s) => ({ key: request, stations: s.stations, missing: 0, message: e instanceof Error ? e.message : String(e) })));
    return () => {
      cancelled = true;
    };
    // `points` est dérivé de `key` : la clé suffit à éviter une requête par rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  // Au retour du réseau, les gares manquantes sont demandées sans action de l'utilisateur.
  useEffect(() => {
    const on = () => setAttempt((a) => a + 1);
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, []);

  // Tant que la réponse ne correspond pas à la demande en cours, on affiche « recherche » (avec les gares déjà connues).
  const status = !key ? "ready" : result.key !== request ? "loading" : result.message ? "error" : "ready";
  return { status, stations: result.stations, missing: result.missing, message: result.message, retry: () => setAttempt((a) => a + 1) };
}
