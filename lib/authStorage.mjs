// Stockage de la session Supabase qui relit toujours ce que la page vient
// d'écrire.
//
// Le 2026-09-29, pendant ~4 min 30, la PWA d'un iPhone (iOS 26) a cessé
// d'enregistrer la session : localStorage acceptait les écritures sans erreur
// mais relisait toujours l'ancienne valeur. supabase-js retrouvait donc avant
// chaque requête un jeton expiré et le renouvelait avec l'ancien refresh token
// (1 vraie rotation, puis 86 réemplois côté Supabase) : 143 appels /token,
// 60 refusés (429) sur l'IP, déconnexion impossible à enregistrer, et chaque
// nouvelle connexion aussitôt remplacée par l'ancienne session.
//
// La page garde donc en mémoire la dernière valeur qu'elle a écrite pour chaque
// clé. Si localStorage relit une valeur que cette page a déjà remplacée,
// l'écriture s'est perdue : on garde la nôtre et on retente l'écriture. Toute
// autre valeur vient d'un autre onglet et fait foi. Quand localStorage marche,
// il relit exactement ce qui a été écrit : le comportement ne change pas.
const MAX_REPLACED_VALUES = 32;
export const WRITE_RETRY_MS = 5000;

export function createAuthStorage({ getBackingStore, now = () => Date.now() } = {}) {
  const written = new Map(); // clé -> { value, replaced: Set, retriedAt }

  function backingStore() {
    try { return getBackingStore?.() || null; } catch { return null; }
  }

  function read(key) {
    const store = backingStore();
    if (!store) return { ok: false, value: null };
    try { return { ok: true, value: store.getItem(key) }; } catch { return { ok: false, value: null }; }
  }

  function write(key, value) {
    const store = backingStore();
    if (!store) return;
    // Stockage plein ou bloqué : la session reste utilisable pour cette page.
    try {
      if (value === null) store.removeItem(key);
      else store.setItem(key, value);
    } catch {}
  }

  function remember(key, value) {
    const previous = written.get(key);
    const replaced = previous?.replaced || new Set();
    const current = read(key);
    if (current.ok) replaced.add(current.value);
    if (previous) replaced.add(previous.value);
    replaced.delete(value);
    while (replaced.size > MAX_REPLACED_VALUES) replaced.delete(replaced.values().next().value);
    written.set(key, { value, replaced, retriedAt: now() });
  }

  return {
    getItem(key) {
      const current = read(key);
      const own = written.get(key);
      if (!own) return current.value;
      if (!current.ok || current.value === own.value) return own.value;
      if (own.replaced.has(current.value)) {
        if (now() - own.retriedAt >= WRITE_RETRY_MS) {
          own.retriedAt = now();
          write(key, own.value);
        }
        return own.value;
      }
      written.delete(key);
      return current.value;
    },
    setItem(key, value) {
      remember(key, value);
      write(key, value);
    },
    removeItem(key) {
      remember(key, null);
      write(key, null);
    },
    // Un autre onglet a modifié localStorage (événement « storage ») : sa
    // valeur fait foi, même si elle ressemble à une ancienne valeur d'ici.
    forget(key) {
      if (key == null) written.clear();
      else written.delete(key);
    },
  };
}
