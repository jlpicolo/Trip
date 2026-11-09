import { UpcomingSection } from "@/components/app/UpcomingSection";

export const metadata = { title: "Carte" };

export default function Page() {
  return (
    <UpcomingSection title="Carte" icon="map" phase="phase 3">
      Carte interactive des hôtels, restaurants, activités et lieux favoris, reliée au planning.
    </UpcomingSection>
  );
}
