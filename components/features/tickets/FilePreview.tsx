"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";

/** Aperçu d'un fichier présent sur l'appareil (lu depuis IndexedDB, jamais depuis le réseau). */
export function FilePreview({ blob, title }: { blob: Blob; title: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    const u = URL.createObjectURL(blob);
    // URL d'objet : ressource du navigateur créée et libérée avec l'effet (double montage compris).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  if (!url) return null;
  const isPdf = blob.type === "application/pdf";
  return (
    <div className="flex flex-col gap-2">
      {isPdf ? (
        <object data={url} type="application/pdf" aria-label={`Aperçu de « ${title} »`} className="h-[60dvh] w-full rounded-xl border border-line bg-white">
          <p className="p-3 text-sm text-dim">Aperçu PDF indisponible dans ce navigateur : utilisez « Ouvrir ».</p>
        </object>
      ) : broken ? (
        <p className="rounded-xl bg-elev p-3 text-sm text-dim">
          Ce navigateur ne sait pas afficher ce format (HEIC hors iPhone, par exemple) : utilisez « Ouvrir » ou « Enregistrer ».
        </p>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- blob local, next/image inutilisable
        <img src={url} alt={`Aperçu de « ${title} »`} onError={() => setBroken(true)} className="max-h-[70dvh] w-full rounded-xl border border-line object-contain bg-white" />
      )}
      <div className="flex flex-wrap gap-2">
        <a href={url} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong px-4 text-sm font-semibold hover:bg-elev">
          <Icon name="external" size={18} /> Ouvrir
        </a>
        <a href={url} download={title} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong px-4 text-sm font-semibold hover:bg-elev">
          <Icon name="download" size={18} /> Enregistrer
        </a>
      </div>
    </div>
  );
}
