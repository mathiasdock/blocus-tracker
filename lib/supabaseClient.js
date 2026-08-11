import { createClient } from "@supabase/supabase-js";
import { offlineSupabase } from "./offlineSupabaseClient";
import {
  parseInitialAuthCallback,
  shouldCaptureAuthCallback,
} from "./authRecovery.mjs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const isOfflineDev = process.env.NEXT_PUBLIC_OFFLINE_DEV === "true";

// supabase-js starts consuming an auth callback as soon as this module is
// evaluated. Capture only its non-secret metadata first so the reset page can
// still prove that a later INITIAL_SESSION came from a recovery link.
let initialAuthCallback = parseInitialAuthCallback(
  typeof window !== "undefined" && shouldCaptureAuthCallback(window.location.pathname)
    ? window.location.href
    : null
);

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
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // Password recovery stays on the browser-friendly implicit flow. A
      // recovery link may therefore be opened on a different device.
      flowType: "implicit",
    },
  }
);

export const supabase = isOfflineDev ? offlineSupabase : realSupabase;

export function createIsolatedAuthClient() {
  return createClient(
    supabaseUrl || "http://localhost",
    supabaseAnonKey || "public-anon-key",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}

export function getInitialAuthCallback() {
  return initialAuthCallback;
}

export function clearInitialAuthCallback() {
  initialAuthCallback = parseInitialAuthCallback(null);

  // Failed callbacks are not cleared by supabase-js because it preserves the
  // previous session. Remove stale tokens/codes from the address bar and
  // browser history once this page has finished validating them.
  if (typeof window !== "undefined") {
    try {
      const url = new URL(window.location.href);
      url.hash = "";
      ["code", "error", "error_code", "error_description"].forEach((key) => {
        url.searchParams.delete(key);
      });
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {}
  }
}

// We authenticate with pseudo + password. Supabase Auth needs an email,
// so we map a pseudo to a deterministic internal e-mail address.
export function pseudoToEmail(pseudo) {
  return `${pseudo.trim().toLowerCase()}@blocus.local`;
}
