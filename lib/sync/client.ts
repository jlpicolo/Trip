"use client";

import { getLocalDb } from "@/lib/db/schema";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { SyncEngine } from "./engine";
import { FileSync, supabaseFiles } from "./files";
import { supabaseRemote } from "./remote";

let engine: SyncEngine | null = null;
let files: FileSync | null = null;

export function getFileSync(): FileSync {
  files ??= new FileSync(getLocalDb(), supabaseFiles(getBrowserSupabase()));
  return files;
}

export function getEngine(): SyncEngine {
  engine ??= new SyncEngine(getLocalDb(), supabaseRemote(getBrowserSupabase()), undefined, () => getFileSync().uploadPending());
  return engine;
}
