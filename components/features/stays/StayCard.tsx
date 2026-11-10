"use client";

import { Icon } from "@/components/ui/Icon";
import { formatDayShort } from "@/lib/formatters";
import { nightsOf } from "@/lib/stays";
import type { Accommodation } from "@/lib/types/stays";

const hm = (t: string | null) => t?.slice(0, 5);

export function StayCard({ stay: s, docCount, current, past, onOpen }: {
  stay: Accommodation; docCount: number; current: boolean; past: boolean; onOpen: () => void;
}) {
  const n = nightsOf(s);
  return (
    <li className={past ? "opacity-60" : ""}>
      <button onClick={onOpen} aria-label={`Ouvrir « ${s.name} »`}
        className={`flex w-full items-stretch gap-3 rounded-2xl border bg-card p-3 text-left hover:bg-elev ${current ? "border-coral" : "border-line"}`}>
        <span className="flex w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-teal-soft px-1 py-2 text-center text-teal">
          <span className="font-display text-2xl font-bold leading-none">{n}</span>
          <span className="text-xs">nuit{n > 1 ? "s" : ""}</span>
        </span>
        <span className="min-w-0 flex-1">
          {current && <span className="mb-0.5 block text-xs font-semibold uppercase tracking-wider text-coral">Ce soir</span>}
          <span className="block truncate font-semibold">{s.name}</span>
          {s.city && <span className="block truncate text-sm text-dim">{s.city}</span>}
          <span className="mt-1 block text-sm">
            {formatDayShort(s.check_in_date)}{hm(s.check_in_time) && <span className="text-dim"> dès {hm(s.check_in_time)}</span>}
            <span className="text-mute"> → </span>
            {formatDayShort(s.check_out_date)}{hm(s.check_out_time) && <span className="text-dim"> avant {hm(s.check_out_time)}</span>}
          </span>
          {docCount > 0 && (
            <span className="mt-1 inline-flex items-center gap-1 text-xs text-dim"><Icon name="file" size={14} /> {docCount} document{docCount > 1 ? "s" : ""}</span>
          )}
        </span>
      </button>
    </li>
  );
}
