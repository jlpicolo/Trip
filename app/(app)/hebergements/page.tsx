import { UpcomingSection } from "@/components/app/UpcomingSection";

export const metadata = { title: "Hébergements" };

export default function Page() {
  return (
    <UpcomingSection title="Hébergements" icon="bed" phase="phase 3">
      Fiches des logements, confirmations, itinéraires et rattachement aux journées.
    </UpcomingSection>
  );
}
