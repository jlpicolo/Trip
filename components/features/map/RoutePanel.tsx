"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { formatDayLong } from "@/lib/formatters";
import { TRANSPORT_META, transportTitle } from "@/lib/tickets";
import { dayUrl, formatDistance, transitUrl, TRANSIT_THRESHOLD_M, type DayRoute, type Point } from "@/lib/route-plan";
import { directOption, lineKey, nearbyTransit, type TransitLine, type TransitStation } from "@/lib/transit";
import type { TransitState } from "./useTransit";

const ext = "inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-line-strong px-3 text-sm font-semibold hover:bg-elev";

/**
 * Détail du parcours : étapes dans l'ordre du planning, distances à vol d'oiseau (jamais présentées comme
 * le trajet réel), gares proches et lignes qui les desservent (OpenStreetMap), et liens vers Google Maps
 * pour les vrais trajets (horaires, durées, correspondances). Aucune durée n'est calculée ici.
 */
export function RoutePanel({ routes, transit, totalDays }: { routes: DayRoute[]; transit: TransitState; totalDays: number }) {
  const visible = routes.filter((r) => r.stops.length > 1 || r.hops.length > 0 || r.unplaced.length > 0);
  if (visible.length === 0) {
    return (
      <Card className="text-sm text-dim">
        Aucun parcours à tracer : ajoutez des activités avec un lieu dans le planning (ou un hébergement avec une adresse).
        L&apos;ordre des étapes est celui du planning.
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-mute">
        Lignes droites entre les étapes, dans l&apos;ordre du planning : distances <strong>à vol d&apos;oiseau</strong>, pas le chemin réel.
        Les vrais trajets (métro, train, marche) s&apos;ouvrent dans Google Maps.
      </p>
      {transit.status === "error" && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          <span className="min-w-0 flex-1">{transit.message}</span>
          <button type="button" onClick={transit.retry} className="min-h-10 rounded-xl border border-line-strong px-3 font-semibold text-ink hover:bg-elev">Réessayer</button>
        </div>
      )}
      {visible.map((r) => {
        const url = dayUrl(r.stops);
        let n = 0;
        return (
          <section key={r.date} aria-label={`Parcours du jour ${r.index + 1}`} className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-3">
            <header className="flex flex-wrap items-center gap-2">
              <span className="size-3.5 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden="true" />
              <h3 className="flex-1 text-sm font-bold">Jour {r.index + 1}/{totalDays} · {formatDayLong(r.date)}</h3>
              {url && <a href={url} target="_blank" rel="noopener noreferrer" className={ext}><Icon name="external" size={16} /> Journée dans Google Maps</a>}
            </header>
            <ol className="flex flex-col">
              {r.stops.map((s, i) => {
                const leg = i > 0 ? r.legs[i - 1] : null;
                const label = s.kind === "hotel" ? "H" : String(++n);
                const far = leg && leg.distance > TRANSIT_THRESHOLD_M;
                return (
                  <li key={s.key} className="flex flex-col">
                    {leg && (
                      <div className="ml-3 flex flex-col gap-1 border-l-2 border-dashed py-2 pl-5 text-xs text-dim" style={{ borderColor: r.color }}>
                        <span>{far ? "Transports conseillés" : "À pied"} · {formatDistance(leg.distance)} à vol d&apos;oiseau</span>
                        {far && (
                          <>
                            <Stations from={leg.from} to={leg.to} transit={transit} />
                            <a href={transitUrl(leg.from, leg.to)} target="_blank" rel="noopener noreferrer" className={`${ext} self-start text-night`}>
                              <Icon name="train" size={16} /> Itinéraire en transports (Google Maps)
                            </a>
                          </>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-white text-xs font-extrabold text-[#0b1020]" style={{ background: r.color }} aria-hidden="true">{label}</span>
                      <span className="min-w-0 flex-1 text-sm">
                        {s.kind === "hotel" ? <span className="text-dim">Hébergement · </span> : null}
                        <span className="font-semibold">{s.title}</span>
                        {s.time && <span className="text-dim"> · {s.time}</span>}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
            {r.hops.map((h) => (
              <Link key={h.transport.id} href={`/billets?trajet=${h.transport.id}`} className="flex min-h-10 items-center gap-2 rounded-xl bg-night-soft px-3 text-sm text-night">
                <Icon name={TRANSPORT_META[h.transport.kind].icon} size={16} />
                <span className="min-w-0 flex-1 truncate">{h.transport.departure_time ? `${h.transport.departure_time.slice(0, 5)} · ` : ""}{transportTitle(h.transport)}</span>
                {!(h.from && h.to) && <span className="text-xs text-mute">non tracé</span>}
              </Link>
            ))}
            {r.unplaced.length > 0 && (
              <p className="text-xs text-mute">
                {r.unplaced.length} activité{r.unplaced.length > 1 ? "s" : ""} sans lieu, non tracée{r.unplaced.length > 1 ? "s" : ""} : {r.unplaced.map((a) => a.title).join(", ")}.{" "}
                <Link href={`/planning#jour-${r.date}`} className="font-semibold text-sakura">Compléter dans le planning</Link>
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

const CSS_COLOUR = /^(#[0-9a-f]{3,8}|[a-z]{3,20})$/i;
const shortLine = (name: string) => name.replace(/^(Tokyo Metro|Toei|JR|Osaka Metro|Osaka Municipal Subway|Kyoto Municipal Subway)\s*-?\s*/i, "").replace(/\s+Line$/i, "");

function LineBadge({ line }: { line: TransitLine }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-line-strong px-1.5 py-0.5 text-xs font-semibold text-ink" title={line.name}>
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: line.colour && CSS_COLOUR.test(line.colour) ? line.colour : "var(--color-mute)" }} aria-hidden="true" />
      {line.ref ? `${line.ref} ${shortLine(line.name)}` : shortLine(line.name)}
    </span>
  );
}

type Near = TransitStation & { distance: number };

function StationChip({ st }: { st: Near }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <strong className="text-ink">{st.name}</strong>
      {st.nameJa && <span lang="ja">{st.nameJa}</span>}
      <span>· {formatDistance(st.distance)}</span>
      {st.lines.map((l) => <LineBadge key={lineKey(l)} line={l} />)}
    </span>
  );
}

/**
 * Gares proches de chaque extrémité (3 au plus) et, si une même ligne les relie, la paire qui demande le
 * moins de marche. État honnête : recherche, hors ligne, service indisponible.
 */
function Stations({ from, to, transit }: { from: Point; to: Point; transit: TransitState }) {
  const near = { from: nearbyTransit(from, transit.stations), to: nearbyTransit(to, transit.stations) };
  if (near.from.length === 0 && near.to.length === 0) {
    if (transit.status === "loading") return <span>Recherche des gares proches…</span>;
    if (transit.status === "error") return <span>Gares proches indisponibles pour le moment.</span>;
    if (transit.missing > 0) return <span>Gares proches : disponibles une fois en ligne (gardées ensuite sur l&apos;appareil).</span>;
    return <span>Aucune gare à moins de 900 m de ces étapes (OpenStreetMap).</span>;
  }
  const direct = directOption(from, to, transit.stations);
  const list = (label: string, sts: Near[]) => (
    <span className="flex flex-col gap-1">
      <span>{label} :</span>
      {sts.length ? sts.map((st) => <StationChip key={st.name} st={st} />) : <span>aucune gare à moins de 900 m</span>}
    </span>
  );
  return (
    <span className="flex flex-col gap-2" data-testid="transit">
      {direct ? (
        <span className="flex flex-col gap-1 rounded-xl bg-night-soft px-2.5 py-2">
          <span className="flex flex-wrap items-center gap-1.5 font-semibold text-ink">
            Sans changement : {direct.lines.map((l) => <LineBadge key={lineKey(l)} line={l} />)}
          </span>
          <span>De <StationChip st={{ ...direct.from, lines: [] }} /> à <StationChip st={{ ...direct.to, lines: [] }} /></span>
        </span>
      ) : null}
      {list("Gares près du départ", near.from)}
      {list("Gares près de l'arrivée", near.to)}
      <span className="text-mute">
        Gares et lignes : OpenStreetMap{direct ? " (« sans changement » : une même ligne dessert les deux gares)" : ""}. Horaires, durée et
        correspondances : Google Maps.
      </span>
    </span>
  );
}
