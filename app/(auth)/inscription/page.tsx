import Link from "next/link";
import { Card } from "@/components/ui/Card";

export const metadata = { title: "Inscription" };

// L'inscription publique est désactivée côté Supabase : les comptes sont créés par
// le propriétaire du service (scripts/travelers.mjs). Page conservée pour les anciens liens.
export default function SignUpPage() {
  return (
    <Card className="flex flex-col gap-3">
      <h1 className="text-xl font-bold">Comptes sur invitation</h1>
      <p className="text-sm text-dim">
        Les comptes Japan Trip sont créés par l&apos;organisateur du voyage, qui vous transmet votre identifiant et
        votre mot de passe. Vous pourrez ensuite changer ce mot de passe dans Paramètres.
      </p>
      <Link href="/connexion" className="text-sm font-semibold text-sakura">Aller à la connexion</Link>
    </Card>
  );
}
