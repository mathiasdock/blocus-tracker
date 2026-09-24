// Catalogue des notifications AUTOMATIQUES — celles que l'app envoie seule.
//
// Le catalogue reste ici (c'est le code qui sait QUAND chaque notification
// part : lib/eveningPlan.mjs pour le soir, lib/server/socialPush.mjs pour le
// social),
// mais le TEXTE et l'ACTIVATION passent par la table push_automations,
// éditable depuis Admin > Communications > Automatiques.
//
// Les valeurs ci-dessous font foi tant qu'aucune ligne ne les surcharge.
// Module .mjs : lu par les routes serveur, l'admin et les tests Node.

// Deux familles, jamais mélangées :
//   • schedule « evening » : le rappel du soir (cron quotidien), UNE
//     notification au plus par membre et par soir, dans l'ordre de `priority`.
//     `nature` : « fact » (un examen existe) ou « nudge » (une relance,
//     plafonnée à 2 par 7 jours) ;
//   • schedule « event » : le social, envoyé au moment de l'événement par la
//     base (déclencheurs v62_1 / v63), jamais retardé jusqu'au soir.
// `linkParam` : le lien s'ouvre sur la personne concernée (?dm= / ?profile=),
// il n'est donc pas modifiable depuis l'admin.
export const AUTOMATIONS = [
  {
    key: "exam_tomorrow",
    category: "reminder",
    schedule: "evening",
    nature: "fact",
    priority: 1,
    label: { fr: "Examen demain", en: "Exam tomorrow" },
    trigger: { fr: "La veille d'un examen, dans le fuseau du membre (plusieurs examens : une seule notification)", en: "The evening before an exam, in the member's time zone (several exams: one notification)" },
    vars: ["{exams}", "{at}"],
    title: { fr: "{exams} demain{at} 📚", en: "{exams} tomorrow{at} 📚" },
    body: { fr: "Une dernière révision aujourd'hui et tu seras prêt.", en: "One last review today and you'll be ready." },
    url: "/planning",
  },
  {
    key: "exam_in_7_days",
    category: "reminder",
    schedule: "evening",
    nature: "fact",
    priority: 2,
    label: { fr: "Examen dans 7 jours", en: "Exam in 7 days" },
    trigger: { fr: "Une semaine exactement avant un examen, dans le fuseau du membre", en: "Exactly one week before an exam, in the member's time zone" },
    vars: ["{exams}"],
    title: { fr: "{exams} dans 7 jours 📅", en: "{exams} in 7 days 📅" },
    body: { fr: "C'est le bon moment pour planifier tes révisions.", en: "It's the right time to plan your revision." },
    url: "/planning",
  },
  {
    key: "streak_at_risk",
    category: "reminder",
    schedule: "evening",
    nature: "nudge",
    priority: 3,
    label: { fr: "Série en danger", en: "Streak at risk" },
    trigger: { fr: "Série d'au moins 3 jours (comme dans Stats) et aucune session aujourd'hui", en: "Streak of 3 days or more (as in Stats) and no session today" },
    vars: ["{days}"],
    title: { fr: "Ta série de {days} jours est en danger 🔥", en: "Your {days}-day streak is at risk 🔥" },
    body: { fr: "Même une petite session peut suffire pour la continuer.", en: "Even a short session can keep it going." },
    url: "/dashboard",
  },
  {
    key: "first_activation_plan",
    category: "reminder",
    schedule: "evening",
    nature: "nudge",
    priority: 4,
    label: { fr: "Premier démarrage — planning vide", en: "First start — empty planning" },
    trigger: { fr: "48 à 72 h après l'inscription, jamais étudié, ni examen ni objectif : une seule fois", en: "48 to 72 h after signing up, never studied, no exam or objective: once only" },
    vars: [],
    title: { fr: "Prépare ta première semaine 📅", en: "Plan your first week 📅" },
    body: { fr: "Ajoute ton prochain examen ou lance une première session.", en: "Add your next exam or start a first session." },
    url: "/planning",
  },
  {
    key: "first_activation_start",
    category: "reminder",
    schedule: "evening",
    nature: "nudge",
    priority: 4,
    label: { fr: "Premier démarrage — déjà configuré", en: "First start — already set up" },
    trigger: { fr: "48 à 72 h après l'inscription, jamais étudié, mais un examen ou un objectif ajouté : une seule fois", en: "48 to 72 h after signing up, never studied, but an exam or objective added: once only" },
    vars: [],
    title: { fr: "Ton premier bloc t'attend 👋", en: "Your first study block is waiting 👋" },
    body: { fr: "Commence simplement par 25 minutes.", en: "Just start with 25 minutes." },
    url: "/dashboard",
  },
  {
    key: "second_activation",
    category: "reminder",
    schedule: "evening",
    nature: "nudge",
    priority: 5,
    label: { fr: "Second démarrage", en: "Second start" },
    trigger: { fr: "7 jours après l'inscription, toujours jamais étudié, après le premier : une seule fois", en: "7 days after signing up, still never studied, after the first one: once only" },
    vars: [],
    title: { fr: "Une nouvelle semaine, un nouveau départ 🌱", en: "A new week, a fresh start 🌱" },
    body: { fr: "Planifie une session ou commence simplement par 25 minutes aujourd'hui.", en: "Plan a session, or just start with 25 minutes today." },
    url: "/dashboard",
  },
  {
    key: "reactivation_7d",
    category: "reminder",
    schedule: "evening",
    nature: "nudge",
    priority: 6,
    label: { fr: "Reprise après 7 jours", en: "Comeback after 7 days" },
    trigger: { fr: "A déjà vraiment étudié, plus rien depuis 7 jours : une fois par absence, au plus une tous les 30 jours", en: "Has really studied before, nothing for 7 days: once per absence, at most once every 30 days" },
    vars: [],
    title: { fr: "On reprend le rythme ? 👋", en: "Ready to get back into it? 👋" },
    body: { fr: "Une petite session suffit pour repartir.", en: "A short session is all it takes to restart." },
    url: "/dashboard",
  },
  {
    key: "reactivation_21d",
    category: "reminder",
    schedule: "evening",
    nature: "nudge",
    priority: 7,
    label: { fr: "Reprise après 21 jours", en: "Comeback after 21 days" },
    trigger: { fr: "Toujours rien 21 jours après, et la reprise à 7 jours déjà envoyée — ensuite plus rien jusqu'à son retour", en: "Still nothing after 21 days, the 7-day one already sent — then nothing until they come back" },
    vars: [],
    title: { fr: "BLOCUS TRACKER est toujours là 📚", en: "BLOCUS TRACKER is still here 📚" },
    body: { fr: "Quand tu veux reprendre, commence simplement par une première session.", en: "Whenever you're ready, just start with one session." },
    url: "/dashboard",
  },
  {
    key: "friend_request",
    category: "social",
    schedule: "event",
    nature: "fact",
    label: { fr: "Demande d'ami reçue", en: "Friend request received" },
    trigger: { fr: "Dès que quelqu'un envoie une demande d'ami", en: "As soon as someone sends a friend request" },
    // Jetons remplacés à l'envoi. Affichés à l'admin pour qu'il les conserve.
    vars: ["{name}"],
    title: { fr: "{name} veut t'ajouter 👋", en: "{name} wants to add you 👋" },
    body: { fr: "Tu as reçu une nouvelle demande d'ami.", en: "You have a new friend request." },
    url: "/messages?tab=relations",
  },
  {
    key: "friend_accepted",
    category: "social",
    schedule: "event",
    nature: "fact",
    label: { fr: "Demande acceptée", en: "Request accepted" },
    trigger: { fr: "Dès qu'une demande envoyée passe d'en attente à acceptée (une fois par amitié)", en: "As soon as a sent request goes from pending to accepted (once per friendship)" },
    vars: ["{name}"],
    title: { fr: "{name} a accepté ta demande 🤝", en: "{name} accepted your request 🤝" },
    body: { fr: "Vous êtes maintenant amis sur BLOCUS TRACKER.", en: "You're now friends on BLOCUS TRACKER." },
    url: "/messages",
    linkParam: "profile",
  },
  {
    key: "private_message",
    category: "social",
    schedule: "event",
    nature: "fact",
    label: { fr: "Message privé", en: "Private message" },
    trigger: { fr: "Nouveau message privé, sans son contenu ; au plus une notification par conversation toutes les 10 minutes", en: "New private message, without its content; at most one notification per conversation every 10 minutes" },
    vars: ["{name}"],
    title: { fr: "{name} t'a envoyé un message 💬", en: "{name} sent you a message 💬" },
    body: { fr: "Ouvre BLOCUS TRACKER pour répondre.", en: "Open BLOCUS TRACKER to reply." },
    url: "/messages",
    linkParam: "dm",
  },
];

// Ordre du rappel du soir (les deux variantes du premier démarrage partagent
// la même place : l'une ou l'autre selon ce que le membre a déjà configuré).
export const EVENING_KINDS = AUTOMATIONS.filter((a) => a.schedule === "evening").map((a) => a.key);

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
        // Lien fixé par le code quand il vise une personne (?dm=, ?profile=).
        url: AUTOMATION_BY_KEY[row.key]?.linkParam ? base.url : row.url || base.url,
      };
    }
  } catch (_) {}
  return out;
}
