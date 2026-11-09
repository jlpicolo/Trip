"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, FormError } from "@/components/ui/Field";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { siteUrl } from "@/lib/supabase/env";
import { toMessage } from "@/lib/errors/messages";
import { emailSchema } from "@/lib/validation/schemas";

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = emailSchema.safeParse(new FormData(e.currentTarget).get("email"));
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setError(null);
    setLoading(true);
    const { error: err } = await getBrowserSupabase().auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${siteUrl()}/auth/callback?next=/nouveau-mot-de-passe`,
    });
    setLoading(false);
    if (err) return setError(toMessage(err));
    setSent(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Mot de passe oublié</h1>
      {sent ? (
        <Card className="text-sm text-dim">
          Si un compte existe pour cette adresse, un email contenant un lien de réinitialisation vient d&apos;être envoyé.
        </Card>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <FormError message={error} />
          <Field label="Email du compte" name="email" type="email" autoComplete="email" inputMode="email" required />
          <Button type="submit" loading={loading} block>Recevoir le lien</Button>
        </form>
      )}
      <Link href="/connexion" className="text-center text-sm text-dim underline-offset-4 hover:underline">Retour à la connexion</Link>
    </div>
  );
}
