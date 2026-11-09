import { EmptyState } from "@/components/ui/EmptyState";
import type { IconName } from "@/components/ui/Icon";

/** Section prévue mais pas encore développée : annoncée honnêtement, sans faux contenu. */
export function UpcomingSection({ title, icon, phase, children }: {
  title: string; icon: IconName; phase: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <EmptyState icon={icon} title={`Disponible à la ${phase}`}>{children}</EmptyState>
    </div>
  );
}
