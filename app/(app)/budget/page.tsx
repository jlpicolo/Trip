import { UpcomingSection } from "@/components/app/UpcomingSection";

export const metadata = { title: "Budget" };

export default function Page() {
  return (
    <UpcomingSection title="Budget" icon="wallet" phase="phase 4">
      Pot commun, dépenses individuelles, soldes, remboursements et convertisseur EUR / JPY.
    </UpcomingSection>
  );
}
