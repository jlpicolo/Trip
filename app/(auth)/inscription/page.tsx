"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, FormError } from "@/components/ui/Field";
import { Card } from "@/components/ui/Card";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { siteUrl } from "@/lib/supabase/env";
import { toMessage } from "@/lib/errors/messages";
import { fieldErrors, signUpSchema } from "@/lib/validation/schemas";
import { safeNext } from "@/lib/navigation";

function SignUpForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = signUpSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    setFormError(null);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setLoading(true);
    const { displayName, email, password } = parsed.data;
    const { data, error } = await getBrowserSupabase().auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setLoading(false);
    if (error) return setFormError(toMessage(error));
    if (data.session) return router.replace(next);
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <Card className="flex flex-col gap-3">
        <h1 className="text-xl font-bold">Vérifiez vos emails</h1>
        <p className="text-sm text-dim">
          Un lien de confirmation a été envoyé à <strong className="text-ink">{sentTo}</strong>. Ouvrez-le sur cet appareil
          pour activer votre compte. Pensez à regarder les courriers indésirables.
        </p>
        <Link href={`/connexion?next=${encodeURIComponent(next)}`} className="text-sm font-semibold text-sakura">Retour à la connexion</Link>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <h1 className="text-2xl font-bold">Créer un compte</h1>
      <FormError message={formError} />
      <Field label="Prénom ou pseudo" name="displayName" autoComplete="nickname" required error={errors.displayName}
        hint="Affiché aux autres voyageurs" />
      <Field label="Email" name="email" type="email" autoComplete="email" inputMode="email" required error={errors.email} />
      <Field label="Mot de passe" name="password" type="password" autoComplete="new-password" required minLength={10}
        error={errors.password} hint="10 caractères minimum" />
      <Button type="submit" loading={loading} block>Créer mon compte</Button>
      <p className="text-center text-sm text-dim">
        Déjà inscrit ? <Link href={`/connexion?next=${encodeURIComponent(next)}`} className="font-semibold text-sakura">Se connecter</Link>
      </p>
    </form>
  );
}

export default function SignUpPage() {
  return <Suspense><SignUpForm /></Suspense>;
}
