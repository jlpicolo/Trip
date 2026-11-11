"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Spinner } from "@/components/ui/EmptyState";
import { useSession } from "@/hooks/useSession";
import { ACTIVE_TRIP_KEY, useActiveTripId, useDirectoryLoaded, useTrip, useTrips } from "@/hooks/useTrip";
import { useSyncStatus } from "@/hooks/useSync";
import { EmptyState } from "@/components/ui/EmptyState";
import { getLocalDb } from "@/lib/db/schema";
import { AutoSync } from "./AutoSync";
import { BottomNav, SideNav } from "./AppNav";
import { SyncIndicator } from "./SyncIndicator";
import { TripContext } from "./TripContext";

const NO_TRIP_ALLOWED = ["/bienvenue", "/synchronisation", "/parametres"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const session = useSession();
  const activeId = useActiveTripId();
  const trips = useTrips();
  const trip = useTrip(activeId);
  const directoryLoaded = useDirectoryLoaded();
  const sync = useSyncStatus();

  useEffect(() => {
    if (session.status === "signed_out") router.replace(`/connexion?next=${encodeURIComponent(path)}`);
  }, [session.status, path, router]);

  // Voyage actif absent ou supprimé : on bascule sur le premier voyage connu.
  // Au rechargement, `trip` peut encore valoir null (requête précédente) alors que l'identifiant actif
  // est déjà connu : on vérifie dans la base avant de basculer, sinon un 2ᵉ voyage serait abandonné.
  useEffect(() => {
    if (trips === undefined || activeId === undefined || trip === undefined || trip || trips.length === 0) return;
    let cancelled = false;
    void (async () => {
      const db = getLocalDb();
      const row = activeId ? await db.data("trips").get(activeId) : undefined;
      if (!cancelled && (!row || row.deleted_at)) await db.setMeta(ACTIVE_TRIP_KEY, trips[0].id);
    })();
    return () => {
      cancelled = true;
    };
  }, [trips, activeId, trip]);

  if (session.status !== "signed_in") return <Spinner />;

  const waitingTrip = trips === undefined || activeId === undefined || trip === undefined || directoryLoaded === undefined;
  const needsTrip = !NO_TRIP_ALLOWED.some((p) => path.startsWith(p));
  // On ne propose de créer un voyage qu'après avoir vérifié auprès du serveur qu'il
  // n'en existe aucun : sinon un nouvel appareil créerait un doublon.
  const noTripYet = !waitingTrip && !trip && trips.length === 0 && !!directoryLoaded;
  const neverLoaded = !waitingTrip && !trip && trips.length === 0 && !directoryLoaded;

  return (
    <div className="flex min-h-dvh">
      <AutoSync userId={session.userId} />
      <SideNav />
      <div className="min-w-0 flex-1">
        <header className="safe-top sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur">
          <div className="mx-auto flex min-h-14 max-w-[440px] items-center justify-between gap-2 px-4 md:max-w-[880px] md:px-8 xl:max-w-[1120px]">
            <p className="truncate font-semibold">{trip?.name ?? "Japan Trip"}</p>
            <SyncIndicator />
          </div>
        </header>
        <main className="app-main animate-fade-up">
          {needsTrip && waitingTrip ? (
            <Spinner />
          ) : needsTrip && neverLoaded ? (
            sync.online ? (
              <Spinner label="Première synchronisation…" />
            ) : (
              <EmptyState icon="cloudOff" title="Connexion requise">
                Cet appareil n&apos;a encore jamais été synchronisé. Connectez-vous à internet une première fois pour
                récupérer vos voyages ; ils resteront ensuite consultables hors ligne.
              </EmptyState>
            )
          ) : needsTrip && noTripYet ? (
            <RedirectTo href="/bienvenue" />
          ) : needsTrip && !trip ? (
            <Spinner />
          ) : (
            <TripContext.Provider value={{ trip: trip ?? null, userId: session.userId, offline: session.offline }}>
              {children}
            </TripContext.Provider>
          )}
        </main>
        <BottomNav />
      </div>
    </div>
  );
}

function RedirectTo({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => router.replace(href), [href, router]);
  return <Spinner />;
}
