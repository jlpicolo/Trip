"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { TripForm } from "@/components/features/trip/TripForm";
import { useToast } from "@/components/ui/Toast";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { getEngine } from "@/lib/sync/client";
import { getLocalDb } from "@/lib/db/schema";
import { ACTIVE_TRIP_KEY, useDirectoryLoaded, useTrips } from "@/hooks/useTrip";
import { toMessage } from "@/lib/errors/messages";
import { newId } from "@/lib/ids";
import type { TripInput } from "@/lib/validation/schemas";

// Valeurs du premier voyage, fournies par les voyageurs : simple pré-remplissage, toutes modifiables.
const FIRST_TRIP: TripInput = {
  name: "Japan Trip",
  start_date: "2027-03-09",
  end_date: "2027-03-30",
  timezone: "Asia/Tokyo",
  base_currency: "EUR",
  secondary_currency: "JPY",
  destinations: ["Osaka", "Nara", "Kyoto", "Kanazawa", "Nagano", "Tokyo"].map((name) => ({ id: newId(), name })),
};

export default function WelcomePage() {
  const router = useRouter();
  const toast = useToast();
  const trips = useTrips();
  const loaded = useDirectoryLoaded();
  const [creating, setCreating] = useState(false);
  const hasTrip = !!trips && trips.length > 0;

  // Un voyage existe déjà (reçu par synchronisation) : pas de création en double.
  useEffect(() => {
    if (hasTrip && !creating) router.replace("/accueil");
  }, [hasTrip, creating, router]);

  async function create(value: TripInput) {
    setCreating(true);
    try {
      await createTrip(value);
    } catch (e) {
      setCreating(false);
      throw e;
    }
  }

  async function createTrip(value: TripInput) {
    if (!navigator.onLine) throw new Error("Connexion internet requise pour créer le groupe de voyage.");
    const { data: groupId, error } = await getBrowserSupabase().rpc("create_group", { p_name: value.name });
    if (error) throw new Error(toMessage(error));
    const engine = getEngine();
    const id = await engine.insert("trips", { ...value, group_id: groupId as string, locale: "fr" });
    await getLocalDb().setMeta(ACTIVE_TRIP_KEY, id);
    await engine.refreshDirectory().catch(() => undefined);
    await engine.sync(id);
    toast("Voyage créé. Invitez maintenant les autres voyageurs.");
    router.replace("/parametres#voyageurs");
  }

  if (trips === undefined || loaded === undefined || (hasTrip && !creating)) return <Spinner />;
  if (!loaded) return <Spinner label="Recherche de vos voyages…" />;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Bienvenue</h1>
        <p className="mt-1 text-sm text-dim">Créez le voyage, puis invitez les autres voyageurs. Vous aurez tous les mêmes droits.</p>
      </div>
      <Card className="border-night/30 bg-night-soft text-sm">
        Un autre voyageur a déjà créé le voyage ? Ouvrez le <strong>lien d&apos;invitation</strong> qu&apos;il vous a envoyé :
        inutile d&apos;en créer un second.
      </Card>
      <Card><TripForm initial={FIRST_TRIP} submitLabel="Créer le voyage" onSubmit={create} /></Card>
    </div>
  );
}
