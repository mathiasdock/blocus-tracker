export const ONBOARDING_VERSION = 1;

export const ONBOARDING_STEPS = Object.freeze({
  ACCOUNT: 0,
  YOU: 1,
  UNIVERSITY: 2,
  STUDIES: 3,
  COURSES: 4,
});

const ONBOARDING_BYPASS_PATHS = new Set([
  "/",
  "/application-etudiant",
  "/blocus-belgique",
  "/forgot-password",
  "/legal",
  "/login",
  "/objectifs-etude",
  "/onboarding",
  "/planning-revision",
  "/pomodoro",
  "/reset-password",
  "/signup",
  "/stats-etude",
]);

// What the student sees: three steps. The server keeps its five precise
// states (a repaired identity, a university saved without its field…); each
// one resumes on the visible step that asks for its missing answer.
export const SETUP_STAGES = Object.freeze(["account", "studies", "courses"]);

export function setupStageFor(step) {
  if (step === ONBOARDING_STEPS.UNIVERSITY || step === ONBOARDING_STEPS.STUDIES) return 1;
  if (step === ONBOARDING_STEPS.COURSES) return 2;
  return 0;
}

export function isManagedOnboardingUser(user) {
  return Number(user?.user_metadata?.onboarding_version || 0) >= ONBOARDING_VERSION;
}

export function shouldCheckOnboarding({ authLoading, user, profileStatus, pathname }) {
  return (
    !authLoading
    && isManagedOnboardingUser(user)
    && profileStatus === "ready"
    && !ONBOARDING_BYPASS_PATHS.has(pathname)
  );
}

export function normalizeCourseName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en");
}

export const COURSE_NAME_MAX = 80;

// The name as it will be stored: spaces collapsed, never longer than the column.
export function cleanCourseName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, COURSE_NAME_MAX).trim();
}

// A pasted list — lines copied from a programme page, a note, a spreadsheet
// column — becomes one course per line. Commas are left alone: "Droit civil,
// obligations" is one course. List markers ("- ", "• ", "3. ") are not part of
// the name.
export function splitCourseNames(text) {
  return String(text || "")
    .split(/[\n\r\t;]+/)
    .map(line => cleanCourseName(line.replace(/^\s*(?:[-–—•*·]+|\d{1,2}[.)])\s+/, "")))
    .filter(Boolean);
}

// Which of the typed or pasted names become new courses. A name already in
// the list, or twice in the same paste, is skipped; the first existing twin is
// returned so the screen can point at it.
export function planCourseAdds(courses, names) {
  const accepted = [];
  let duplicate = null;
  for (const raw of names || []) {
    const name = cleanCourseName(raw);
    if (!name) continue;
    const twin = (courses || []).find(course => (
      !course?.archived_at && normalizeCourseName(course?.name) === normalizeCourseName(name)
    ));
    if (twin) {
      duplicate ||= twin;
      continue;
    }
    if (accepted.some(item => normalizeCourseName(item) === normalizeCourseName(name))) continue;
    accepted.push(name);
  }
  return { accepted, duplicate };
}

export function hasDuplicateCourse(courses, name, exceptId = null) {
  const key = normalizeCourseName(name);
  return Boolean(key) && (courses || []).some((course) => (
    course?.id !== exceptId
    && !course?.archived_at
    && normalizeCourseName(course?.name) === key
  ));
}

export function nextCourseColor(courses, palette) {
  if (!Array.isArray(palette) || palette.length === 0) return null;
  const used = new Set((courses || []).filter(course => !course?.archived_at).map(course => course?.color));
  return palette.find(color => !used.has(color)) || palette[(courses || []).length % palette.length];
}

export function mergeCourseById(courses, course) {
  if (!course?.id) return courses || [];
  const existing = courses || [];
  return existing.some(item => item?.id === course.id)
    ? existing.map(item => item?.id === course.id ? course : item)
    : [...existing, course];
}

export function buildSignupMetadata({
  pseudo,
  firstName,
  lastName,
  timezone,
  referralCode,
  termsVersion,
  privacyVersion,
}) {
  return {
    pseudo: String(pseudo || "").trim(),
    first_name: String(firstName || "").trim(),
    last_name: String(lastName || "").trim() || null,
    timezone: timezone || "Europe/Paris",
    onboarding_version: ONBOARDING_VERSION,
    pending_referral_code: String(referralCode || "").trim().toUpperCase() || null,
    pending_terms_version: termsVersion || null,
    pending_privacy_version: privacyVersion || null,
  };
}

export function signupNeedsEmailConfirmation(signupData) {
  return Boolean(signupData?.user) && !signupData?.session;
}

export function deriveOnboardingState({ user, profile, courses = [], repair = false }) {
  if (!user) {
    return { complete: false, step: ONBOARDING_STEPS.ACCOUNT, legacy: false, repair: false };
  }

  const managed = isManagedOnboardingUser(user) || repair;
  if (!profile) {
    return { complete: false, step: ONBOARDING_STEPS.YOU, legacy: !managed, repair: true };
  }

  // Historical accounts predate the canonical journey. They remain valid and
  // can enrich their academic data from Profile without being locked out.
  if (!managed) {
    return { complete: true, step: null, legacy: true, repair: false };
  }

  if (!String(profile.first_name || "").trim() || !String(profile.pseudo || "").trim()) {
    return { complete: false, step: ONBOARDING_STEPS.YOU, legacy: false, repair };
  }
  if (!String(profile.university || "").trim()) {
    return { complete: false, step: ONBOARDING_STEPS.UNIVERSITY, legacy: false, repair };
  }
  if (!String(profile.broad_field || "").trim() || !String(profile.study_year || "").trim()) {
    return { complete: false, step: ONBOARDING_STEPS.STUDIES, legacy: false, repair };
  }
  if (!(courses || []).some(course => !course?.archived_at)) {
    return { complete: false, step: ONBOARDING_STEPS.COURSES, legacy: false, repair };
  }

  return { complete: true, step: null, legacy: false, repair: false };
}

export function onboardingPathFor({ user, profile, courses = [], repair = false }) {
  const state = deriveOnboardingState({ user, profile, courses, repair });
  return state.complete ? "/dashboard" : "/onboarding";
}
