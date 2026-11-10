"use client";

import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { journalMeta, PRIORITY_META } from "@/lib/journal";
import { formatDayShort } from "@/lib/formatters";
import type { JournalEntry } from "@/lib/types/journal";
import type { Activity } from "@/lib/types/planning";

export function JournalCard({ entry: e, planned, onOpen }: { entry: JournalEntry; planned: Activity[]; onOpen: () => void }) {
  const meta = journalMeta(e.category);
  const dated = planned.filter((a) => a.date).map((a) => a.date!).sort();
  return (
    <li>
      <button onClick={onOpen} aria-label={`Ouvrir « ${e.title} »`} className="flex w-full items-start gap-3 rounded-2xl border border-line bg-card p-3 text-left hover:bg-elev">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sun-soft text-sun"><Icon name={meta.icon} size={20} /></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="min-w-0 font-semibold">{e.title}</span>
            {e.priority && <span className="shrink-0 text-xs text-sun" aria-label={PRIORITY_META[e.priority].label}>{PRIORITY_META[e.priority].short}</span>}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-dim">
            {meta.label}{e.city && <> · {e.city}</>}
            {dated.length > 0 ? (
              <Badge tone="success">Planifié · {dated.map(formatDayShort).join(", ")}</Badge>
            ) : planned.length > 0 ? (
              <Badge tone="night">Dans les idées du planning</Badge>
            ) : null}
          </span>
          {e.body && <span className="mt-1 line-clamp-2 block text-sm text-dim">{e.body}</span>}
        </span>
      </button>
    </li>
  );
}
