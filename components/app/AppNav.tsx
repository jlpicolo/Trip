"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { PRIMARY_NAV, SECONDARY_NAV } from "./nav";

const isActive = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

export function BottomNav() {
  const path = usePathname();
  const moreActive = SECONDARY_NAV.some((n) => isActive(path, n.href)) || isActive(path, "/plus");
  const items = [...PRIMARY_NAV, { href: "/plus", label: "Plus", icon: "more" as const }];
  return (
    <nav aria-label="Navigation principale"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur md:hidden">
      <ul className="mx-auto flex max-w-[440px]">
        {items.map((n) => {
          const active = n.href === "/plus" ? moreActive : isActive(path, n.href);
          return (
            <li key={n.href} className="flex-1">
              <Link href={n.href} aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors ${active ? "text-coral" : "text-dim"}`}>
                <Icon name={n.icon} size={22} />
                {n.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SideNav() {
  const path = usePathname();
  return (
    <nav aria-label="Navigation principale" className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 border-r border-line p-4 md:flex">
      <div className="mb-4 flex items-center gap-2 px-2 py-2">
        <div className="grid size-9 place-items-center rounded-xl bg-coral text-on-accent"><Icon name="torii" size={20} /></div>
        <span className="font-bold">Japan Trip</span>
      </div>
      {[...PRIMARY_NAV, ...SECONDARY_NAV].map((n) => {
        const active = isActive(path, n.href);
        return (
          <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium ${active ? "bg-coral-soft text-coral" : "text-dim hover:bg-elev hover:text-ink"}`}>
            <Icon name={n.icon} size={20} />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
