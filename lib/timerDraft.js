// Sauvegarde locale ROBUSTE des sessions de chrono terminées mais pas encore
// confirmées par Supabase. Objectif : ne JAMAIS perdre une session, même si
// l'utilisateur est offline / ferme l'app / Supabase échoue temporairement.
//
// Stratégie :
//   - Chaque session terminée est immédiatement poussée dans une file locale
//     (localStorage) AVANT d'essayer de l'envoyer à Supabase.
//   - Chaque entrée embarque un UUID client utilisé comme `sessions.id`
//     côté serveur → idempotence parfaite : une retry sur une session déjà
//     persistée renvoie un 23505 (unique violation), qu'on traite comme
//     succès et qui retire l'item de la queue.
//   - flushPending() est rappelable sur online / focus / mount / intervalle.
//
// Aucune migration : `sessions.id uuid PK default gen_random_uuid()` accepte
// déjà un id fourni par le client.

const QUEUE_KEY = "bt_pending_sessions_v1";

function readQueue() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeQueue(arr) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(arr || []));
  } catch {}
}

// UUID v4 — utilise crypto.randomUUID (dispo partout en HTTPS moderne) avec
// fallback Math.random pour les contextes anciens.
export function newClientId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Pousse une session terminée dans la file locale. À appeler AVANT toute
// tentative d'envoi à Supabase. Idempotent : pas de doublon par id.
export function enqueueSession(payload) {
  if (!payload || !payload.id || !payload.user_id) return null;
  const q = readQueue();
  if (!q.some((x) => x.id === payload.id)) {
    q.push({ ...payload, queuedAt: Date.now() });
    writeQueue(q);
  }
  return payload;
}

export function removeFromQueue(id) {
  if (!id) return;
  writeQueue(readQueue().filter((x) => x.id !== id));
}

export function listPending(userId) {
  if (!userId) return [];
  return readQueue().filter((x) => x.user_id === userId);
}

export function countPending(userId) {
  return listPending(userId).length;
}

// Tente d'envoyer toutes les sessions en attente pour cet utilisateur.
//   - 0 erreur → retirée
//   - 23505 (duplicate PK) = déjà persistée par une précédente tentative → retirée
//   - autre erreur → conservée, banner reste visible
// Renvoie { synced, alreadyExists, failed, results }.
export async function flushPending(supabase, userId, opts = {}) {
  const onItem = opts.onItem;
  const out = { synced: 0, alreadyExists: 0, failed: 0, results: [] };
  if (!userId) return out;

  const items = listPending(userId);
  for (const item of items) {
    const payload = {
      id: item.id,
      user_id: item.user_id,
      course_id: item.course_id || null,
      duration_seconds: item.duration_seconds,
      note: item.note || null,
      started_at: item.started_at,
      ended_at: item.ended_at,
    };
    const { data, error } = await supabase
      .from("sessions")
      .insert(payload)
      .select()
      .maybeSingle();

    if (!error) {
      removeFromQueue(item.id);
      out.synced++;
      out.results.push({ status: "synced", item, data });
      onItem?.({ status: "synced", item, data });
    } else if (error.code === "23505") {
      // PK déjà présente côté serveur → idempotence : c'est un succès.
      removeFromQueue(item.id);
      out.alreadyExists++;
      out.results.push({ status: "duplicate", item });
      onItem?.({ status: "duplicate", item });
    } else {
      out.failed++;
      out.results.push({ status: "failed", item, error });
      onItem?.({ status: "failed", item, error });
    }
  }
  return out;
}
