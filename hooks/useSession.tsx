"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { getLocalDb, wipeLocalDb } from "@/lib/db/schema";
import { getEngine } from "@/lib/sync/client";
import { emailToUsername } from "@/lib/auth/username";

export type SessionState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "signed_in"; userId: string; email: string; username: string; offline: boolean };

const SessionContext = createContext<SessionState>({ status: "loading" });

/**
 * La session Supabase est lue depuis le stockage local (pas de réseau). Hors ligne,
 * si le jeton ne peut pas être rafraîchi, on reconnaît le dernier compte connu de
 * l'appareil : les données locales restent consultables, la synchro attend le réseau.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    const supabase = getBrowserSupabase();
    const db = getLocalDb();
    let cancelled = false;

    async function apply(userId: string | null, email: string | null) {
      const known = await db.getMeta<{ userId: string; email: string }>("account");
      if (userId) {
        if (known && known.userId !== userId) await wipeLocalDb(db);
        await db.setMeta("account", { userId, email });
        getEngine().resume();
        if (!cancelled) setState({ status: "signed_in", userId, email: email ?? "", username: emailToUsername(email), offline: false });
      } else if (known && !navigator.onLine) {
        if (!cancelled) setState({ status: "signed_in", userId: known.userId, email: known.email, username: emailToUsername(known.email), offline: true });
      } else if (!cancelled) {
        setState({ status: "signed_out" });
      }
    }

    supabase.auth.getSession().then(({ data }) => apply(data.session?.user.id ?? null, data.session?.user.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      void apply(session?.user.id ?? null, session?.user.email ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
