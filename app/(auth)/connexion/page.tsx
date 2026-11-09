"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, FormError } from "@/components/ui/Field";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { toMessage } from "@/lib/errors/messages";
import { fieldErrors, signInSchema } from "@/lib/validation/schemas";
import { safeNext } from "@/lib/navigation";
import { usernameToEmail } from "@/lib/auth/username";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const linkError = params.get("erreur") === "lien" ? "Ce lien est invalide ou a expiré. Reconnectez-vous ou demandez-en un nouveau." : null;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget));
    const parsed = signInSchema.safeParse(form);
    setFormError(null);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setLoading(true);
    const { error } = await getBrowserSupabase().auth.signInWithPassword({
      email: usernameToEmail(parsed.data.username)!,
      password: parsed.data.password,
    });
    setLoading(false);
    if (error) return setFormError(toMessage(error));
    router.replace(next);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <h1 className="text-2xl font-bold">Connexion</h1>
      <FormError message={formError ?? linkError} />
      <Field label="Nom d'utilisateur" name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off"
        spellCheck={false} required error={errors.username} />
      <Field label="Mot de passe" name="password" type="password" autoComplete="current-password" required error={errors.password} />
      <Button type="submit" loading={loading} block>Se connecter</Button>
      <div className="flex flex-col gap-2 text-center text-sm text-dim">
        <p>Votre nom d&apos;utilisateur et votre mot de passe vous sont transmis par l&apos;organisateur du voyage.</p>
        <Link href="/mot-de-passe-oublie" className="underline-offset-4 hover:underline">Mot de passe oublié ?</Link>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
