"use client";

import { useEffect, useState } from "react";

/**
 * Enregistre le service worker (production uniquement : en dev, il servirait des fichiers
 * périmés à Turbopack) et propose la nouvelle version quand elle est prête, sans jamais
 * recharger de force (une saisie en cours serait perdue).
 */
const RELOAD_KEY = "jt-sw-reload";

export function ServiceWorker() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    const watch = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        sw?.addEventListener("statechange", () => {
          // Première installation : rien à proposer, la page est déjà à jour.
          if (sw.state === "installed" && navigator.serviceWorker.controller && !cancelled) setWaiting(sw);
        });
      });
    };
    // Installation après le chargement de la page : le préchargement hors ligne (quelques Mo)
    // ne doit pas ralentir le premier affichage.
    const register = () =>
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(watch).catch(() => undefined);
    let delay: ReturnType<typeof setTimeout> | undefined;
    const onLoad = () => {
      delay = setTimeout(register, 2000);
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    // Le stockage persistant limite l'effacement des billets par le navigateur en cas de manque de place.
    void navigator.storage?.persist?.().catch(() => false);
    // Recharger uniquement après « Recharger » : à la première installation, le service worker
    // prend aussi la main (controllerchange) et un rechargement serait inutile et déroutant.
    const onController = () => {
      if (sessionStorage.getItem(RELOAD_KEY) !== "1") return;
      sessionStorage.removeItem(RELOAD_KEY);
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onController);
    return () => {
      cancelled = true;
      if (delay) clearTimeout(delay);
      window.removeEventListener("load", onLoad);
      navigator.serviceWorker.removeEventListener("controllerchange", onController);
    };
  }, []);

  if (!waiting) return null;
  return (
    <div role="status" className="safe-bottom fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 md:bottom-4">
      <div className="flex w-full max-w-[440px] items-center justify-between gap-3 rounded-2xl border border-line-strong bg-elev px-4 py-3 shadow-[var(--shadow)]">
        <p className="text-sm">Nouvelle version disponible.</p>
        <button onClick={() => { sessionStorage.setItem(RELOAD_KEY, "1"); waiting.postMessage("SKIP_WAITING"); }} className="min-h-11 rounded-xl bg-coral px-4 text-sm font-semibold text-on-accent">
          Recharger
        </button>
      </div>
    </div>
  );
}
