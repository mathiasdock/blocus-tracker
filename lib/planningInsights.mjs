import { nextExamForCourse } from "./planningExams.mjs";

// Derived from saved objectives/exams only; no estimated revision/readiness score.
export function coursePlanning(courses, objectives, exams, today) {
  return courses.map(course => {
    const pending = objectives.filter(o => o.course_id === course.id && !o.done);
    return { course, exam: nextExamForCourse(exams, course.id, today),
      remaining: pending.length,
      overdue: pending.filter(o => o.scheduled_date && o.scheduled_date < today).length };
  }).sort((a, b) => (a.exam?.exam_date || '9999').localeCompare(b.exam?.exam_date || '9999')
    || b.overdue - a.overdue || b.remaining - a.remaining);
}

export function dayWorkload(objectives) {
  const pending = objectives.filter(o => !o.done);
  return { remaining: pending.length, done: objectives.length - pending.length,
    minutes: pending.reduce((sum, o) => sum + Math.max(0, Number(o.target_minutes) || 0), 0) };
}

// ── Charge planifiée ──────────────────────────────────────────
// La charge d'une journée se mesure en MINUTES PLANIFIÉES, pas en nombre de
// tâches. Le classement par compte faisait perdre un objectif de Finance de
// 4 h face à deux QCM de Marketing de 20 min : la case du mois annonçait alors
// le mauvais cours dominant, et la semaine la mauvaise journée chargée.
// `target_minutes` porte cette donnée et elle est fiable (seuls 4 % des
// objectifs en production sont restés à la valeur par défaut).

// Repli documenté : une ligne sans durée exploitable COMPTE quand même, pour
// une demi-heure. Elle ne doit pas disparaître silencieusement de la charge —
// c'est du travail prévu. `estimated` permet de ne pas prétendre à la précision.
export const FALLBACK_OBJECTIVE_MINUTES = 30;
// Longueur pleine de la bande de charge. HUIT heures : le haut de la journée de
// blocus réelle. À six heures, une journée de 5 h 30 et une de 8 h 50 tombaient
// toutes deux sur une bande pleine — or c'est justement en période d'examens
// qu'il faut les distinguer. Au-delà, la bande reste pleine et le total exact
// est écrit à côté (semaine) ou dans le libellé accessible (mois).
export const LOAD_FULL_MINUTES = 480;
// Plancher de RENDU : toute journée qui porte du travail garde une bande
// visible. Sans lui, trente minutes valaient trois pixels dans une case de
// mois — indistinguable d'une journée vide, qui est pourtant la distinction la
// plus importante de la carte.
export const LOAD_MIN_RATIO = 0.12;

export function objectiveMinutes(objective) {
  const raw = Number(objective?.target_minutes);
  return Number.isFinite(raw) && raw > 0 ? raw : FALLBACK_OBJECTIVE_MINUTES;
}

/**
 * Décrit la charge d'une journée et la part de chaque cours.
 *
 * Les objectifs TERMINÉS restent dans la charge : une journée ne se vide pas
 * en cochant des cases, sinon la carte du mois raconterait l'avancement au
 * lieu du plan. `doneMinutes` garde la distinction disponible.
 * Le travail sans cours est un contributeur à part entière, d'identité `null` :
 * il pèse, il n'emprunte l'identité d'aucun cours.
 */
export function dayLoad(objectives = []) {
  const byCourse = new Map();
  let minutes = 0;
  let doneMinutes = 0;
  let doneCount = 0;
  let estimated = 0;
  for (const objective of objectives) {
    const value = objectiveMinutes(objective);
    const key = objective.course_id || "";
    minutes += value;
    if (objective.done) { doneMinutes += value; doneCount += 1; }
    if (!(Number(objective?.target_minutes) > 0)) estimated += 1;
    const entry = byCourse.get(key) || { id: objective.course_id || null, minutes: 0, count: 0 };
    entry.minutes += value;
    entry.count += 1;
    byCourse.set(key, entry);
  }
  // Tri par minutes, égalité tranchée par identifiant : la même journée se
  // dessine pareil d'un chargement à l'autre. Le travail sans cours passe en
  // dernier à égalité — un cours nommé prime sur l'absence de cours.
  const courses = [...byCourse.values()]
    .sort((a, b) => b.minutes - a.minutes
      || String(a.id ?? "\uffff").localeCompare(String(b.id ?? "\uffff")))
    .map(entry => ({ ...entry, share: minutes ? entry.minutes / minutes : 0 }));
  return {
    minutes, doneMinutes, pendingMinutes: minutes - doneMinutes,
    count: objectives.length, doneCount, estimated, courses,
    // Teinte de la case : seul un vrai cours peut en porter une. Si la plus
    // grosse part de la journée est sans cours, aucun cours ne « possède » ce
    // jour et la case reste neutre.
    dominantCourseId: courses[0]?.id ?? null,
    hasUnassigned: byCourse.has(""),
  };
}

/** Longueur de la bande, échelle absolue partagée par le mois et la semaine. */
export function loadRatio(minutes, full = LOAD_FULL_MINUTES) {
  if (!(minutes > 0)) return 0;
  return Math.max(LOAD_MIN_RATIO, Math.min(1, minutes / full));
}

/**
 * Segments de la bande, du plus lourd au plus léger. Au-delà de `max`, le
 * reste est REGROUPÉ dans un segment neutre qui porte son propre nombre de
 * cours : on ne prétend pas que seuls deux cours existent, et on ne peint pas
 * un arc-en-ciel de tranches minuscules.
 */
export function loadSegments(load, max = 3) {
  const courses = load?.courses || [];
  if (!courses.length || !load.minutes) return [];
  const head = courses.slice(0, max).map(entry => ({ id: entry.id, share: entry.share, rest: 0 }));
  const tail = courses.slice(max);
  if (!tail.length) return head;
  const restMinutes = tail.reduce((sum, entry) => sum + entry.minutes, 0);
  return [...head, { id: null, share: restMinutes / load.minutes, rest: tail.length }];
}
