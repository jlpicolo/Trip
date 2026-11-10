import { redirect } from "next/navigation";

// Trajets et documents sont réunis dans l'onglet Billets.
export default function Page() {
  redirect("/billets");
}
