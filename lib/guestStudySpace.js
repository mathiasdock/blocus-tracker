import { COURSE_COLORS } from "./courseColors";

// Espace d'étude LOCAL d'un visiteur sans compte (mode Découverte) : deux cours
// d'exemple et les sessions qu'il a terminées avec le vrai Chrono. Il ne quitte
// jamais l'appareil : aucune lecture ni écriture Supabase, jamais la file hors
// ligne des comptes (lib/timerDraft.js), jamais importé dans un compte à la
// connexion. Sorti de pages/dashboard.js pour pouvoir servir à une autre page
// du Chrono ; le contenu et la clé de stockage sont inchangés.

export const GUEST_USER_ID = "guest-local";
export const GUEST_DASHBOARD_KEY = "bt_guest_dashboard_v2";

function guestCourseName(id, lang) {
  if (id === "guest-course-physics") return lang === "en" ? "Physics" : "Physique";
  if (id === "guest-course-economics") return lang === "en" ? "Economics" : "Économie";
  return null;
}

function localizeGuestCourses(courses, lang) {
  return (courses || []).map((course) => ({ ...course, name: guestCourseName(course.id, lang) || course.name }));
}

export function defaultGuestDashboardData(lang = "fr") {
  return {
    courses: [
      {
        id: "guest-course-physics",
        user_id: GUEST_USER_ID,
        name: guestCourseName("guest-course-physics", lang),
        color: COURSE_COLORS[11],
        exam_date: null,
        created_at: new Date().toISOString(),
      },
      {
        id: "guest-course-economics",
        user_id: GUEST_USER_ID,
        name: guestCourseName("guest-course-economics", lang),
        color: COURSE_COLORS[1],
        exam_date: null,
        created_at: new Date().toISOString(),
      },
    ],
    sessions: [],
    recentSessions: [],
    objectives: [],
  };
}

export function readGuestDashboardData(lang) {
  if (typeof window === "undefined") return defaultGuestDashboardData(lang);
  try {
    const raw = localStorage.getItem(GUEST_DASHBOARD_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...defaultGuestDashboardData(lang),
        ...parsed,
        courses: localizeGuestCourses(parsed.courses, lang),
        recentSessions: parsed.recentSessions || parsed.sessions || [],
      };
    }
  } catch {}
  const seed = defaultGuestDashboardData(lang);
  try { localStorage.setItem(GUEST_DASHBOARD_KEY, JSON.stringify(seed)); } catch {}
  return seed;
}

export function writeGuestDashboardData(data) {
  if (typeof window === "undefined") return;
  const snapshot = {
    courses: data.courses || [],
    sessions: data.sessions || [],
    recentSessions: data.recentSessions || data.sessions || [],
    objectives: data.objectives || [],
  };
  try { localStorage.setItem(GUEST_DASHBOARD_KEY, JSON.stringify(snapshot)); } catch {}
}

/**
 * Ajoute une session terminée à l'espace invité en relisant le stockage au
 * moment d'écrire. Une session du chrono porte l'id de sa session
 * (contexts/TimerContext.js) : la même session terminée dans deux onglets
 * n'est comptée qu'une fois — la première écrite reste, comme en base pour un
 * compte — et un onglet n'efface pas la session écrite par l'autre.
 * Renvoie la liste des sessions de l'espace.
 */
export function appendGuestSession(payload, lang) {
  const stored = readGuestDashboardData(lang);
  const existing = stored.sessions || [];
  if (existing.some((session) => session?.id === payload.id)) return existing;
  const sessions = [payload, ...existing];
  writeGuestDashboardData({ ...stored, sessions, recentSessions: sessions });
  return sessions;
}
