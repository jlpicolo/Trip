"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, FormError } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { getLocalDb } from "@/lib/db/schema";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { getEngine } from "@/lib/sync/client";
import { toMessage } from "@/lib/errors/messages";
import { profileSchema } from "@/lib/validation/schemas";

export const TRAVELER_COLORS = ["#e8452c", "#f4a6c0", "#7e93d6", "#5fe0a0", "#eab245", "#b88cfa", "#4cc3d9", "#f08a4b"];

export function ProfileSection({ userId }: { userId: string }) {
  const profile = useLiveQuery(() => getLocalDb().profiles.get(userId), [userId]);
  if (!profile) return <Card className="text-sm text-dim">Profil disponible après la première synchronisation.</Card>;
  // Remonte le formulaire quand le profil change côté serveur (valeurs initiales à jour).
  return <ProfileForm key={`${profile.display_name}|${profile.color}`} userId={userId} initialName={profile.display_name} initialColor={profile.color} />;
}

function ProfileForm({ userId, initialName, initialColor }: { userId: string; initialName: string; initialColor: string }) {
  const toast = useToast();
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = profileSchema.safeParse({ display_name: name, color });
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    if (!navigator.onLine) return setError("Connexion internet requise pour modifier le profil.");
    setError(null);
    setSaving(true);
    const { error: err } = await getBrowserSupabase().from("profiles").update(parsed.data).eq("id", userId);
    if (!err) await getEngine().refreshDirectory().catch(() => undefined);
    setSaving(false);
    if (err) return setError(toMessage(err));
    toast("Profil enregistré.");
  }

  return (
    <Card>
      <form onSubmit={save} className="flex flex-col gap-4" noValidate>
        <FormError message={error} />
        <Field label="Prénom ou pseudo" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-dim">Couleur d&apos;identification</legend>
          <div className="flex flex-wrap gap-2">
            {TRAVELER_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Couleur ${c}`} aria-pressed={color === c}
                className={`size-11 rounded-full border-2 ${color === c ? "border-ink" : "border-transparent"}`} style={{ background: c }} />
            ))}
          </div>
        </fieldset>
        <Button type="submit" loading={saving}>Enregistrer le profil</Button>
      </form>
    </Card>
  );
}
