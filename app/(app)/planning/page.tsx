import { UpcomingSection } from "@/components/app/UpcomingSection";

export const metadata = { title: "Planning" };

export default function Page() {
  return (
    <UpcomingSection title="Planning" icon="calendar" phase="phase 3">
      Timeline et calendrier du 1er au dernier jour, activités avec ou sans horaire, idées, glisser-déposer.
    </UpcomingSection>
  );
}
