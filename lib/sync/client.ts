"use client";

import { getLocalDb } from "@/lib/db/schema";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { SyncEngine } from "./engine";
import { supabaseRemote } from "./remote";

let engine: SyncEngine | null = null;

export function getEngine(): SyncEngine {
  engine ??= new SyncEngine(getLocalDb(), supabaseRemote(getBrowserSupabase()));
  return engine;
}
