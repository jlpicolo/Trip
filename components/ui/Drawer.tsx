"use client";

import { useEffect, useId, useRef } from "react";
import { Icon } from "./Icon";

/** Feuille glissante depuis le bas (bottom sheet). Un seul Drawer par page, piloté par état. */
export function Drawer({ open, title, onClose, children }: {
  open: boolean; title: string; onClose: () => void; children: React.ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="presentation">
      <button aria-label="Fermer" className="absolute inset-0 bg-black/60" onClick={onClose} tabIndex={-1} />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="animate-sheet-up safe-bottom relative max-h-[90dvh] w-full max-w-[520px] overflow-y-auto rounded-t-3xl border border-line bg-card p-4 shadow-[var(--shadow)] outline-none md:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 id={titleId} className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Fermer" className="grid size-10 place-items-center rounded-full text-dim hover:bg-elev">
            <Icon name="close" size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
