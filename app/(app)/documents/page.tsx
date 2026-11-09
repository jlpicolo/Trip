import { UpcomingSection } from "@/components/app/UpcomingSection";

export const metadata = { title: "Documents" };

export default function Page() {
  return (
    <UpcomingSection title="Documents" icon="file" phase="phase 3">
      Bibliothèque privée des billets, réservations et assurances, téléchargeables pour le hors ligne.
    </UpcomingSection>
  );
}
