"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useSyncStatus } from "@/hooks/useSync";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { getLocalDb, wipeLocalDb } from "@/lib/db/schema";
import { getEngine } from "@/lib/sync/client";

export function AccountSection({ email }: { email: string }) {
  const router = useRouter();
  const { pending } = useSyncStatus();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function logout() {
    if (pending > 0 && !confirming) return setConfirming(true);
    setLoading(true);
    // Effacement AVANT la fin de session : les billets et documents ne doivent jamais
    // rester sur un appareil déconnecté, même si l'app est fermée juste après.
    await getEngine().pause();
    await wipeLocalDb(getLocalDb());
    await getBrowserSupabase().auth.signOut({ scope: "local" });
    router.replace("/connexion");
  }

  return (
    <Card className="flex flex-col gap-3">
      <p className="text-sm text-dim">Connecté avec <strong className="text-ink">{email}</strong></p>
      <Link href="/nouveau-mot-de-passe" className="text-sm font-semibold text-sakura">Changer de mot de passe</Link>
      {confirming && (
        <p role="alert" className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          {pending} modification(s) n&apos;ont pas encore été envoyées et seront perdues. Synchronisez d&apos;abord, ou confirmez la déconnexion.
        </p>
      )}
      <Button variant="danger" icon="logout" onClick={logout} loading={loading}>
        {confirming ? "Se déconnecter quand même" : "Se déconnecter"}
      </Button>
    </Card>
  );
}
