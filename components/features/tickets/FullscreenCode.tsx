"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { CodeView } from "./CodeView";
import type { CodeFormat } from "@/lib/types/tickets";

/**
 * Billet présenté au contrôle : fond blanc plein écran, code agrandi, écran maintenu
 * allumé quand le navigateur le permet (Wake Lock). La luminosité ne peut pas être forcée par le web.
 */
export function FullscreenCode({ title, subtitle, format, value, onClose }: {
  title: string; subtitle?: string | null; format: CodeFormat; value: string; onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => undefined);
    const el = root.current;
    el?.requestFullscreen?.().catch(() => undefined);
    el?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      void lock?.release().catch(() => undefined);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [onClose]);

  return createPortal(
    <div ref={root} role="dialog" aria-modal="true" aria-label={`Billet plein écran : ${title}`} tabIndex={-1}
      className="safe-top safe-bottom fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 overflow-y-auto bg-white p-4 text-[#0b1020] outline-none">
      <button onClick={onClose} className="absolute right-3 top-3 flex min-h-11 items-center gap-2 rounded-full border border-black/15 px-4 text-sm font-semibold">
        <Icon name="close" size={18} /> Fermer
      </button>
      <div className="text-center">
        <p className="text-lg font-bold">{title}</p>
        {subtitle && <p className="text-sm text-[#40465f]">{subtitle}</p>}
      </div>
      <CodeView format={format} value={value} label={`Code de « ${title} »`} large />
    </div>,
    document.body,
  );
}
