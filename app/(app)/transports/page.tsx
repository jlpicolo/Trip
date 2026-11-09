import { UpcomingSection } from "@/components/app/UpcomingSection";

export const metadata = { title: "Transports" };

export default function Page() {
  return (
    <UpcomingSection title="Transports" icon="train" phase="phase 3">
      Vols, trains, shinkansen, bus et ferries avec billets et QR codes consultables hors ligne.
    </UpcomingSection>
  );
}
