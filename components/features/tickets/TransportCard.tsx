"use client";

import { Icon } from "@/components/ui/Icon";
import { TRANSPORT_META, transportTitle } from "@/lib/tickets";
import { formatDayShort } from "@/lib/formatters";
import type { Transport, TripDocument } from "@/lib/types/tickets";
import type { Traveler } from "@/hooks/useTrip";

const hm = (t: string | null) => t?.slice(0, 5) ?? null;

/** Trajet en « carte d'embarquement » : départ → arrivée, heures en grand, billets attachés. */
export function TransportCard({ transport: t, docs, travelers, past, onOpen, onCode }: {
  transport: Transport; docs: TripDocument[]; travelers: Traveler[]; past: boolean; onOpen: () => void; onCode: (doc: TripDocument) => void;
}) {
  const meta = TRANSPORT_META[t.kind];
  const who = t.traveler_ids.map((id) => travelers.find((x) => x.id === id)).filter((x): x is Traveler => !!x);
  const codes = docs.filter((d) => d.kind === "code");
  return (
    <li className={`overflow-hidden rounded-2xl border border-line bg-card ${past ? "opacity-60" : ""}`}>
      <button onClick={onOpen} aria-label={`Ouvrir le trajet « ${transportTitle(t)} »`} className="block w-full p-4 text-left hover:bg-elev">
        <div className="mb-3 flex items-center gap-2 text-sm">
          <span className="grid size-8 place-items-center rounded-lg bg-night-soft text-night"><Icon name={meta.icon} size={18} /></span>
          <span className="font-semibold">{[t.carrier, t.reference].filter(Boolean).join(" ") || meta.label}</span>
          <span className="ml-auto text-dim">{formatDayShort(t.departure_date)}</span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="min-w-0">
            <p className="font-display text-2xl font-bold">{hm(t.departure_time) ?? "—"}</p>
            <p className="truncate text-sm text-dim">{t.departure_name ?? "Départ"}</p>
          </div>
          <span className="h-0.5 w-10 rounded-full" style={{ background: "linear-gradient(90deg, var(--coral), var(--sakura), var(--teal))" }} aria-hidden="true" />
          <div className="min-w-0 text-right">
            <p className="font-display text-2xl font-bold">
              {hm(t.arrival_time) ?? "—"}
              {t.arrival_date && t.arrival_date !== t.departure_date && <sup className="ml-0.5 text-xs text-sun">+1</sup>}
            </p>
            <p className="truncate text-sm text-dim">{t.arrival_name ?? "Arrivée"}</p>
          </div>
        </div>
        {(t.seat_info || who.length > 0 || docs.length > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-line-strong pt-3 text-xs text-dim">
            {t.seat_info && <span className="truncate">{t.seat_info}</span>}
            {docs.length > 0 && <span className="inline-flex items-center gap-1"><Icon name="ticket" size={14} /> {docs.length} billet{docs.length > 1 ? "s" : ""}</span>}
            {who.length > 0 && (
              <span className="ml-auto flex -space-x-1" aria-label={`Pour ${who.map((w) => w.display_name).join(", ")}`}>
                {who.map((w) => (
                  <span key={w.id} className="grid size-6 place-items-center rounded-full border-2 border-card text-[10px] font-bold text-[#0b1020]" style={{ background: w.color }} aria-hidden="true">
                    {w.display_name.slice(0, 1).toUpperCase()}
                  </span>
                ))}
              </span>
            )}
          </div>
        )}
      </button>
      {codes.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          {codes.map((d) => (
            <button key={d.id} onClick={() => onCode(d)} aria-label={`Afficher le code de « ${d.title} » en plein écran`}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-coral px-3 text-sm font-semibold text-on-accent">
              <Icon name="qr" size={18} /> {codes.length > 1 ? d.title : "Afficher le billet"}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}
