"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useCurrentTrip } from "@/components/app/TripContext";
import { useTravelers } from "@/hooks/useTrip";
import { getLocalDb } from "@/lib/db/schema";
import { nextActivity, recentActivity } from "@/lib/db/dashboard";
import { activitiesOfTrip, daysOfTrip, placesOfTrip } from "@/lib/db/planning";
import { documentsOfTrip, transportsOfTrip } from "@/lib/db/tickets";
import { staysOfTrip } from "@/lib/db/stays";
import { entriesOfTrip } from "@/lib/db/journal";
import { nowHm, preparationStats } from "@/lib/dashboard";
import { nextTransport, transportTitle, TRANSPORT_META } from "@/lib/tickets";
import { stayForNight, sortStays } from "@/lib/stays";
import { FullscreenCode } from "@/components/features/tickets/FullscreenCode";
import type { TripDocument } from "@/lib/types/tickets";
import { describeGroup, groupActivity } from "@/lib/activity";
import { categoryMeta, hm } from "@/lib/planning";
import { cityKanji, sameCity } from "@/lib/japan";
import { formatDate, formatRelative, todayIn, tripDates, tripPhase } from "@/lib/formatters";
import type { SyncedRow } from "@/lib/types/sync";

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 5 || h >= 18 ? "Bonsoir" : "Bonjour";
}

export default function DashboardPage() {
  const { trip, userId } = useCurrentTrip();
  const db = getLocalDb();
  const today = todayIn(trip.timezone);
  const phase = tripPhase(trip.start_date, trip.end_date, trip.timezone);
  const travelers = useTravelers(trip.group_id);
  const me = travelers?.find((t) => t.id === userId);
  const [code, setCode] = useState<TripDocument | null>(null);
  const closeCode = useCallback(() => setCode(null), []);
  const data = useLiveQuery(async () => {
    const [activity, days, log, transports, stays, docs, entries, activities, places] = await Promise.all([
      nextActivity(db, trip.id, today), daysOfTrip(db, trip.id), recentActivity(db, trip.id, 30), transportsOfTrip(db, trip.id),
      staysOfTrip(db, trip.id), documentsOfTrip(db, trip.id), entriesOfTrip(db, trip.id), activitiesOfTrip(db, trip.id), placesOfTrip(db, trip.id),
    ]);
    const transport = nextTransport(transports, today, nowHm(trip.timezone));
    const tonight = stayForNight(stays, today);
    const stay = tonight ?? sortStays(stays).find((x) => x.check_in_date >= today) ?? null;
    const prep = preparationStats({
      dates: tripDates(trip.start_date, trip.end_date), start: trip.start_date, end: trip.end_date, activities,
      freeDays: new Set([...days.values()].filter((d) => d.is_free).map((d) => d.date)), stays, entries,
      planned: new Set(activities.map((a) => a.journal_entry_id).filter((x): x is string => !!x)),
    });
    return {
      activity, days, log, transport, stay, tonight: !!tonight, prep, transportCount: transports.length,
      codes: transport ? docs.filter((d) => d.transport_id === transport.id && d.kind === "code") : [],
      favorites: [...places.values()].filter((p) => p.is_favorite).sort((a, b) => a.name.localeCompare(b.name, "fr")),
    };
  }, [trip.id, today, trip.start_date, trip.end_date, trip.timezone]);
  const nameOf = (id: string | null) => travelers?.find((t) => t.id === id)?.display_name ?? "Un voyageur";
  const colorOf = (id: string | null) => travelers?.find((t) => t.id === id)?.color ?? "var(--text-mute)";

  const first = trip.destinations[0];
  const last = trip.destinations.at(-1);
  // Dates d'une escale : journées du planning dont la ville correspond (aucune date inventée).
  const stops = trip.destinations.map((d) => {
    const dates = data ? [...data.days.values()].filter((day) => sameCity(day.city, d.name)).map((day) => day.date).sort() : [];
    return { ...d, kanji: cityKanji(d.name), from: dates[0], to: dates.at(-1) };
  });
  const groups = data ? groupActivity(data.log).slice(0, 6) : [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-dim">{greeting()}{me ? ` ${me.display_name}` : ""}</p>
          <h1 className="truncate text-[28px] font-extrabold leading-tight">{trip.name}</h1>
        </div>
        <span aria-hidden="true" className="font-display text-4xl leading-none text-coral">旅</span>
      </div>

      {/* Carte d'embarquement */}
      <section aria-label="Carte d'embarquement" className="relative overflow-hidden rounded-3xl p-4 pb-5" style={{ background: "var(--hero)" }}>
        <span aria-hidden="true" className="absolute right-4 top-3 size-9 rounded-full opacity-90"
          style={{ background: "radial-gradient(circle, #ff8a7a, #ff6b6b 60%, transparent 62%)" }} />
        <span aria-hidden="true" className="absolute right-[24%] top-[46%] h-1.5 w-2.5 rotate-[30deg] rounded-[60%_40%_60%_40%] bg-sakura opacity-70" />
        <span aria-hidden="true" className="absolute right-[12%] top-[60%] h-1.5 w-2.5 -rotate-[20deg] rounded-[60%_40%_60%_40%] bg-sakura opacity-60" />
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sakura">Carte d&apos;embarquement</p>
        {first && last && first.id !== last.id ? (
          <div className="relative mt-5 flex items-center gap-3">
            <CityCode name={first.name} />
            <span aria-hidden="true" className="relative h-0.5 flex-1" style={{ background: "repeating-linear-gradient(90deg, var(--sakura) 0 6px, transparent 6px 11px)" }}>
              <Icon name="plane" size={16} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90 text-sakura" />
            </span>
            <CityCode name={last.name} right />
          </div>
        ) : (
          <p className="mt-3 font-display text-2xl font-extrabold">{first?.name ?? "Destinations à définir"}</p>
        )}
        <p className="sr-only">Du {formatDate(trip.start_date)} au {formatDate(trip.end_date)}</p>
        <div className="relative mt-4 grid grid-cols-3 gap-2">
          <Stat value={phase.phase === "before" ? `J-${phase.daysLeft}` : phase.phase === "during" ? `Jour ${phase.dayNumber}` : "Fini"}
            label={phase.phase === "before" ? (phase.daysLeft === 0 ? "c'est le départ" : "avant le départ") : phase.phase === "during" ? `sur ${phase.totalDays}` : "voyage terminé"} accent />
          <Stat value={String(phase.totalDays)} label={`jours · dès le ${formatDate(trip.start_date, { day: "numeric", month: "short" })}`} />
          <Stat value={String(trip.destinations.length)} label={trip.destinations.length > 1 ? "villes" : "ville"} />
        </div>
        {phase.phase === "during" && (
          <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-card/55" role="progressbar" aria-valuenow={phase.percent}
            aria-valuemin={0} aria-valuemax={100} aria-label="Progression du voyage">
            <div className="h-full rounded-full" style={{ width: `${phase.percent}%`, background: "linear-gradient(90deg, var(--coral), var(--sakura))" }} />
          </div>
        )}
      </section>

      {stops.length > 0 && (
        <section aria-labelledby="escales">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="escales" className="font-sans text-sm font-bold text-dim">Escales</h2>
            <Link href="/carte" className="text-sm font-semibold text-sakura">Voir la carte</Link>
          </div>
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {stops.map((s, i) => (
              <li key={s.id} className="w-[84px] shrink-0 rounded-2xl border-[1.5px] border-dashed border-line-strong bg-card px-1.5 py-2 text-center">
                <p aria-hidden="true" className="font-display text-lg font-extrabold leading-tight" style={{ color: STAMP_COLORS[i % STAMP_COLORS.length] }}>
                  {s.kanji ?? s.name.slice(0, 2)}
                </p>
                <p className="truncate text-xs font-bold">{s.name}</p>
                <p className="text-[11px] text-mute">{s.from ? rangeLabel(s.from, s.to!) : `Étape ${i + 1}`}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="prochaine-etape" className="flex flex-col gap-2">
        <h2 id="prochaine-etape" className="font-sans text-sm font-bold text-dim">Prochaine étape</h2>
        <NextActivity row={data?.activity} />
        <div className="grid grid-cols-2 gap-2">
          <MiniCard icon={data?.transport ? TRANSPORT_META[data.transport.kind].icon : "train"} label="Prochain trajet"
            href={data?.transport ? `/billets?trajet=${data.transport.id}` : "/billets"} empty={data === undefined ? "…" : "Aucun trajet à venir"}
            text={data?.transport ? transportTitle(data.transport) : null}
            when={data?.transport ? `${formatDate(data.transport.departure_date, { day: "numeric", month: "short" })}${data.transport.departure_time ? ` · ${hm(data.transport.departure_time)}` : ""}` : null} />
          <MiniCard icon="bed" label={data?.tonight ? "Ce soir" : "Prochain hébergement"}
            href={data?.stay ? `/hebergements?sejour=${data.stay.id}` : "/hebergements"} empty={data === undefined ? "…" : "Aucun hébergement à venir"}
            text={data?.stay?.name ?? null}
            when={data?.stay && !data.tonight ? `${formatDate(data.stay.check_in_date, { day: "numeric", month: "short" })}${data.stay.check_in_time ? ` · dès ${hm(data.stay.check_in_time)}` : ""}` : data?.stay?.city ?? null} />
        </div>
        {data && data.codes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {data.codes.map((d) => (
              <button key={d.id} onClick={() => setCode(d)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-coral px-4 text-sm font-semibold text-on-accent">
                <Icon name="qr" size={18} /> {data.codes.length > 1 ? d.title : "Afficher le billet"}
              </button>
            ))}
          </div>
        )}
      </section>

      {data && phase.phase !== "after" && (
        <section aria-labelledby="preparation" className="flex flex-col gap-2">
          <h2 id="preparation" className="font-sans text-sm font-bold text-dim">Préparation</h2>
          <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-card">
            <PrepRow href="/planning" icon="calendar" label="Journées prévues" value={data.prep.daysPlanned} total={data.prep.totalDays} />
            <PrepRow href="/hebergements" icon="bed" label="Nuits réservées" value={data.prep.nightsCovered} total={data.prep.totalNights} />
            <PrepRow href="/billets" icon="ticket" label="Trajets enregistrés" value={data.transportCount} />
            <PrepRow href="/carnet" icon="star" label="Incontournables à planifier" value={data.prep.mustSeeUnplanned.length}
              detail={data.prep.mustSeeUnplanned.slice(0, 3).map((e) => e.title).join(" · ")} />
          </ul>
        </section>
      )}

      {data && data.favorites.length > 0 && (
        <section aria-labelledby="favoris" className="flex flex-col gap-2">
          <h2 id="favoris" className="font-sans text-sm font-bold text-dim">Lieux favoris</h2>
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {data.favorites.map((p) => (
              <li key={p.id} className="shrink-0">
                <Link href={`/carte?lieu=${p.id}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong bg-card px-3 text-sm hover:bg-elev">
                  <Icon name="heart" size={16} className="text-sakura" /> {p.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="voyageurs" className="flex flex-col gap-2">
        <h2 id="voyageurs" className="font-sans text-sm font-bold text-dim">Voyageurs</h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-line bg-card px-4 py-3">
          {(travelers ?? []).map((t) => (
            <span key={t.id} className="flex items-center gap-2 text-sm">
              <span className="grid size-8 place-items-center rounded-full text-sm font-bold text-[#0b1020]" style={{ background: t.color }} aria-hidden="true">
                {t.display_name.slice(0, 1).toUpperCase()}
              </span>
              <span>{t.display_name}</span>{t.id === userId && <span className="text-mute">(vous)</span>}
            </span>
          ))}
          {travelers && travelers.length < 2 && (
            <Link href="/parametres#voyageurs" className="text-sm font-semibold text-sakura">Inviter les autres voyageurs</Link>
          )}
        </div>
      </section>

      <section aria-labelledby="historique" className="flex flex-col gap-2">
        <h2 id="historique" className="font-sans text-sm font-bold text-dim">Dernières modifications</h2>
        {!groups.length ? (
          <p className="rounded-2xl border border-line bg-card p-4 text-sm text-dim">Aucune modification synchronisée pour l&apos;instant.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-card">
            {groups.map((g) => (
              <li key={g.entries[0].id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold text-[#0b1020]" style={{ background: colorOf(g.actor_id) }} aria-hidden="true">
                  {nameOf(g.actor_id).slice(0, 1).toUpperCase()}
                </span>
                <p className="min-w-0 flex-1">
                  {describeGroup(g, nameOf(g.actor_id), g.actor_id === userId)}
                  <span className="text-mute"> · {formatRelative(g.latest)}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      {code?.code_value && code.code_format && (
        <FullscreenCode title={code.title} format={code.code_format} value={code.code_value}
          subtitle={data?.transport ? transportTitle(data.transport) : null} onClose={closeCode} />
      )}
    </div>
  );
}

function PrepRow({ href, icon, label, value, total, detail }: {
  href: string; icon: IconName; label: string; value: number; total?: number; detail?: string;
}) {
  const done = total !== undefined && total > 0 && value >= total;
  return (
    <li>
      <Link href={href} className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-elev">
        <Icon name={icon} size={18} className={done ? "text-teal" : "text-dim"} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm">{label}</span>
          {total !== undefined && total > 0 && (
            <span className="mt-1 block h-1 overflow-hidden rounded-full bg-elev" aria-hidden="true">
              <span className="block h-full rounded-full" style={{ width: `${Math.round((value / total) * 100)}%`, background: done ? "var(--teal)" : "var(--coral)" }} />
            </span>
          )}
          {detail && <span className="mt-0.5 block truncate text-xs text-mute">{detail}</span>}
        </span>
        <span className={`font-display text-lg font-bold tabular-nums ${done ? "text-teal" : ""}`}>
          {value}{total !== undefined && <span className="text-sm text-mute">/{total}</span>}
        </span>
      </Link>
    </li>
  );
}

const STAMP_COLORS = ["var(--coral)", "var(--sun)", "var(--sakura)", "var(--teal)", "var(--night)", "#b39dff"];

function rangeLabel(from: string, to: string) {
  const f = formatDate(from, { day: "numeric", month: "short" });
  if (from === to) return f;
  return from.slice(0, 7) === to.slice(0, 7) ? `${Number(from.slice(8))}–${f.replace(/^\d+/, String(Number(to.slice(8))))}` : `${f} – ${formatDate(to, { day: "numeric", month: "short" })}`;
}

function CityCode({ name, right }: { name: string; right?: boolean }) {
  const kanji = cityKanji(name);
  return (
    <div className={`min-w-0 ${right ? "text-right" : ""}`}>
      <p className="truncate font-display text-[26px] font-extrabold uppercase leading-none tracking-wide">{name}</p>
      {kanji && <p aria-hidden="true" className="mt-1 text-xs text-dim">{kanji}</p>}
    </div>
  );
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-card/55 px-2.5 py-2">
      <p className={`font-display text-[22px] font-extrabold leading-tight ${accent ? "text-sun" : ""}`}>{value}</p>
      <p className="text-[11px] leading-tight text-dim">{label}</p>
    </div>
  );
}

function NextActivity({ row }: { row: SyncedRow | null | undefined }) {
  if (row === undefined) return <div className="h-[76px] rounded-2xl border border-line bg-card" />;
  if (!row) {
    return (
      <Link href="/planning" className="flex items-center justify-between rounded-2xl border border-dashed border-line-strong bg-card px-4 py-4 text-sm">
        <span className="text-dim">Aucune activité planifiée à venir.</span>
        <span className="font-semibold text-sakura">Planifier</span>
      </Link>
    );
  }
  const meta = categoryMeta(String(row.category));
  return (
    <Link href={`/planning#jour-${String(row.date)}`} className="grid grid-cols-[48px_1fr] items-center gap-3 rounded-2xl border border-line bg-card p-3 hover:bg-elev">
      <span className="grid size-12 place-items-center rounded-2xl text-on-accent" style={{ background: meta.color }} aria-hidden="true">
        <Icon name={meta.icon} size={22} />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-bold text-teal">
          {formatDate(String(row.date), { weekday: "long", day: "numeric", month: "long" })}{row.start_time ? ` · ${hm(String(row.start_time))}` : ""}
        </span>
        <span className="block truncate text-base font-bold">{String(row.title)}</span>
        <span className="block text-xs text-dim">{meta.label}</span>
      </span>
    </Link>
  );
}

function MiniCard({ icon, label, href, text, when, empty }: {
  icon: IconName; label: string; href: string; text: string | null; when: string | null; empty: string;
}) {
  return (
    <Link href={href} className={`flex min-h-[76px] min-w-0 flex-col justify-center gap-0.5 rounded-2xl border bg-card px-3 py-2.5 text-xs text-dim hover:bg-elev ${text ? "border-line" : "border-dashed border-line-strong"}`}>
      <span className="flex items-center gap-1.5 font-bold text-ink"><Icon name={icon} size={16} className="text-night" />{label}</span>
      {text ? (
        <>
          <span className="line-clamp-2 text-sm text-ink">{text}</span>
          {when && <span>{when}</span>}
        </>
      ) : (
        <span>{empty}</span>
      )}
    </Link>
  );
}
