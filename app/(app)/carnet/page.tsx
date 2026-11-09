import { UpcomingSection } from "@/components/app/UpcomingSection";

export const metadata = { title: "Carnet de voyage" };

export default function Page() {
  return (
    <UpcomingSection title="Carnet de voyage" icon="book" phase="phase 3">
      Bonnes adresses, spécialités, boutiques et idées, transformables en activités.
    </UpcomingSection>
  );
}
