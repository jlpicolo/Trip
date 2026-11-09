import Link from "next/link";
import { Card } from "@/components/ui/Card";

export const metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Mot de passe oublié</h1>
      <Card className="flex flex-col gap-2 text-sm text-dim">
        <p>Demandez à l&apos;organisateur du voyage de réinitialiser votre mot de passe : il vous en communiquera un nouveau.</p>
        <p>Une fois connecté, vous pourrez le remplacer par le vôtre dans <strong className="text-ink">Paramètres › Compte</strong>.</p>
      </Card>
      <Link href="/connexion" className="text-center text-sm text-dim underline-offset-4 hover:underline">Retour à la connexion</Link>
    </div>
  );
}
