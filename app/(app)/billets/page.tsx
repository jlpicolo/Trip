import { UpcomingSection } from "@/components/app/UpcomingSection";

export const metadata = { title: "Billets" };

export default function Page() {
  return (
    <UpcomingSection title="Billets" icon="ticket" phase="phase 3c">
      Vols, trains et réservations à portée de main : QR codes en plein écran, consultables sans connexion une fois téléchargés.
    </UpcomingSection>
  );
}
