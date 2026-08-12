// Catalogue des notifications AUTOMATIQUES — celles que l'app envoie seule.
//
// Elles vivaient en dur dans pages/api/push/notify.js et daily.js : impossible
// d'en couper une ou d'en changer le texte sans redéployer. Le catalogue reste
// ici (c'est le code qui sait quand chaque notification part), mais le TEXTE et
// l'ACTIVATION passent par la table push_automations, éditable depuis l'admin.
//
// Les valeurs ci-dessous font foi tant qu'aucune ligne ne les surcharge :
// avant la migration v42, ou pour toute notification jamais modifiée, le
// comportement est strictement celui d'avant.

export const AUTOMATIONS = [
  {
    key: "friend_request",
    label: { fr: "Demande d'ami", en: "Friend request" },
    trigger: { fr: "Dès que quelqu'un envoie une demande d'ami", en: "As soon as someone sends a friend request" },
    // Jetons remplacés à l'envoi. Affichés à l'admin pour qu'il les conserve.
    vars: ["{name}"],
    title: { fr: "Nouvelle demande d'ami", en: "New friend request" },
    body: { fr: "{name} t'a envoyé une demande d'ami", en: "{name} sent you a friend request" },
    url: "/friends",
  },
  {
    key: "exam_tomorrow",
    label: { fr: "Examen demain", en: "Exam tomorrow" },
    trigger: { fr: "Chaque soir, à qui passe un examen le lendemain", en: "Every evening, to anyone with an exam the next day" },
    vars: [],
    title: { fr: "Ton examen est demain 📖", en: "Your exam is tomorrow 📖" },
    body: { fr: "Une dernière révision aujourd'hui, et tu seras prêt·e.", en: "One last review today and you're ready." },
    url: "/planning",
  },
  {
    key: "streak_at_risk",
    label: { fr: "Série en danger", en: "Streak at risk" },
    trigger: { fr: "Chaque soir, à qui a étudié hier mais pas aujourd'hui", en: "Every evening, to anyone who studied yesterday but not today" },
    vars: [],
    title: { fr: "Ta série est en danger 🔥", en: "Your streak is at risk 🔥" },
    body: { fr: "Tu n'as pas encore étudié aujourd'hui. Garde ta série !", en: "You haven't studied today yet. Keep your streak alive!" },
    url: "/dashboard",
  },
  {
    key: "nudge_planning",
    label: { fr: "Relance planning", en: "Planning nudge" },
    trigger: { fr: "Les jours pairs, à qui a étudié il y a 2-3 jours mais pas aujourd'hui", en: "On even days, to anyone who studied 2-3 days ago but not today" },
    vars: [],
    title: { fr: "Prépare ta journée 🗓️", en: "Plan your day 🗓️" },
    body: { fr: "Prends 2 minutes pour organiser ton planning de révision.", en: "Take 2 minutes to set up your study plan." },
    url: "/planning",
  },
  {
    key: "nudge_study",
    label: { fr: "Relance étude", en: "Study nudge" },
    trigger: { fr: "Les jours impairs, à qui a étudié il y a 2-3 jours mais pas aujourd'hui", en: "On odd days, to anyone who studied 2-3 days ago but not today" },
    vars: [],
    title: { fr: "C'est l'heure de réviser 📚", en: "Time to study 📚" },
    body: { fr: "Lance une petite session avant la fin de la journée.", en: "Start a quick session before the day ends." },
    url: "/dashboard",
  },
];

export const AUTOMATION_BY_KEY = Object.fromEntries(AUTOMATIONS.map((a) => [a.key, a]));

/**
 * Fusionne les réglages enregistrés avec le catalogue.
 * Dégrade proprement : table absente ou ligne manquante → valeurs du code.
 * @param {object} admin client Supabase à clé service role
 * @returns {Promise<Record<string, {enabled, title, body, url}>>}
 */
export async function loadAutomations(admin) {
  const out = {};
  for (const a of AUTOMATIONS) {
    out[a.key] = { enabled: true, title: a.title, body: a.body, url: a.url };
  }
  try {
    const { data, error } = await admin
      .from("push_automations")
      .select("key, enabled, title_fr, title_en, body_fr, body_en, url");
    if (error || !data) return out;
    for (const row of data) {
      const base = out[row.key];
      if (!base) continue;
      out[row.key] = {
        enabled: row.enabled !== false,
        title: { fr: row.title_fr || base.title.fr, en: row.title_en || base.title.en },
        body: { fr: row.body_fr || base.body.fr, en: row.body_en || base.body.en },
        url: row.url || base.url,
      };
    }
  } catch (_) {}
  return out;
}

/** Remplace les jetons ({name}…) dans un objet { fr, en }. */
export function fillVars(text, vars = {}) {
  const apply = (s) =>
    Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(v), String(s || ""));
  return { fr: apply(text?.fr), en: apply(text?.en) };
}
