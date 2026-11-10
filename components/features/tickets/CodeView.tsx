"use client";

import { useEffect, useRef, useState } from "react";
import { drawCode } from "@/lib/codes";
import { SQUARE_CODES } from "@/lib/tickets";
import type { CodeFormat } from "@/lib/types/tickets";

/** Code (QR, Aztec, code-barres…) généré sur l'appareil : aucun réseau nécessaire. */
export function CodeView({ format, value, label, large = false }: { format: CodeFormat; value: string; label: string; large?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!canvas.current) return;
    drawCode(canvas.current, format, value, large ? 8 : 4)
      .then(() => !cancelled && setError(null))
      .catch(() => !cancelled && setError("Impossible de dessiner ce code : vérifiez son contenu et son format."));
    return () => {
      cancelled = true;
    };
  }, [format, value, large]);

  const square = SQUARE_CODES.has(format);
  return (
    <div className="flex flex-col items-center gap-2">
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      <canvas ref={canvas} role="img" aria-label={label} hidden={!!error}
        className={`rounded-lg bg-white ${square ? (large ? "w-[min(86vw,70dvh)]" : "w-48") : (large ? "w-[min(94vw,900px)]" : "w-full max-w-80")} h-auto [image-rendering:pixelated]`} />
    </div>
  );
}
