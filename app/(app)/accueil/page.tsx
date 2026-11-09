"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Badge } from "@/components/ui/Badge";
import { Card, SectionTitle } from "@/components/ui/Card";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useCurrentTrip } from "@/components/app/TripContext";
import { useTravelers } from "@/hooks/useTrip";
import { getLocalDb } from "@/lib/db/schema";
import { nextAccommodation, nextActivity, nextTransport, recentActivity } from "@/lib/db/dashboard";
import { describeActivity } from "@/lib/activity";
import { formatDate, formatDateRange, formatRelative, todayIn, tripPhase } from "@/lib/formatters";
import type { SyncedRow } from "@/lib/types/sync";

export default function DashboardPage() {
  const { trip, userId } = useCurrentTrip();
  const db = getLocalDb();
  const today = todayIn(trip.timezone);
  const phase = tripPhase(trip.start_date, trip.end_date, trip.timezone);
  const travelers = useTravelers(trip.group_id);
  const upcoming = useLiveQuery(
    async () => ({
      activity: await nextActivity(db, trip.id, today),
      transport: await nextTransport(db, trip.id, today),
      stay: await nextAccommodation(db, trip.id, today),
    }),
    [trip.id, today],
  );
  const log = useLiveQuery(() => recentActivity(db, trip.id), [trip.id]);
  const nameOf = (id: string | null) =>
    id === userId ? "Vous" : (travelers?.find((t) => t.id === id)?.display_name ?? "Un voyageur");

  return (
    <div className="flex flex-col gap-3">
      <Card className="seigaiha relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-card via-card/95 to-card/70" />
        <div className="relative">
          <h1 className="text-2xl font-bold">{trip.name}</h1>
          <p className="text-sm text-dim">{formatDateRange(trip.start_date, trip.end_date)} · {phase.totalDays} jours</p>
          <div className="mt-4">
            {phase.phase === "before" && (
              <p><span className="text-4xl font-bold text-vermillion">J-{phase.daysLeft}</span>
                <span className="ml-2 text-sm text-dim">{phase.daysLeft === 0 ? "c'est le départ !" : "avant le départ"}</span></p>
            )}
            {phase.phase === "during" && (
              <div>
                <p className="text-sm"><strong className="text-lg">Jour {phase.dayNumber}</strong> sur {phase.totalDays}</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-elev" role="progressbar" aria-valuenow={phase.percent}
                  aria-valuemin={0} aria-valuemax={100} aria-label="Progression du voyage">
                  <div className="h-full rounded-full bg-gradient-to-r from-vermillion to-sakura" style={{ width: `${phase.percent}%` }} />
                </div>
              </div>
            )}
            {phase.phase === "after" && <p className="text-sm text-dim">Voyage terminé. Les souvenirs restent ici.</p>}
          </div>
          {trip.destinations.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Destinations">
              {trip.destinations.map((d) => <li key={d.id}><Badge tone="sakura">{d.name}</Badge></li>)}
            </ul>
          )}
        </div>
      </Card>

      <SectionTitle>À venir</SectionTitle>
      <div className="grid gap-3 md:grid-cols-3">
        <Upcoming icon="calendar" label="Prochaine activité" row={upcoming?.activity} title="title" date="date" time="start_time"
          empty="Aucune activité planifiée." />
        <Upcoming icon="train" label="Prochain transport" row={upcoming?.transport} title="carrier" date="departure_date"
          time="departure_time" empty="Aucun transport renseigné." />
        <Upcoming icon="bed" label="Prochain hébergement" row={upcoming?.stay} title="name" date="check_in_date"
          time="check_in_time" empty="Aucun hébergement renseigné." />
      </div>

      <SectionTitle>Voyageurs</SectionTitle>
      <Card>
        <ul className="flex flex-wrap gap-3">
          {(travelers ?? []).map((t) => (
            <li key={t.id} className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-full text-sm font-bold text-on-accent" style={{ background: t.color }} aria-hidden="true">
                {t.display_name.slice(0, 1).toUpperCase()}
              </span>
              <span className="text-sm">{t.display_name}{t.id === userId && <span className="text-mute"> (vous)</span>}</span>
            </li>
          ))}
        </ul>
        {travelers && travelers.length < 2 && (
          <p className="mt-3 text-sm text-dim">Vous êtes seul pour l&apos;instant : invitez les autres depuis les <Link href="/parametres#voyageurs" className="font-semibold text-sakura">paramètres</Link>.</p>
        )}
      </Card>

      <SectionTitle>Dernières modifications</SectionTitle>
      <Card className="p-0">
        {!log?.length ? (
          <p className="p-4 text-sm text-dim">Aucune modification synchronisée pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-line">
            {log.map((l) => (
              <li key={l.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: travelers?.find((t) => t.id === l.actor_id)?.color ?? "var(--text-mute)" }} />
                <div className="min-w-0 flex-1">
                  <p>{describeActivity(l, nameOf(l.actor_id), l.actor_id === userId)}</p>
                  <p className="text-xs text-mute">{formatRelative(l.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Upcoming({ icon, label, row, title, date, time, empty }: {
  icon: IconName; label: string; row: SyncedRow | null | undefined; title: string; date: string; time: string; empty: string;
}) {
  return (
    <Card className="flex items-start gap-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-night-soft text-night"><Icon name={icon} size={20} /></div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-mute">{label}</p>
        {row ? (
          <>
            <p className="truncate font-semibold">{String(row[title] ?? "Sans titre")}</p>
            <p className="text-sm text-dim">
              {formatDate(String(row[date]), { weekday: "long", day: "numeric", month: "long" })}
              {row[time] ? ` · ${String(row[time]).slice(0, 5)}` : ""}
            </p>
          </>
        ) : (
          <p className="text-sm text-dim">{row === undefined ? "…" : empty}</p>
        )}
      </div>
    </Card>
  );
}
