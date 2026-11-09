"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabasePublishableKey, supabaseUrl } from "./env";

let client: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
  client ??= createBrowserClient(supabaseUrl(), supabasePublishableKey());
  return client;
}
