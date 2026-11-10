import type { IconName } from "@/components/ui/Icon";

export const PLACE_CATEGORIES = ["hotel", "restaurant", "activity", "monument", "station", "airport", "shop", "other"] as const;
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

export const PLACE_META: Record<PlaceCategory, { label: string; plural: string; icon: IconName; color: string }> = {
  // Couleurs fixes (pas de variables de thème) : les marqueurs sont posés sur la carte, quel que soit le thème.
  hotel: { label: "Hôtel", plural: "Hôtels", icon: "bed", color: "#9d86f5" },
  restaurant: { label: "Restaurant", plural: "Restaurants", icon: "food", color: "#f2b632" },
  activity: { label: "Activité", plural: "Activités", icon: "star", color: "#1fbfa3" },
  monument: { label: "Monument", plural: "Monuments", icon: "torii", color: "#f25c5c" },
  station: { label: "Gare", plural: "Gares", icon: "train", color: "#6f8cf2" },
  airport: { label: "Aéroport", plural: "Aéroports", icon: "plane", color: "#3fb7e8" },
  shop: { label: "Magasin", plural: "Magasins", icon: "bag", color: "#f28cab" },
  other: { label: "Autre", plural: "Autres", icon: "pin", color: "#7d86a8" },
};

export const placeMeta = (c: string) => PLACE_META[c as PlaceCategory] ?? PLACE_META.other;

/** Catégorie proposée à partir d'un résultat OpenStreetMap (modifiable par l'utilisateur). */
export function guessCategory(osmCategory: string, osmType: string): PlaceCategory {
  const k = `${osmCategory}:${osmType}`;
  if (/tourism:(hotel|hostel|guest_house|motel|apartment)/.test(k)) return "hotel";
  if (/amenity:(restaurant|cafe|fast_food|bar|pub|food_court)/.test(k)) return "restaurant";
  if (/aeroway:/.test(k)) return "airport";
  if (/railway:(station|halt|stop)|public_transport:station|amenity:bus_station/.test(k)) return "station";
  if (/^shop:|amenity:marketplace/.test(k)) return "shop";
  if (/historic:|amenity:place_of_worship|tourism:(attraction|museum|viewpoint|artwork)|building:(temple|shrine)/.test(k)) return "monument";
  if (/leisure:|tourism:(theme_park|zoo|aquarium)/.test(k)) return "activity";
  return "other";
}
