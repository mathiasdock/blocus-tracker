// Partage automatique — publier un post quand quelque chose arrive.
//
// Le panneau de réglages existait depuis un moment dans le fil : cinq
// interrupteurs qui s'enregistraient dans le navigateur et que RIEN ne lisait.
// Aucun post n'a jamais été généré. Ce fichier est la moitié manquante.
//
// ── Ce qui est publiable, et ce qui ne l'est pas ────────────
// Quatre évènements, pas cinq. « Nouveau record » a été retiré : savoir qu'une
// journée bat toutes les précédentes demande de relire tout l'historique de
// sessions de la personne, à chaque session enregistrée. L'app a un garde-fou
// d'egress explicite (pages/api/admin/egress-guard.js) ; payer un balayage
// complet pour une phrase d'ambiance serait le mauvais échange. Un interrupteur
// qui ne fait rien est exactement le problème qu'on vient de corriger : mieux
// vaut quatre promesses tenues que cinq dont une ment.
//
// ── Défauts ─────────────────────────────────────────────────
// Tout est ÉTEINT au départ, et la visibilité par défaut est « amis ».
// Publier automatiquement l'activité de quelqu'un est un geste sortant : il
// se demande, il ne se suppose pas. Les valeurs précédentes étaient toutes à
// « oui » — sans effet, donc sans conséquence, mais les brancher telles quelles
// aurait mis des centaines de comptes à diffuser leurs sessions sans que
// personne ne l'ait choisi.
//
// ── Anti-inondation ─────────────────────────────────────────
// Un post par type d'évènement et par jour. Sans cela, « session terminée »
// publierait cinq fois dans une journée de blocus et le fil deviendrait
// illisible — pour les autres comme pour soi.

export const AUTO_SHARE_KEY = "bt_social_auto_share_v1";
const SENT_KEY = "bt_social_auto_share_sent_v1";

// Sentinelle d'un post sans photo. Partagée avec pages/feed.js : un post
// automatique doit produire exactement la même donnée qu'un post écrit à la
// main, sinon il faudrait deux mises en page pour dire la même chose.
export const TEXT_ONLY_POST_IMAGE =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

export const AUTO_SHARE_EVENTS = ["session_completed", "goal_completed", "level_up", "streak"];

export const DEFAULT_AUTO_SHARE = {
  session_completed: false,
  goal_completed: false,
  level_up: false,
  streak: false,
  visibility: "friends",
};

function safeParse(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/** Préférences de partage automatique (repli sur les défauts). */
export function readAutoShare() {
  if (typeof window === "undefined") return { ...DEFAULT_AUTO_SHARE };
  try {
    const stored = safeParse(window.localStorage.getItem(AUTO_SHARE_KEY), null);
    if (!stored) return { ...DEFAULT_AUTO_SHARE };
    // Fusion avec les défauts plutôt que remplacement : un réglage ajouté plus
    // tard ne doit pas arriver `undefined` chez ceux qui ont déjà enregistré.
    const merged = { ...DEFAULT_AUTO_SHARE };
    AUTO_SHARE_EVENTS.forEach((key) => {
      if (typeof stored[key] === "boolean") merged[key] = stored[key];
    });
    if (stored.visibility === "public" || stored.visibility === "friends") {
      merged.visibility = stored.visibility;
    }
    return merged;
  } catch {
    return { ...DEFAULT_AUTO_SHARE };
  }
}

/** Enregistre un changement et renvoie l'état complet qui en résulte. */
export function writeAutoShare(patch) {
  const next = { ...readAutoShare(), ...patch };
  try {
    window.localStorage.setItem(AUTO_SHARE_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

function todayKey() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function alreadySentToday(kind) {
  if (typeof window === "undefined") return true;
  const sent = safeParse(window.localStorage.getItem(SENT_KEY), {}) || {};
  return sent[kind] === todayKey();
}

function markSentToday(kind) {
  if (typeof window === "undefined") return;
  const sent = safeParse(window.localStorage.getItem(SENT_KEY), {}) || {};
  // On ne garde que les types connus : la table ne doit pas grossir
  // indéfiniment si un identifiant disparaît un jour.
  const next = {};
  AUTO_SHARE_EVENTS.forEach((key) => {
    if (sent[key]) next[key] = sent[key];
  });
  next[kind] = todayKey();
  try {
    window.localStorage.setItem(SENT_KEY, JSON.stringify(next));
  } catch {}
}

/**
 * Publie un post automatique si le type est activé et qu'aucun du même type
 * n'est déjà parti aujourd'hui.
 *
 * Volontairement silencieux : c'est un geste de fond, déclenché par autre
 * chose (une session qu'on vient de finir, un niveau qu'on vient de passer).
 * Une erreur réseau ne doit pas interrompre ce que la personne était en train
 * de faire ni faire surgir une alerte sans rapport avec son geste.
 *
 * @returns {Promise<boolean>} vrai si un post a bien été créé.
 */
export async function autoSharePost(supabase, { userId, kind, caption }) {
  if (!supabase || !userId || !kind || !caption) return false;
  if (!AUTO_SHARE_EVENTS.includes(kind)) return false;

  const prefs = readAutoShare();
  if (!prefs[kind]) return false;
  if (alreadySentToday(kind)) return false;

  // Marqué AVANT l'envoi : deux évènements simultanés (passer un niveau et un
  // palier de série au même recalcul) déclencheraient sinon deux insertions du
  // même type avant que la première n'ait répondu.
  markSentToday(kind);

  try {
    const { error } = await supabase.from("posts").insert({
      user_id: userId,
      image_url: TEXT_ONLY_POST_IMAGE,
      caption,
      visibility: prefs.visibility === "public" ? "public" : "friends",
    });
    if (error) throw error;
    return true;
  } catch (error) {
    console.warn("Auto-share failed:", error);
    return false;
  }
}
