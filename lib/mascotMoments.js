// Quand la mascotte a le droit d'apparaître.
//
// Le problème qu'on corrige : elle était affichée par DÉFAUT, dès qu'une
// section était vide ou qu'un écran voulait dire quelque chose. Sur le
// planning, le fil, les stats, le social, elle répétait la même phrase à
// chaque visite, dans le même rectangle menthe horizontal. Un personnage
// qu'on croise dix fois par jour avec la même réplique cesse d'être un
// personnage : il devient une décoration qu'on ne voit plus.
//
// Ici, une apparition est un ÉVÉNEMENT. Elle porte une clé et une fréquence,
// et le module se souvient de ce qui a déjà été vu. Le reste de l'interface
// parle tout seul — un état vide n'a pas besoin d'un chien pour dire qu'il
// est vide.
//
// Fréquences :
//   "once"    — une fois pour toujours (accueil, première fois qu'on utilise
//               une fonctionnalité). Mémorisé durablement.
//   "daily"   — une fois par jour (première session du jour, examen proche).
//   "session" — une fois par visite (rappel de contexte léger).
//   "always"  — à chaque fois. Réservé aux réactions à une ACTION qu'on vient
//               de faire : là, la répétition est le sujet, pas le bruit.

const PREFIX = "bt_mascot";

export const MASCOT_FREQUENCIES = ["once", "daily", "session", "always"];

function store(frequency) {
  if (typeof window === "undefined") return null;
  try {
    return frequency === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

function todayKey() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Clé de stockage d'un moment. `daily` change de clé chaque jour. */
export function momentKey(key, frequency) {
  if (!key) return null;
  return frequency === "daily" ? `${PREFIX}:${key}:${todayKey()}` : `${PREFIX}:${key}`;
}

/**
 * Ce moment a-t-il encore le droit de s'afficher ?
 *
 * Rendu côté serveur : on répond NON. Une mascotte qui apparaît puis
 * disparaît à l'hydratation est pire que pas de mascotte du tout — et c'est
 * exactement ce qui arriverait pour un moment déjà vu.
 */
export function canShowMoment(key, frequency = "session") {
  if (frequency === "always") return true;
  if (typeof window === "undefined") return false;
  if (!key) return true;
  const s = store(frequency);
  if (!s) return true;
  try {
    return s.getItem(momentKey(key, frequency)) !== "seen";
  } catch {
    return true;
  }
}

/** Marque le moment comme vu (fermeture, ou simple affichage selon l'appelant). */
export function markMomentSeen(key, frequency = "session") {
  if (frequency === "always" || !key) return;
  const s = store(frequency);
  if (!s) return;
  try {
    s.setItem(momentKey(key, frequency), "seen");
  } catch {}
}

/** Utile en développement, et le jour où l'on voudra un « revoir les
 *  conseils » : efface tout ce que la mascotte a déjà dit. */
export function resetMoments() {
  for (const s of [store("once"), store("session")]) {
    if (!s) continue;
    try {
      const doomed = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k && k.startsWith(`${PREFIX}:`)) doomed.push(k);
      }
      doomed.forEach((k) => s.removeItem(k));
    } catch {}
  }
}
