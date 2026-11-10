import type { IconName } from "@/components/ui/Icon";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

// Billets dans la barre du bas : c'est ce qu'on cherche en premier sur place (contrôle, embarquement).
export const PRIMARY_NAV: NavItem[] = [
  { href: "/accueil", label: "Accueil", icon: "home" },
  { href: "/planning", label: "Planning", icon: "calendar" },
  { href: "/carte", label: "Carte", icon: "map" },
  { href: "/billets", label: "Billets", icon: "ticket" },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: "/budget", label: "Budget", icon: "wallet" },
  { href: "/transports", label: "Transports", icon: "train" },
  { href: "/hebergements", label: "Hébergements", icon: "bed" },
  { href: "/carnet", label: "Carnet de voyage", icon: "book" },
  { href: "/documents", label: "Documents", icon: "file" },
  { href: "/parametres", label: "Paramètres", icon: "settings" },
];
