"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, FormError } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { useTravelers } from "@/hooks/useTrip";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { toMessage } from "@/lib/errors/messages";
import { emailSchema } from "@/lib/validation/schemas";

interface PendingInvite { id: string; email: string; expires_at: string }

async function fetchPending(groupId: string): Promise<PendingInvite[] | null> {
  if (!navigator.onLine) return null;
  const { data, error } = await getBrowserSupabase()
    .from("group_invitations").select("id,email,expires_at")
    .eq("group_id", groupId).is("accepted_at", null).gt("expires_at", new Date().toISOString()).order("created_at");
  return error ? null : ((data as PendingInvite[]) ?? []);
}

export function TravelersSection({ groupId, userId }: { groupId: string; userId: string }) {
  const travelers = useTravelers(groupId);
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const [pending, setPending] = useState<PendingInvite[] | null>(null);
  const [loading, setLoading] = useState(false);

  const [refresh, setRefresh] = useState(0);
  const loadPending = () => setRefresh((n) => n + 1);

  useEffect(() => {
    let active = true;
    fetchPending(groupId).then((list) => active && setPending(list));
    return () => {
      active = false;
    };
  }, [groupId, refresh]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    if (!navigator.onLine) return setError("Connexion internet requise pour créer une invitation.");
    setError(null);
    setLoading(true);
    const { data: token, error: err } = await getBrowserSupabase().rpc("create_invitation", { p_group_id: groupId, p_email: parsed.data });
    setLoading(false);
    if (err) return setError(toMessage(err));
    setLink({ email: parsed.data, url: `${window.location.origin}/invitation?token=${token}` });
    setEmail("");
    loadPending();
  }

  async function share() {
    if (!link) return;
    const text = `Rejoins notre voyage sur Japan Trip : ${link.url}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Invitation Japan Trip", text, url: link.url });
        return;
      } catch {
        // partage annulé : on propose la copie
      }
    }
    await copy();
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      toast("Lien copié.");
    } catch {
      toast("Copie impossible : sélectionnez le lien manuellement.", "error");
    }
  }

  async function revoke(id: string) {
    const { error: err } = await getBrowserSupabase().from("group_invitations").delete().eq("id", id);
    if (err) return toast(toMessage(err), "error");
    toast("Invitation annulée.");
    loadPending();
  }

  return (
    <Card className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {(travelers ?? []).map((t) => (
          <li key={t.id} className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full text-sm font-bold text-on-accent" style={{ background: t.color }} aria-hidden="true">
              {t.display_name.slice(0, 1).toUpperCase()}
            </span>
            <span className="flex-1 text-sm">{t.display_name}{t.id === userId && <span className="text-mute"> (vous)</span>}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-mute">Tous les membres ont exactement les mêmes droits.</p>

      <form onSubmit={invite} className="flex flex-col gap-3" noValidate>
        <FormError message={error} />
        <Field label="Inviter un voyageur (email)" type="email" inputMode="email" value={email}
          onChange={(e) => setEmail(e.target.value)} hint="Le voyageur doit déjà avoir un compte avec cette adresse (créé par l'organisateur)." />
        <Button type="submit" variant="subtle" icon="plus" loading={loading}>Créer le lien d&apos;invitation</Button>
      </form>

      {link && (
        <div className="flex flex-col gap-2 rounded-xl border border-sakura/30 bg-sakura-soft p-3">
          <p className="text-sm">Lien pour <strong>{link.email}</strong> (valable 14 jours, une seule utilisation) :</p>
          <input readOnly value={link.url} aria-label="Lien d'invitation" onFocus={(e) => e.currentTarget.select()}
            className="min-h-11 w-full rounded-lg border border-line bg-card px-2 font-mono text-xs" />
          <div className="flex gap-2">
            <Button type="button" icon="share" onClick={share} className="flex-1">Partager</Button>
            <Button type="button" variant="ghost" icon="copy" onClick={copy} className="flex-1">Copier</Button>
          </div>
        </div>
      )}

      {pending && pending.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-dim">Invitations en attente</p>
          <ul className="flex flex-col gap-2">
            {pending.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">{p.email}</span>
                <Button variant="ghost" onClick={() => revoke(p.id)}>Annuler</Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
