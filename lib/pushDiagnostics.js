// Transport du diagnostic d'échec d'activation des notifications.
//
// Écrit une ligne dans public.push_diagnostics (migration v52) : la personne
// l'écrit pour elle-même (RLS), seul un admin la lit, elle disparaît au bout de
// 30 jours. Première partie uniquement — notre base, aucun service tiers — et
// déclenché seulement par un échec d'une activation demandée par la personne.
//
// Ne lève jamais : un diagnostic qui plante ne doit pas masquer l'échec qu'il
// décrit, ni ajouter une erreur à l'écran.
import { supabase } from "./supabaseClient";

const SEND_TIMEOUT_MS = 8000;

export async function sendPushDiagnostic(userId, reason, detail) {
  if (!userId || !reason) return false;
  try {
    const insert = supabase
      .from("push_diagnostics")
      .insert({ user_id: userId, reason: String(reason).slice(0, 40), detail });
    const res = await Promise.race([
      insert.then((r) => r),
      new Promise((resolve) => setTimeout(() => resolve({ error: "timeout" }), SEND_TIMEOUT_MS)),
    ]);
    return !res?.error;
  } catch (_) {
    return false;
  }
}
