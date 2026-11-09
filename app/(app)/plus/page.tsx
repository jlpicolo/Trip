import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { SECONDARY_NAV } from "@/components/app/nav";

export const metadata = { title: "Plus" };

export default function MorePage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="mb-2 text-2xl font-bold">Plus</h1>
      {SECONDARY_NAV.map((n) => (
        <Link key={n.href} href={n.href}>
          <Card className="flex items-center gap-3 hover:bg-elev">
            <div className="grid size-10 place-items-center rounded-xl bg-night-soft text-night"><Icon name={n.icon} size={20} /></div>
            <span className="flex-1 font-medium">{n.label}</span>
            <Icon name="chevron" size={18} className="text-mute" />
          </Card>
        </Link>
      ))}
    </div>
  );
}
