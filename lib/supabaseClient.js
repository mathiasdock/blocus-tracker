import { createClient } from "@supabase/supabase-js";
import { offlineSupabase } from "./offlineSupabaseClient";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const isOfflineDev = process.env.NEXT_PUBLIC_OFFLINE_DEV === "true";

if (!isOfflineDev && (!supabaseUrl || !supabaseAnonKey)) {
  // Helpful message during local dev / first deploy.
  console.warn(
    "[blocus-tracker] Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
      "Copy .env.local.example to .env.local and fill in your Supabase credentials."
  );
}

const realSupabase = createClient(
  supabaseUrl || "http://localhost",
  supabaseAnonKey || "public-anon-key",
  {
    auth: { persistSession: true, autoRefreshToken: true },
  }
);

export const supabase = isOfflineDev ? offlineSupabase : realSupabase;

// We authenticate with pseudo + password. Supabase Auth needs an email,
// so we map a pseudo to a deterministic internal e-mail address.
export function pseudoToEmail(pseudo) {
  return `${pseudo.trim().toLowerCase()}@blocus.local`;
}
