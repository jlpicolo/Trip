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
    const { error } = await getBrowserSupabase().auth.signInWithPassword(parsed.data);
    setLoading(false);
    if (error) return setFormError(toMessage(error));
    router.replace(next);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <h1 className="text-2xl font-bold">Connexion</h1>
      <FormError message={formError ?? linkError} />
      <Field label="Email" name="email" type="email" autoComplete="email" inputMode="email" required error={errors.email} />
      <Field label="Mot de passe" name="password" type="password" autoComplete="current-password" required error={errors.password} />
      <Button type="submit" loading={loading} block>Se connecter</Button>
      <div className="flex flex-col gap-2 text-center text-sm">
        <Link href="/mot-de-passe-oublie" className="text-dim underline-offset-4 hover:underline">Mot de passe oublié ?</Link>
        <p className="text-dim">
          Pas encore de compte ?{" "}
          <Link href={`/inscription?next=${encodeURIComponent(next)}`} className="font-semibold text-sakura">Créer un compte</Link>
        </p>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
