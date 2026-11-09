"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormError } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/EmptyState";
import { useSession } from "@/hooks/useSession";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { getEngine } from "@/lib/sync/client";
import { getLocalDb } from "@/lib/db/schema";
import { ACTIVE_TRIP_KEY } from "@/hooks/useTrip";
import { toMessage } from "@/lib/errors/messages";
import type { Trip } from "@/lib/types/trip";

function Invitation() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const session = useSession();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const here = `/invitation?token=${encodeURIComponent(token)}`;

  if (!/^[0-9a-f]{64}$/.test(token)) {
    return <FormError message="Ce lien d'invitation est incomplet. Demandez à un voyageur de vous le renvoyer." />;
  }
  if (session.status === "loading") return <Spinner />;

  if (session.status === "signed_out") {
    return (
      <Card className="flex flex-col gap-3">
        <h1 className="text-xl font-bold">Vous êtes invité à un voyage</h1>
        <p className="text-sm text-dim">
          Créez votre compte avec l&apos;adresse email à laquelle l&apos;invitation est destinée, ou connectez-vous si vous en avez déjà un.
        </p>
        <ButtonLink href={`/inscription?next=${encodeURIComponent(here)}`} block>Créer mon compte</ButtonLink>
        <ButtonLink href={`/connexion?next=${encodeURIComponent(here)}`} variant="ghost" block>J&apos;ai déjà un compte</ButtonLink>
      </Card>
    );
  }

  async function accept() {
    setError(null);
    setLoading(true);
    try {
      const { data: groupId, error: err } = await getBrowserSupabase().rpc("accept_invitation", { p_token: token });
      if (err) throw err;
      const engine = getEngine();
      await engine.refreshDirectory();
      const db = getLocalDb();
      const trips = ((await db.data("trips").where("group_id").equals(groupId as string).toArray()) as Trip[])
        .filter((t) => !t.deleted_at)
        .sort((a, b) => a.start_date.localeCompare(b.start_date));
      if (trips[0]) {
        await db.setMeta(ACTIVE_TRIP_KEY, trips[0].id);
        await engine.sync(trips[0].id);
        router.replace("/accueil");
      } else {
        router.replace("/bienvenue");
      }
    } catch (e) {
      setError(toMessage(e));
      setLoading(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <h1 className="text-xl font-bold">Rejoindre le groupe de voyage</h1>
      <p className="text-sm text-dim">
        Connecté en tant que <strong className="text-ink">{session.email}</strong>. Une fois membre, vous aurez exactement
        les mêmes droits que les autres voyageurs.
      </p>
      <FormError message={error} />
      <Button onClick={accept} loading={loading} block>Rejoindre</Button>
    </Card>
  );
}

export default function InvitationPage() {
  return <Suspense><Invitation /></Suspense>;
}
