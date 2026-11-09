"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, FormError } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { toMessage } from "@/lib/errors/messages";
import { passwordSchema } from "@/lib/validation/schemas";

export default function NewPasswordPage() {
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = passwordSchema.safeParse(fd.get("password"));
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    if (fd.get("confirm") !== parsed.data) return setError("Les deux mots de passe ne correspondent pas.");
    setError(null);
    setLoading(true);
    const { error: err } = await getBrowserSupabase().auth.updateUser({ password: parsed.data });
    setLoading(false);
    if (err) return setError(toMessage(err));
    toast("Mot de passe modifié.");
    router.replace("/accueil");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <h1 className="text-2xl font-bold">Nouveau mot de passe</h1>
      <FormError message={error} />
      <Field label="Nouveau mot de passe" name="password" type="password" autoComplete="new-password" hint="10 caractères minimum" />
      <Field label="Confirmation" name="confirm" type="password" autoComplete="new-password" />
      <Button type="submit" loading={loading} block>Enregistrer</Button>
    </form>
  );
}
