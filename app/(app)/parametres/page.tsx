"use client";

import Link from "next/link";
import { SectionTitle } from "@/components/ui/Card";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useTripContext } from "@/components/app/TripContext";
import { TripForm } from "@/components/features/trip/TripForm";
import { TravelersSection } from "@/components/features/settings/TravelersSection";
import { ProfileSection } from "@/components/features/settings/ProfileSection";
import { AppearanceSection } from "@/components/features/settings/AppearanceSection";
import { AccountSection } from "@/components/features/settings/AccountSection";
import { OfflineSection } from "@/components/features/settings/OfflineSection";
import { useSession } from "@/hooks/useSession";
import { getEngine } from "@/lib/sync/client";
import type { TripInput } from "@/lib/validation/schemas";

export default function SettingsPage() {
  const { trip, userId } = useTripContext();
  const session = useSession();
  const toast = useToast();

  async function saveTrip(value: TripInput) {
    if (!trip) return;
    await getEngine().update("trips", trip.id, value);
    toast(navigator.onLine ? "Voyage enregistré." : "Enregistré sur l'appareil, envoyé au retour du réseau.");
  }

  return (
    <div className="flex flex-col">
      <h1 className="mb-4 text-2xl font-bold">Paramètres</h1>
      {trip && (
        <>
          <SectionTitle>Voyage</SectionTitle>
          <Card>
            <TripForm key={`${trip.id}:${trip.version}`} submitLabel="Enregistrer le voyage" onSubmit={saveTrip}
              initial={{
                name: trip.name, start_date: trip.start_date, end_date: trip.end_date, timezone: trip.timezone,
                base_currency: trip.base_currency, secondary_currency: trip.secondary_currency,
                destinations: trip.destinations,
              }} />
          </Card>
          <div id="voyageurs" />
          <SectionTitle>Voyageurs</SectionTitle>
          <TravelersSection groupId={trip.group_id} userId={userId} />
        </>
      )}
      <SectionTitle>Mon profil</SectionTitle>
      <ProfileSection userId={userId} />
      <SectionTitle>Apparence</SectionTitle>
      <AppearanceSection />
      {trip && (
        <>
          <SectionTitle>Hors ligne</SectionTitle>
          <OfflineSection trip={trip} userId={userId} />
        </>
      )}
      <SectionTitle>Synchronisation</SectionTitle>
      <Link href="/synchronisation">
        <Card className="flex items-center gap-3 hover:bg-elev">
          <Icon name="sync" className="text-night" />
          <span className="flex-1 text-sm font-medium">État, conflits et modifications en attente</span>
          <Icon name="chevron" size={18} className="text-mute" />
        </Card>
      </Link>
      <SectionTitle>Compte</SectionTitle>
      {session.status === "signed_in" && <AccountSection username={session.username} />}
    </div>
  );
}
