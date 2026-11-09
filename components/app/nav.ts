import type { IconName } from "@/components/ui/Icon";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

export const PRIMARY_NAV: NavItem[] = [
  { href: "/accueil", label: "Accueil", icon: "home" },
  { href: "/planning", label: "Planning", icon: "calendar" },
  { href: "/carte", label: "Carte", icon: "map" },
  { href: "/budget", label: "Budget", icon: "wallet" },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: "/transports", label: "Transports", icon: "train" },
  { href: "/hebergements", label: "Hébergements", icon: "bed" },
  { href: "/carnet", label: "Carnet de voyage", icon: "book" },
  { href: "/documents", label: "Documents", icon: "file" },
  { href: "/parametres", label: "Paramètres", icon: "settings" },
];
