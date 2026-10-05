import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { PageContentSkeleton, useSkeletonHatch } from "../components/PageSkeleton";
import MascotMoment from "../components/MascotMoment";
import SegmentedGlide from "../components/SegmentedGlide";
import AnimatedNumber from "../components/AnimatedNumber";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { useToast } from "../contexts/ToastContext";
import { useTimer } from "../contexts/TimerContext";
import { supabase } from "../lib/supabaseClient";
import { formatMinutesShort } from "../lib/format";
import { runStreakFreezeUpkeep } from "../lib/streakFreezes";
import { buildIcs, downloadIcs, countExportable } from "../lib/ics";
import { parseQuickObjective } from "../lib/planningQuickAdd";
import { writeSessionGoal } from "../lib/sessionGoal";
import { notifyXPChanged } from "../lib/xpEvents";
import { autoSharePost } from "../lib/autoShare";
import Glyph from "../components/Glyph";
import { playSensoryCue } from "../lib/sensoryFeedback";
import { dayWorkload, dayLoad } from "../lib/planningInsights.mjs";
import PlanningLoadBar from "../components/PlanningLoadBar";
import { normalizePlanningExams, relevantUpcomingExams, deletePlanningExam, updateLegacyExamDate } from "../lib/planningExams.mjs";
import PlanningExamMark from "../components/PlanningExamMark";
import UniversityCalendar from "../components/UniversityCalendar";
import AcademicDeadlines from "../components/AcademicDeadlines";
import useAcademicCalendar from "../components/useAcademicCalendar";
import { academicSummary, confirmedImportedExams, splitAcademicEvents } from "../lib/planningAcademicEvents.mjs";
import { externalCourses, calendarReview } from "../lib/calendarReview.mjs";
import usePlanningSwipe from "../components/usePlanningSwipe";
import PlanMenu from "../components/planning/PlanMenu";
import CourseOverview from "../components/planning/CourseOverview";

// ── Constants ─────────────────────────────────────────────────
// Libellés du calendrier (Lun→Dim, Janvier→Décembre) localisés FR/EN. Avant,
// ces tableaux étaient en français en dur → un utilisateur EN voyait un
// calendrier à moitié en français. On sélectionne par langue via les helpers.
const WEEKDAYS_SHORT_FR = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
const WEEKDAYS_SHORT_EN = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const MONTHS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const weekdaysShortFor = (lang) => (lang === "en" ? WEEKDAYS_SHORT_EN : WEEKDAYS_SHORT_FR);
const monthsFor        = (lang) => (lang === "en" ? MONTHS_EN : MONTHS_FR);
const localeFor        = (lang) => (lang === "en" ? "en-GB" : "fr-FR");
const HOURS  = Array.from({ length: 16 }, (_, i) => i + 7);

// Largeur mini d'une colonne de jour dans la grille horaire. En dessous, un
// titre d'objectif n'est plus lisible : sur téléphone la semaine défile
// horizontalement plutôt que d'écraser 7 colonnes dans 390 px.
const TIMEGRID_MIN_COL = 104;
const TIMEGRID_GUTTER  = 52;
// Voile accent sur la colonne du jour — assez léger pour rester lisible en
// clair comme en sombre, d'où une rgba littérale plutôt qu'un token opaque.
const TODAY_TINT = "rgba(var(--bt-brand-rgb), 0.06)";

// ── Context ────────────────────────────────────────────────────
const Ctx = createContext(null);
const usePlan = () => useContext(Ctx);

function CourseMark({ id }) {
  const { courseColor, courseName, t } = usePlan();
  const color = courseColor(id);
  return <span className={`bt-plan-course-mark${color ? "" : " bt-plan-course-mark--unassigned"}`}
    style={color ? { backgroundColor: color } : undefined}
    title={courseName(id) || t("plan.unassigned")} aria-hidden="true" />;
}

function LegacyExamDate({ exam }) {
  const { t, saveLegacyDate } = usePlan();
  const [date, setDate] = useState(exam.exam_date);
  const [busy, setBusy] = useState(false);
  return <form className="mt-2" onSubmit={async event => {
    event.preventDefault();
    setBusy(true);
    try { await saveLegacyDate(exam, date); } finally { setBusy(false); }
  }}>
    <label className="block text-xs">
      {t("plan.legacyExamDate")}
      <input type="date" className="input mt-1 w-full" value={date} required
        onChange={event => setDate(event.target.value)} />
    </label>
    {date !== exam.exam_date && <button type="submit" disabled={busy} className="btn-ghost mt-2 min-h-11 px-3 text-sm">{t(busy ? "common.saving" : "common.save")}</button>}
  </form>;
}

// ── Helpers ───────────────────────────────────────────────────
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function dateFromYmd(s) { return new Date(s + "T12:00:00"); }
function tomorrowISO() {
  const d = new Date(); d.setDate(d.getDate() + 1); return ymd(d);
}
function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00"); d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00"); d.setDate(d.getDate() + n); return ymd(d);
}
// "Aujourd'hui" en date LOCALE (fuseau de l'appareil), cohérent avec ymd(),
// daysUntil(), getWeekDays() et buildMonthGrid() qui sont tous locaux. Le
// localToday() global est en UTC : à la frontière (00h→02h heure belge l'été) il
// surlignait le mauvais jour du calendrier et désaccordait daysUntil(). Tout le
// planning raisonne désormais en jour local — un jour de planning EST un jour
// de calendrier local.
function localToday() { return ymd(new Date()); }
// Compte à rebours d'un examen. « J-15 » est une convention FRANÇAISE : en
// anglais elle ne veut rien dire, et elle était écrite en dur. Le libellé passe
// donc par i18n ("J-{n}" / "{n} days").
function examCountdown(days, t) {
  if (days === 0) return t("exam.today");
  if (days === 1) return t("plan.tomorrow");
  if (days < 0)   return t("exam.passed");
  return t("plan.badgeDays").replace("{n}", String(days));
}
// Label court et humain d'une date pour l'aperçu de l'ajout rapide.
function quickDateLabel(iso, lang, t) {
  const today = localToday();
  if (iso === today) return t("common.today");
  if (iso === addDays(today, 1)) return t("plan.tomorrow");
  return dateFromYmd(iso).toLocaleDateString(localeFor(lang), { weekday: "short", day: "numeric", month: "short" });
}
function buildMonthGrid(year, month) {
  const first  = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start  = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i); return d;
  });
}
function getWeekDays(dateStr) {
  const d   = dateFromYmd(dateStr);
  const day = d.getDay();
  const off = day === 0 ? -6 : 1 - day;
  const mon = new Date(d); mon.setDate(d.getDate() + off);
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(mon); dd.setDate(mon.getDate() + i); return dd;
  });
}
function getHour(time) {
  if (!time) return null;
  return parseInt(time.split(":")[0], 10);
}
// « #14b8a6 » → « 20, 184, 166 ». Le triplet part en variable CSS, et c'est la
// feuille de style qui choisit l'alpha : le même lavis doit rester très pâle
// sur fond crème et rester perceptible sur fond sombre. Renvoie null si la
// couleur n'est pas un hex (couleur nommée, valeur vide) — l'appelant retombe
// alors sur un fond neutre plutôt que d'afficher n'importe quoi.
function rgbTriplet(hex) {
  const m = String(hex || "").trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map(c => c + c).join("") : m[1];
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
// Majuscule à la PREMIÈRE lettre seulement, à l'affichage. `capitalize` en CSS
// capitalise chaque mot : « mardi 8 septembre » devenait « Mardi 8 Septembre »,
// or un mois ne prend pas de majuscule en français. Et sur un nom saisi par
// l'utilisateur, ça abîmerait « examen d'IFRS » en « Examen D'IFRS ». La valeur
// enregistrée n'est jamais modifiée : c'est une transformation de rendu.
function sentenceCase(s) {
  const str = String(s || "");
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

// ── Recurrence helpers ───────────────────────────────────────────
// Weekdays stored as JS getDay() values (0=Dim..6=Sam), same convention
// used everywhere else in this file (cf. TimeGrid weekday labels).
// `recurrence_weekdays` (array) is the source of truth for new/edited
// objectives. Legacy rows only have the old `recurrence` string
// ('daily'|'weekly') — still honoured by nextRecurrenceDate() below so
// existing repeating objectives keep working without a data migration.
function weekdaysFromObjective(o) {
  if (Array.isArray(o.recurrence_weekdays) && o.recurrence_weekdays.length) return o.recurrence_weekdays;
  if (o.recurrence === "daily")  return [0, 1, 2, 3, 4, 5, 6];
  if (o.recurrence === "weekly") return [dateFromYmd(o.scheduled_date).getDay()];
  return [];
}
function recurrenceFields(weekdays, until) {
  const days = Array.isArray(weekdays) ? [...new Set(weekdays)].filter(d => d >= 0 && d <= 6) : [];
  if (!days.length) return { recurrence: null, recurrence_weekdays: null, recurrence_until: null };
  return { recurrence: null, recurrence_weekdays: days, recurrence_until: until || null };
}
function nextRecurrenceDate(o) {
  const weekdays = weekdaysFromObjective(o);
  if (!weekdays.length) return null;
  // Ancre plancher = aujourd'hui. Cocher un objectif récurrent EN RETARD (dont
  // la date prévue est déjà passée) ne doit pas créer l'occurrence suivante
  // DANS LE PASSÉ, mais la prochaine occurrence réellement à venir.
  const today = localToday();
  const base = o.scheduled_date > today ? o.scheduled_date : today;
  for (let i = 1; i <= 7; i++) {
    const candidate = addDays(base, i);
    if (weekdays.includes(dateFromYmd(candidate).getDay())) {
      if (o.recurrence_until && candidate > o.recurrence_until) return null;
      return candidate;
    }
  }
  return null;
}

// ── Icons ─────────────────────────────────────────────────────
const IconChevron = ({ dir = "left", size = 16 }) => (
  <Glyph size={size}>
    <polyline points={dir === "left" ? "15 18 9 12 15 6" : "9 18 15 12 9 6"} />
  </Glyph>
);
const IconPlay = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
);
const IconPlus = ({ size = 14 }) => (
  <Glyph size={size}  strokeWidth={2.5}>
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </Glyph>
);
const IconClose = ({ size = 13 }) => (
  <Glyph size={size}  strokeWidth={2.5}>
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </Glyph>
);
const IconTrash = ({ size = 13 }) => (
  <Glyph size={size}>
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </Glyph>
);
const IconEdit = ({ size = 12 }) => (
  <Glyph size={size}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </Glyph>
);
const IconCalendar = ({ size = 13 }) => (
  <Glyph size={size}>
    <rect x="3" y="4" width="18" height="18" rx="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </Glyph>
);
const IconCopy = ({ size = 13 }) => (
  <Glyph size={size}>
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </Glyph>
);
const IconClock = ({ size = 16 }) => (
  <Glyph size={size}>
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </Glyph>
);
const IconSparkle = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2.5l1.9 5.1 5.1 1.9-5.1 1.9L12 16.5l-1.9-5.1L5 9.5l5.1-1.9z"/>
    <path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>
  </svg>
);

// ── Field : libellé + contrôle ────────────────────────────────
// Les formulaires n'avaient aucun libellé visible : on devinait à quoi
// servaient « min », le sélecteur de cours ou la rangée L M M J V S D.
function Field({ label, hint, htmlFor, children, className = "" }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={htmlFor} className="mb-1 block text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--bt-text-3)" }}>
        {label}
        {hint && <span className="ml-1 font-normal normal-case tracking-normal" style={{ color: "var(--bt-text-4)" }}>({hint})</span>}
      </label>
      {children}
    </div>
  );
}

// ── RecurrencePicker ─────────────────────────────────────────────
// Weekday multi-select (Lun→Dim, sourced from WEEKDAYS_SHORT so labels
// stay in sync with the rest of the file) + optional end date. Selecting
// all 7 days = "daily", a single day = "weekly" — no separate mode
// toggle needed, the picker itself expresses both plus anything between.
function RecurrencePicker({ weekdays, onToggle, until, onUntilChange, minDate }) {
  const { t, lang } = usePlan();
  const wd = weekdaysShortFor(lang);
  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5, 6, 0].map(dow => {
          const active = weekdays.includes(dow);
          return (
            <button key={dow} type="button" onClick={() => onToggle(dow)}
              aria-pressed={active}
              title={wd[(dow + 6) % 7]}
              className="h-9 flex-1 rounded-[10px] text-[11px] font-bold transition-all"
              style={active
                ? { backgroundColor: "var(--bt-action)", color: "#fff" }
                : { backgroundColor: "var(--bt-surface)", color: "var(--bt-text-3)", border: "1px solid var(--bt-border)" }}>
              {wd[(dow + 6) % 7].slice(0, 1)}
            </button>
          );
        })}
      </div>
      {weekdays.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xs" style={{ color: "var(--bt-text-3)" }}>{t("plan.recurrenceUntil")}</span>
          <input type="date" className="input flex-1 py-1 text-xs" min={minDate}
            value={until} onChange={e => onUntilChange(e.target.value)} />
        </div>
      )}
    </div>
  );
}

// ── ObjectiveForm ─────────────────────────────────────────────
// Formulaire unique de creation/edition d'objectif, controle. Utilisé aux
// deux endroits du DayDetailModal (ajout + edition inline). Chaque appelant
// fournit `value` (title/courseId/minutes/time/weekdays/until) +
// `onChange(patch)` + `onSubmit`, et `onCancel` optionnel.
const EMPTY_OBJECTIVE_FORM = { title: "", courseId: "", minutes: "", time: "", weekdays: [], until: "" };
function ObjectiveForm({ value, onChange, onSubmit, onCancel, minDate, submitLabel, autoFocus, title, className = "", style }) {
  const { activeCourses: courses, t } = usePlan();
  const weekdays = value.weekdays || [];
  return (
    <form onSubmit={onSubmit} className={`space-y-3 ${className}`} style={style}>
      {title && (
        <p className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{title}</p>
      )}
      <Field label={t("plan.formObjective")}>
        <input className="input text-sm" value={value.title} autoFocus={autoFocus}
          onChange={e => onChange({ title: e.target.value })}
          placeholder={t("plan.newObjective")} />
      </Field>
      <div className="flex gap-2">
        <Field label={t("plan.formCourse")} className="flex-1">
          <select className="input text-sm" value={value.courseId}
            onChange={e => onChange({ courseId: e.target.value })}>
            <option value="">{t("plan.courseSelect")}</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label={t("plan.formDuration")} className="w-24 shrink-0">
          <input className="input text-sm" type="number" min={5} step={5} placeholder="min"
            value={value.minutes} onChange={e => onChange({ minutes: e.target.value })} />
        </Field>
      </div>
      <Field label={t("plan.formTime")} hint={t("plan.formOptional")}>
        <input className="input text-sm" type="time" value={value.time}
          onChange={e => onChange({ time: e.target.value })} />
      </Field>
      <Field label={t("plan.formRepeat")} hint={t("plan.formOptional")}>
        <RecurrencePicker
          weekdays={weekdays}
          onToggle={dow => onChange({ weekdays: weekdays.includes(dow) ? weekdays.filter(d => d !== dow) : [...weekdays, dow] })}
          until={value.until || ""}
          onUntilChange={v => onChange({ until: v })}
          minDate={minDate} />
      </Field>
      <div className="flex gap-2 pt-0.5">
        <button type="submit" className="btn-primary flex-1 py-2 text-sm">{submitLabel}</button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-ghost flex-1 py-2 text-sm">{t("common.cancel")}</button>
        )}
      </div>
    </form>
  );
}

// ── ExamForm ──────────────────────────────────────────────────
// Ajout ET édition d'un examen (le même formulaire était écrit deux fois,
// à l'identique, dans le modal — d'où deux occasions de diverger).
// The calendar stamp identifies an exam without borrowing error styling;
// the form action keeps the app's primary green.
const EMPTY_EXAM_FORM = { name: "", courseId: "", time: "", location: "" };
function ExamForm({ value, onChange, onSubmit, onCancel, submitLabel, title, dateLabel }) {
  const { activeCourses: courses, t } = usePlan();
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl p-4"
      style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-hairline)" }}>
      <div className="flex items-center gap-2">
        <PlanningExamMark label={t("plan.examTag")} />
        <p className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{title}</p>
        {dateLabel && (
          <span className="ml-auto truncate text-xs" style={{ color: "var(--bt-text-3)" }}>{dateLabel}</span>
        )}
      </div>
      <Field label={t("plan.formExamName")}>
        <input className="input text-sm" value={value.name} required autoFocus
          onChange={e => onChange({ name: e.target.value })}
          placeholder={t("plan.examNamePlaceholder")} />
      </Field>
      <div className="flex gap-2">
        <Field label={t("plan.formCourse")} className="flex-1">
          <select className="input text-sm" value={value.courseId}
            onChange={e => onChange({ courseId: e.target.value })}>
            <option value="">{t("plan.courseSelect")}</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label={t("plan.formTime")} className="w-28 shrink-0">
          <input className="input text-sm" type="time" value={value.time}
            onChange={e => onChange({ time: e.target.value })} />
        </Field>
      </div>
      <Field label={t("plan.formLocation")} hint={t("plan.formOptional")}>
        <input className="input text-sm" value={value.location}
          onChange={e => onChange({ location: e.target.value })}
          placeholder={t("plan.examLocationPlaceholder")} />
      </Field>
      <div className="flex gap-2 pt-0.5">
        <button type="submit" className="btn-primary flex-1 py-2 text-sm">{submitLabel}</button>
        <button type="button" onClick={onCancel} className="btn-ghost flex-1 py-2 text-sm">{t("common.cancel")}</button>
      </div>
    </form>
  );
}

// ── Recurrence badge label ────────────────────────────────────
function recurrenceBadgeLabel(o, t, lang) {
  const days = weekdaysFromObjective(o);
  if (!days.length) return null;
  if (days.length === 7) return t("plan.recurDaily");
  if (days.length === 1) return t("plan.recurWeekly");
  const wd = weekdaysShortFor(lang);
  return days.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => wd[(d + 6) % 7]).join(" ");
}

// ── ExamBadge ─────────────────────────────────────────────────
// Countdown is context, not a second urgency/reward colour scale.
function ExamBadge({ days }) {
  const { t } = usePlan();
  return (
    <span className="bt-plan-exam-countdown text-xs font-semibold tabular-nums">
      {examCountdown(days, t)}
    </span>
  );
}

// ── TodayCard ─────────────────────────────────────────────────
// Résumé permanent de la journée en cours, avant le calendrier. Surface ink :
// c'est le moment de marque du planning, gardé tel quel. Mais une BANDE, pas
// une carte-héros : elle prenait 200 px au-dessus du calendrier pour deux
// chiffres et un examen. Le calendrier redevient la vedette.
// Deux prochaines actions maximum, seulement quand la période affichée ne
// contient pas aujourd'hui (sinon le calendrier les montre déjà).
function nameMentions(name, course) {
  return !!(name && course && String(name).toLocaleLowerCase().includes(String(course).toLocaleLowerCase()));
}
function TodayCard({ className = "", examMoment = null }) {
  const { byDate, examsByDate, overviewExams, toggle, courseName, launchTimer, openDay, lang, t, isOnToday } = usePlan();
  const nextExamAnchor = useRef(null);
  const today = localToday();
  const todayObjectives = byDate[today] || [];
  const todayExams      = examsByDate[today] || [];
  const doneCount       = todayObjectives.filter(o => o.done).length;
  const isEmptyToday    = todayObjectives.length === 0 && todayExams.length === 0;
  const remainingToday = todayObjectives.filter(o => !o.done).sort((a, b) => (a.scheduled_time || "99").localeCompare(b.scheduled_time || "99"));
  const workload = dayWorkload(todayObjectives);
  const nextExam = relevantUpcomingExams(overviewExams, today)[0];
  const nextExamDays = nextExam ? daysUntil(nextExam.exam_date) : null;
  const examCourse = nextExam?.course_id ? courseName(nextExam.course_id) : null;
  const examTitle = nextExam ? sentenceCase(nextExam.name || examCourse || t("plan.examTag")) : "";
  const dateLabel = dateFromYmd(today).toLocaleDateString(localeFor(lang), { weekday: "long", day: "numeric", month: "long" });

  return (
    <section className={`card-ink bt-planning-today ${className}`} aria-labelledby="bt-today-title">
      <div className="bt-today-grid">
        <div className="bt-today-main">
          <p className="bt-today-head">
            <span id="bt-today-title" className="bt-today-eyebrow">{t("plan.todayCardEyebrow")}</span>
            <button type="button" onClick={() => openDay(today)} className="bt-today-date">{sentenceCase(dateLabel)}</button>
          </p>
          <p className="bt-today-count tabular-nums">
            <span>
              {todayObjectives.length
                ? <><AnimatedNumber value={doneCount} />/{todayObjectives.length} <span className="bt-today-unit">{t("plan.todayCardObjectives")}</span></>
                : t("plan.nothingToday")}
            </span>
            {todayObjectives.length > 0 && <span className="bt-today-sub">{t("plan.leftToDo").replace("{n}", workload.remaining)}{workload.minutes > 0 && ` · ${formatMinutesShort(workload.minutes * 60)}`}</span>}
          </p>
          {isEmptyToday && (
            <button type="button" onClick={() => openDay(today)} className="bt-plan-ink-btn bt-today-cta">
              <IconPlus size={13} />{t("plan.dayAddObj")}
            </button>
          )}
          {/* Les deux prochaines actions ne servent que si le calendrier ne
              montre PAS déjà aujourd'hui. data-coach-floor : le coach de
              l'examen (téléphone) se pose au-dessus, jamais devant les ▶. */}
          {!isEmptyToday && remainingToday.length > 0 && !isOnToday && (
            <ul className="bt-today-next" data-coach-floor="">
              {remainingToday.slice(0, 2).map(o => (
                <li key={o.id}>
                  <label className="bt-today-check"><input type="checkbox" checked={o.done} onChange={() => toggle(o)}
                    aria-label={o.title || courseName(o.course_id) || "—"}
                    className="bt-task-check bt-task-check--ink h-4 w-4 shrink-0" /></label>
                  <CourseMark id={o.course_id} />
                  <span className="bt-today-next-title">{o.title || courseName(o.course_id) || "—"}</span>
                  {o.target_minutes > 0 && <span className="bt-today-next-min tabular-nums">{formatMinutesShort(o.target_minutes * 60)}</span>}
                  {o.course_id && <button type="button" className="bt-plan-ink-btn bt-today-play" aria-label={`${t("plan.startStudying")} · ${o.title || courseName(o.course_id)}`} onClick={() => launchTimer(o.course_id, o.target_minutes, o.title)}><IconPlay /></button>}
                </li>
              ))}
              {remainingToday.length > 2 && (
                <li>
                  <button type="button" onClick={() => openDay(today)} className="bt-today-more">+{remainingToday.length - 2} {t("plan.todayCardMore")}</button>
                </li>
              )}
            </ul>
          )}
        </div>

        {nextExam ? (
          <button ref={nextExamAnchor} type="button" onClick={() => openDay(nextExam.exam_date)} className="bt-planning-next-exam">
            <PlanningExamMark label={t("plan.nextExam")} />
            <span className="bt-next-exam-name">{examTitle}</span>
            <span className="bt-next-exam-meta">
              {nextExam.course_id && <CourseMark id={nextExam.course_id} />}
              {[examCourse && !nameMentions(examTitle, examCourse) && examCourse,
                nextExamDays > 1 && examCountdown(nextExamDays, t),
                quickDateLabel(nextExam.exam_date, lang, t),
                nextExam.exam_time && nextExam.exam_time.slice(0, 5)].filter(Boolean).join(" · ")}
            </span>
            {todayExams.length > 1 && <span className="bt-next-exam-more">{t(todayExams.length === 2 ? "plan.moreExamTodayOne" : "plan.moreExamTodayMany").replace("{n}", todayExams.length - 1)}</span>}
          </button>
        ) : null}
      </div>
      {examMoment && nextExam && <MascotMoment
        eventKey={examMoment.key}
        message={examMoment.message}
        mood="focused"
        frequency="daily"
        presentation="anchored"
        anchorKind="exam"
        anchorRef={nextExamAnchor}
        seenOnShow />}
    </section>
  );
}

// ── DayPlan ───────────────────────────────────────────────────
// UNE journée, une seule surface : la vue Jour la montre en place, la fiche
// d'un jour (ouverte depuis le Mois ou la Semaine) la montre en feuille. Avant,
// la vue Jour renvoyait chaque clic vers une fiche qui répétait la même liste
// avec quatre icônes par ligne.
//
// Ordre imposé par le brief Planning (« Jour = agir ») :
//   1. ce que l'université impose d'important — examens, examens possibles,
//      gros travaux ;
//   2. le plan d'étude, ce que l'étudiant CHOISIT, avec le passage au Chrono ;
//   3. les petites échéances importées.
// Un seul « + Ajouter » (objectif d'étude / examen). Les actions secondaires
// d'une ligne vivent dans son « … » ; supprimer y est séparé, en rouge.
function IconMore({ size = 18 }) {
  return <Glyph size={size}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></Glyph>;
}

function DayPlan({ date, inSheet = false }) {
  const { academic, academicPrefill, planAcademicWork, courses, modalPrefillTime, byDate, examsByDate, sessions,
          courseName, toggle, remove, postpone, launchTimer,
          addObjectiveForDate, saveObjEdit, addExam, removeExam, saveExamEdit, duplicateDay, lang, t } = usePlan();
  const prefill = inSheet ? academicPrefill : null;
  const prefillTime = inSheet ? modalPrefillTime : null;

  const [form, setForm]               = useState(null); // "objective" | "exam" | null
  const [studyDate, setStudyDate]     = useState(date);
  const [addForm, setAddForm]         = useState(EMPTY_OBJECTIVE_FORM);
  const [examForm, setExamForm]       = useState(EMPTY_EXAM_FORM);
  const [dupOpen, setDupOpen]         = useState(false);
  const [editingObjId, setEditingObjId] = useState(null);
  const [editForm, setEditForm]       = useState({});
  const [movingId, setMovingId]       = useState(null);
  const [editingExamId, setEditingExamId] = useState(null);
  const [examEditForm, setExamEditForm]   = useState(EMPTY_EXAM_FORM);
  const formRef = useRef(null);

  // À chaque jour / préremplissage : repartir d'un état propre. Depuis un
  // créneau de la grille horaire ou « Planifier du travail », le formulaire
  // d'objectif s'ouvre directement, prérempli.
  useEffect(() => {
    setForm(prefillTime || prefill ? "objective" : null);
    setStudyDate(date);
    setAddForm({ ...EMPTY_OBJECTIVE_FORM, ...prefill, time: prefillTime || "" });
    setExamForm(EMPTY_EXAM_FORM);
    setEditingObjId(null);
    setMovingId(null);
    setEditingExamId(null);
    setDupOpen(false);
  }, [date, prefillTime, prefill]);

  useEffect(() => {
    if (form) formRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [form]);

  const today      = localToday();
  const tomorrow   = tomorrowISO();
  const isPast     = date < today;
  const isToday    = date === today;
  const objectives = [...(byDate[date] || [])].sort((a, b) => Number(a.done) - Number(b.done)
    || (a.scheduled_time || "99").localeCompare(b.scheduled_time || "99"));
  const exams      = examsByDate[date] || [];
  const { important, secondary } = splitAcademicEvents(academic.byDate[date]);
  const work       = dayWorkload(objectives);
  const doneCount  = objectives.length - work.remaining;
  const studiedSecs = sessions
    .filter(s => ymd(new Date(s.started_at)) === date)
    .reduce((sum, s) => sum + s.duration_seconds, 0);
  const plannedMin = objectives.reduce((sum, o) => sum + (o.target_minutes || 0), 0);

  function startInlineEdit(o) {
    setEditingObjId(o.id);
    setEditForm({
      title: o.title || "", courseId: o.course_id || "", minutes: o.target_minutes || "", time: o.scheduled_time || "",
      weekdays: weekdaysFromObjective(o), until: o.recurrence_until || "",
    });
  }
  async function handleInlineSave(e) {
    e.preventDefault();
    await saveObjEdit(editingObjId, editForm);
    setEditingObjId(null);
  }
  function startExamEdit(ex) {
    setEditingExamId(ex.id);
    setExamEditForm({ name: ex.name || "", courseId: ex.course_id || "", time: ex.exam_time || "", location: ex.location || "" });
  }
  async function handleExamEditSave(e) {
    e.preventDefault();
    if (!examEditForm.name.trim()) return;
    const saved = await saveExamEdit(editingExamId, {
      name:      examEditForm.name.trim(),
      course_id: examEditForm.courseId || null,
      exam_time: examEditForm.time     || null,
      location:  examEditForm.location || null,
    });
    if (saved) setEditingExamId(null);
  }
  async function handleAdd(e) {
    e.preventDefault();
    if (prefill && (!studyDate || studyDate < localToday())) return;
    const data = await addObjectiveForDate(prefill ? studyDate : date, addForm);
    if (data) {
      setAddForm(EMPTY_OBJECTIVE_FORM);
      setForm(null);
    }
  }
  async function handleAddExam(e) {
    e.preventDefault();
    if (!examForm.name.trim()) return;
    const added = await addExam({
      name:      examForm.name.trim(),
      course_id: examForm.courseId || null,
      exam_date: date,
      exam_time: examForm.time     || null,
      location:  examForm.location || null,
    });
    if (added) {
      setExamForm(EMPTY_EXAM_FORM);
      setForm(null);
    }
  }

  const dayTitle = sentenceCase(dateFromYmd(date).toLocaleDateString(localeFor(lang), { weekday: "long", day: "numeric", month: "long" }));
  const summary = objectives.length
    ? t("plan.daySummaryDone").replace("{done}", doneCount).replace("{n}", objectives.length)
    : t("plan.dayNothingPlanned");
  // Le reste à faire en TEMPS : le nombre d'objectifs est déjà dans « 1/4 ».
  const summaryFacts = work.minutes > 0 ? t("plan.timeToGo").replace("{t}", formatMinutesShort(work.minutes * 60)) : "";

  return (
    <div className="bt-day-plan">
      <div className="bt-day-head">
        <div className="min-w-0">
          <p className="bt-day-summary">{summary}</p>
          {/* Le temps étudié reste visible, même à zéro : c'est le lien vivant
              entre le planning et le Chrono. */}
          <p className="bt-day-studied">
            <IconClock size={14} />
            <span>{plannedMin > 0
              ? t("plan.studiedOf").replace("{done}", formatMinutesShort(studiedSecs)).replace("{planned}", formatMinutesShort(plannedMin * 60))
              : t("plan.studiedOnly").replace("{done}", formatMinutesShort(studiedSecs))}
              {summaryFacts && <span className="bt-day-summary-facts"> · {summaryFacts}</span>}</span>
          </p>
          {plannedMin > 0 && (
            <span className="bt-day-studied-bar" aria-hidden="true">
              <span style={{ transform: `scaleX(${Math.min(1, studiedSecs / 60 / plannedMin)})` }} />
            </span>
          )}
        </div>
        <div className="bt-day-head-actions">
          <PlanMenu label={t("plan.addMenu")} triggerClassName="bt-plan-action bt-plan-action--outline" width={240} items={[
            !isPast && { key: "objective", label: t("academic.studyObjective"), description: t("plan.addObjectiveHint"), onSelect: () => setForm("objective") },
            { key: "exam", label: t("plan.addExamShort"), description: t("plan.addExamHint"), onSelect: () => setForm("exam") },
          ]}>
            <IconPlus size={13} />{t("common.add")}
          </PlanMenu>
          {objectives.length > 0 && (
            <PlanMenu label={t("plan.dayActions")} ariaLabel={t("plan.dayActions")} triggerClassName="bt-plan-icon-action" width={240} items={[
              { key: "duplicate", label: t("plan.duplicateDay"), icon: <IconCopy />, onSelect: () => setDupOpen(true) },
            ]}>
              <IconMore />
            </PlanMenu>
          )}
        </div>
      </div>

      {dupOpen && (
        <div className="bt-day-inline-tool">
          <label className="bt-day-inline-label" htmlFor={`dup-${date}`}>{t("plan.duplicateDayTo")}</label>
          <input id={`dup-${date}`} type="date" className="input flex-1" min={today}
            onChange={async e => {
              if (e.target.value && e.target.value !== date) {
                await duplicateDay(date, e.target.value);
                setDupOpen(false);
              }
            }} />
          <button type="button" onClick={() => setDupOpen(false)} className="bt-plan-action bt-plan-action--quiet">{t("common.cancel")}</button>
        </div>
      )}

      {/* 1 — Ce que l'université impose d'important. */}
      {exams.length > 0 && (
        <div className="bt-day-exams">
          {exams.map(ex => editingExamId === ex.id ? (
            <ExamForm key={ex.id}
              value={examEditForm}
              onChange={patch => setExamEditForm(f => ({ ...f, ...patch }))}
              onSubmit={handleExamEditSave}
              onCancel={() => setEditingExamId(null)}
              submitLabel={t("common.save")}
              title={t("plan.dayEdit")} />
          ) : (
            <div key={ex.id} className="bt-plan-exam-detail">
              <div className="min-w-0 flex-1">
                <PlanningExamMark label={t("plan.examTag")} />
                {ex.name && <p className="mt-1 break-words text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>{ex.name}</p>}
                <p className="bt-day-exam-meta">
                  {ex.course_id && <span className="inline-flex items-center gap-1.5"><CourseMark id={ex.course_id} />{courseName(ex.course_id)}</span>}
                  {[ex.exam_time && ex.exam_time.slice(0, 5), ex.location].filter(Boolean).map(part => <span key={part}>{part}</span>)}
                </p>
                <ExamBadge days={daysUntil(ex.exam_date)} />
                {ex.source === "course" && <LegacyExamDate exam={ex} />}
              </div>
              <PlanMenu label={t("plan.examActions")} ariaLabel={t("plan.examActions")} triggerClassName="bt-plan-icon-action" width={220} items={[
                ex.source !== "course" && { key: "edit", label: t("plan.dayEdit"), icon: <IconEdit size={14} />, onSelect: () => startExamEdit(ex) },
                { key: "delete", label: t("common.delete"), icon: <IconTrash size={14} />, danger: true, separated: ex.source !== "course", onSelect: () => removeExam(ex.id) },
              ]}>
                <IconMore />
              </PlanMenu>
            </div>
          ))}
        </div>
      )}
      <AcademicDeadlines events={important} calendar={academic} courses={courses} t={t} lang={lang} onPlan={planAcademicWork}
        heading={t("plan.dayAcademicImportant")} className="bt-day-section" />

      {/* 2 — Le plan d'étude. */}
      <section className="bt-day-section" aria-label={t("academic.studyPlan")}>
        <h3 className="bt-plan-section-label">{t("academic.studyPlan")}</h3>
        {objectives.length === 0 && form !== "objective" && (
          <p className="bt-day-empty">{isPast ? t("plan.dayNothingPlanned") : t("plan.dayEmptyHint")}</p>
        )}
        <ul className="bt-day-tasks">
          {objectives.map(o => {
            if (editingObjId === o.id) {
              return (
                <li key={o.id} className="bt-day-task-edit">
                  <ObjectiveForm
                    value={editForm}
                    onChange={patch => setEditForm(f => ({ ...f, ...patch }))}
                    onSubmit={handleInlineSave}
                    onCancel={() => setEditingObjId(null)}
                    minDate={date}
                    submitLabel={t("common.save")}
                    autoFocus />
                </li>
              );
            }
            const realSecs = o.course_id
              ? sessions.filter(s => s.course_id === o.course_id && ymd(new Date(s.started_at)) === o.scheduled_date)
                  .reduce((sum, s) => sum + s.duration_seconds, 0)
              : 0;
            const recurLabel = recurrenceBadgeLabel(o, t, lang);
            const overdue = isPast && !o.done;
            const canStart = !o.done && isToday && o.course_id;
            const label = o.title || courseName(o.course_id) || "—";
            return (
              <li key={o.id} className="bt-day-task" data-done={o.done ? "1" : undefined}>
                <label className="bt-day-check"><input type="checkbox" className="bt-task-check h-4 w-4" checked={o.done} onChange={() => toggle(o)} aria-label={label} /></label>
                <div className="bt-day-task-body">
                  <p className="bt-day-task-title"><span className={`bt-strike ${o.done ? "is-done" : ""}`}>{label}</span></p>
                  <p className="bt-day-task-meta">
                    <span className="inline-flex min-w-0 items-center gap-1.5"><CourseMark id={o.course_id} /><span className="truncate">{courseName(o.course_id) || t("plan.unassigned")}</span></span>
                    {o.scheduled_time && <span className="tabular-nums">{o.scheduled_time.slice(0, 5)}</span>}
                    {o.target_minutes > 0 && <span className="tabular-nums">{formatMinutesShort(o.target_minutes * 60)}</span>}
                    {recurLabel && <span>↻ {recurLabel}</span>}
                    {realSecs > 0 && <span className="bt-day-task-studied">{formatMinutesShort(realSecs)} {t("plan.dayStudied").toLowerCase()}</span>}
                    {overdue && <span className="bt-day-task-overdue">{t("plan.dayOverdue")}</span>}
                  </p>
                  {o.target_minutes > 0 && realSecs > 0 && (
                    <span className="bt-day-task-bar" aria-hidden="true">
                      <span style={{ transform: `scaleX(${Math.min(1, realSecs / 60 / o.target_minutes)})` }} />
                    </span>
                  )}
                  {movingId === o.id && (
                    <div className="bt-day-inline-tool">
                      <label className="bt-day-inline-label" htmlFor={`move-${o.id}`}>{t("plan.postponeOtherDate")}</label>
                      <input id={`move-${o.id}`} type="date" className="input flex-1" min={tomorrow} autoFocus
                        onChange={e => {
                          if (e.target.value && e.target.value >= tomorrow) {
                            postpone(o.id, e.target.value);
                            setMovingId(null);
                          }
                        }} />
                      <button type="button" onClick={() => setMovingId(null)} className="bt-plan-action bt-plan-action--quiet">{t("common.cancel")}</button>
                    </div>
                  )}
                </div>
                {canStart && (
                  <button type="button" className="bt-plan-start" onClick={() => launchTimer(o.course_id, o.target_minutes, o.title)}
                    aria-label={`${t("plan.startStudying")} · ${label}`}>
                    <IconPlay size={11} /><span className="bt-plan-start-label">{t("plan.start")}</span>
                  </button>
                )}
                <PlanMenu label={t("plan.objectiveActions")} ariaLabel={`${t("plan.objectiveActions")} · ${label}`} triggerClassName="bt-plan-icon-action" width={240} items={[
                  { key: "edit", label: t("plan.dayEdit"), icon: <IconEdit size={14} />, onSelect: () => startInlineEdit(o) },
                  !o.done && { key: "tomorrow", label: t("plan.dayPostpone"), icon: <IconCalendar size={14} />, onSelect: () => postpone(o.id, tomorrow) },
                  !o.done && { key: "move", label: t("plan.moveToDay"), onSelect: () => setMovingId(o.id) },
                  { key: "delete", label: t("common.delete"), icon: <IconTrash size={14} />, danger: true, separated: true, onSelect: () => remove(o.id) },
                ]}>
                  <IconMore />
                </PlanMenu>
              </li>
            );
          })}
        </ul>

        {form === "objective" && !isPast && (
          <div ref={formRef} className="bt-day-form">
            {prefill && (
              <label className="mb-3 block text-sm">{t("academic.planDate")}
                <input type="date" className="input mt-1 w-full" min={localToday()} required value={studyDate} onChange={e => setStudyDate(e.target.value)} />
              </label>
            )}
            <ObjectiveForm
              title={t("plan.newObjectiveTitle")}
              value={addForm}
              onChange={patch => setAddForm(f => ({ ...f, ...patch }))}
              onSubmit={handleAdd}
              onCancel={() => setForm(null)}
              minDate={prefill ? studyDate : date}
              submitLabel={t("common.add")}
              autoFocus />
          </div>
        )}
        {form === "exam" && (
          <div ref={formRef} className="bt-day-form bt-day-form--plain">
            <ExamForm
              value={examForm}
              onChange={patch => setExamForm(f => ({ ...f, ...patch }))}
              onSubmit={handleAddExam}
              onCancel={() => setForm(null)}
              submitLabel={t("plan.examSubmit")}
              title={t("plan.newExamTitle")}
              dateLabel={dayTitle} />
          </div>
        )}
      </section>

      {/* 3 — Les petites échéances importées, après le plan. */}
      <AcademicDeadlines events={secondary} calendar={academic} courses={courses} t={t} lang={lang} onPlan={planAcademicWork}
        heading={t(important.length || exams.length ? "plan.dayAlsoDue" : "plan.dayDue")} limit={inSheet ? 0 : 6} className="bt-day-section" />
    </div>
  );
}

// ── DayDetailModal ────────────────────────────────────────────
// La même journée, en feuille : bas d'écran sur téléphone, centrée au-delà.
function DayDetailModal() {
  const { modalDate, setModalDate, lang, t } = usePlan();
  const dialogRef = useRef(null);
  const closeRef = useRef(null);

  // Échap ferme la fiche ; Tab reste dedans. Les menus et popovers ouverts
  // par-dessus gèrent leurs propres touches et ne la ferment pas.
  useEffect(() => {
    if (!modalDate) return undefined;
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    if (!dialog?.contains(document.activeElement)) closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") setModalDate(null);
      if (e.key === "Tab" && dialog) {
        const nodes = [...dialog.querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex="0"]')]
          .filter(el => !el.disabled && el.getClientRects().length);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); previousFocus?.focus?.(); };
  }, [modalDate, setModalDate]);

  if (!modalDate) return null;
  const today = localToday();
  const isToday = modalDate === today;
  const isPast = modalDate < today;
  const dayTitle = sentenceCase(dateFromYmd(modalDate).toLocaleDateString(localeFor(lang), { weekday: "long", day: "numeric", month: "long" }));

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ backgroundColor: "rgba(0,0,0,0.42)", backdropFilter: "blur(3px)" }}
        onClick={() => setModalDate(null)} />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4">
        <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={dayTitle}
          className="bt-planning-dialog pointer-events-auto rounded-t-[28px] sm:w-full sm:max-w-lg sm:rounded-[24px]"
          style={{
            backgroundColor: "var(--bt-surface)",
            border: "1px solid var(--bt-hairline)",
            boxShadow: "0 -8px 48px rgba(0,0,0,0.18), 0 2px 16px rgba(0,0,0,0.08)",
            maxHeight: "88vh",
            overflowY: "auto",
          }}>
          <div className="flex justify-center pb-1 pt-3 sm:hidden">
            <div className="h-1 w-10 rounded-full" style={{ backgroundColor: "var(--bt-border)" }} />
          </div>
          <div className="px-5 pb-8 pt-2 sm:pt-5">
            <div className="bt-day-sheet-head">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold leading-tight" style={{ color: "var(--bt-text-1)" }}>{dayTitle}</h2>
                {(isToday || isPast) && (
                  <p className="mt-1 text-xs font-semibold" style={{ color: isToday ? "var(--bt-accent-text)" : "var(--bt-text-2)" }}>
                    {isToday ? t("common.today") : t("plan.dayPast")}
                  </p>
                )}
              </div>
              <button ref={closeRef} type="button" onClick={() => setModalDate(null)} aria-label={t("common.close")}
                className="bt-plan-icon-action -mr-2 shrink-0">
                <IconClose size={14} />
              </button>
            </div>
            <DayPlan date={modalDate} inSheet />
          </div>
        </div>
      </div>
    </>
  );
}

// ── MonthView ─────────────────────────────────────────────────
// « Mois = anticiper » : les jalons et les périodes chargées. Chaque case suit
// la même anatomie, de haut en bas :
//   date (et, sur ordinateur, la durée d'étude prévue à droite) ;
//   l'examen, qui possède le fond de la case ;
//   un ou deux titres d'objectifs (ordinateur) ;
//   en pied de case, le NOMBRE d'échéances importées — jamais leurs titres.
// Le fond porte l'identité du cours qui pèse le plus de minutes ce jour-là.
// Pas de légende : l'estampille « Examen » se nomme elle-même et
// aujourd'hui a son disque.
function MonthView() {
  const { academic, cursor, byDate, examsByDate, selectedDate, setSelectedDate, openDay, courseColor, courseName, lang, t } = usePlan();
  const grid  = buildMonthGrid(cursor.year, cursor.month);
  const today = localToday();
  const weeks = Array.from({ length: 6 }, (_, i) => grid.slice(i * 7, i * 7 + 7))
    .filter(week => week.some(d => d.getMonth() === cursor.month));

  return (
    <section className="card overflow-hidden bt-plan-month">
      <div className="grid grid-cols-7 border-b" style={{ borderColor: "var(--bt-border)" }}>
        {weekdaysShortFor(lang).map((d, i) => (
          <div key={d}
            className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: i >= 5 ? "var(--bt-text-3)" : "var(--bt-text-2)" }}>
            {d}
          </div>
        ))}
      </div>

      <div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7"
            style={{ borderBottom: wi < weeks.length - 1 ? "1px solid var(--bt-border)" : "none" }}>
            {week.map((d, di) => {
              const key       = ymd(d);
              const inMonth   = d.getMonth() === cursor.month;
              const adjacentMonthLabel = !inMonth && ((wi === 0 && di === 0) || d.getDate() === 1)
                ? new Intl.DateTimeFormat(lang === "fr" ? "fr-BE" : "en-US", { month: "short" }).format(d).replace(/\.$/, "")
                : null;
              const isToday   = key === today;
              const isSel     = key === selectedDate;
              const items     = byDate[key]      || [];
              const imported  = academicSummary(academic.byDate[key]);
              const examItems = [...(examsByDate[key] || []), ...imported.exams.map(e => ({ name: e.course_name || e.title, course_id: e.course_id, imported: true }))];

              // La charge en MINUTES prévues ; seul un vrai cours teinte la case.
              const load  = dayLoad(items);
              const tint  = load.dominantCourseId ? rgbTriplet(courseColor(load.dominantCourseId)) : null;
              const fill = examItems.length ? "exam" : tint ? "course" : items.length ? "planned" : null;
              const loadAria = load.minutes > 0
                ? t("plan.loadAria")
                    .replace("{t}", formatMinutesShort(load.minutes * 60))
                    .replace("{courses}", load.courses.map(entry => entry.id ? courseName(entry.id) : t("plan.unassigned")).filter(Boolean).join(", "))
                : "";
              const label = [
                quickDateLabel(key, lang, t),
                t(items.length === 1 ? "plan.objectiveCountOne" : "plan.objectiveCountMany").replace("{n}", items.length),
                examItems.length ? `${t(examItems.length === 1 ? "plan.examCountOne" : "plan.examCountMany").replace("{n}", examItems.length)} : ${examItems.map(e => e.name || courseName(e.course_id)).join(", ")}` : null,
                imported.deadlines ? t(imported.deadlines === 1 ? "academic.countOne" : "academic.countMany").replace("{n}", imported.deadlines) : null,
                loadAria || null,
              ].filter(Boolean).join(" — ");
              const titles = items.slice(0, examItems.length ? 1 : 2);
              const firstExam = examItems[0];

              return (
                <button key={key} type="button" onClick={() => { if (inMonth || examItems.length || imported.deadlines) openDay(key); else setSelectedDate(key); }}
                  aria-label={label} aria-current={isToday ? "date" : undefined}
                  // Aujourd'hui garde son disque ; le contour de sélection ne
                  // s'y ajoute pas (sinon le jour criait plus fort qu'un examen).
                  data-fill={fill || undefined} data-selected={isSel && !isToday ? "1" : undefined}
                  data-outside-month={!inMonth ? "1" : undefined}
                  data-past={key < today ? "1" : undefined}
                  data-past-complete={key < today && !examItems.length && items.length > 0 && items.every(o => o.done) ? "1" : undefined}
                  className="bt-plan-day-cell relative text-left"
                  style={{
                    "--bt-day-tint": tint || undefined,
                    borderRight: di < 6 ? "1px solid var(--bt-border)" : "none",
                  }}>
                  <span className="bt-plan-month-head">
                    <span className={`bt-plan-month-date inline-flex min-h-6 items-center gap-1 font-num text-xs font-bold tabular-nums${adjacentMonthLabel ? " bt-plan-month-date--labelled" : ""}`}
                      style={{ color: inMonth ? "var(--bt-text-1)" : "var(--bt-text-2)" }}>
                      <span className="bt-plan-month-date-number inline-flex h-6 w-6 items-center justify-center rounded-full"
                        style={isToday ? { backgroundColor: "var(--bt-action)", color: "#fff" } : undefined}>{d.getDate()}</span>
                      {adjacentMonthLabel && <span className="bt-plan-adjacent-month-label">{adjacentMonthLabel}</span>}
                    </span>
                    {load.minutes > 0 && <span className="bt-plan-month-load font-num tabular-nums" aria-hidden="true">{formatMinutesShort(load.minutes * 60)}</span>}
                  </span>

                  {firstExam && (
                    <span className="bt-planning-month-exam" aria-hidden="true">
                      <PlanningExamMark label={t("plan.examTag")} count={examItems.length} compact />
                      <span className="bt-plan-month-exam-name">
                        {firstExam.course_id && <CourseMark id={firstExam.course_id} />}
                        <span className="bt-plan-month-exam-text">{firstExam.name || courseName(firstExam.course_id)}</span>
                      </span>
                    </span>
                  )}

                  {titles.length > 0 && (
                    <span className="bt-plan-month-titles" aria-hidden="true">
                      {titles.map(o => (
                        <span key={o.id} className="bt-plan-month-objective" data-done={o.done ? "1" : undefined}>
                          <CourseMark id={o.course_id} />
                          <span className="bt-plan-month-objective-title">{o.title || courseName(o.course_id) || "—"}</span>
                        </span>
                      ))}
                    </span>
                  )}

                  {imported.deadlines > 0 && (
                    <span className="bt-plan-month-due" aria-hidden="true">
                      <span className="bt-plan-month-due-long">{t(imported.deadlines === 1 ? "academic.countOne" : "academic.countMany").replace("{n}", imported.deadlines)}</span>
                      <span className="bt-plan-month-due-short">{imported.deadlines} {t("academic.countCompactLabel")}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── WeekWorkload ──────────────────────────────────────────────
// « Semaine = équilibrer » : ma semaine est-elle bien répartie ? Sept rangées
// d'UNE ligne (deux sur téléphone) qui partagent le même bord gauche : la
// bande de charge, sur une échelle absolue commune, se compare d'un coup
// d'œil d'un jour à l'autre. À côté : les objectifs en texte, l'examen en
// estampille et le NOMBRE d'échéances — plus de sous-titre « Échéances
// universitaires » répété sept fois, plus de puces empilées. Toute la
// semaine tient dans un écran d'ordinateur ; une rangée ouvre sa journée.
function WeekWorkload({ days }) {
  const { academic, byDate, examsByDate, courseColor, courseName, openDay, t, lang } = usePlan();
  const today = localToday();
  const loads = days.map(d => dayLoad(byDate[ymd(d)] || []));
  const weekMinutes = loads.reduce((sum, load) => sum + load.minutes, 0);
  const weekExams = days.reduce((sum, d) => sum + (examsByDate[ymd(d)]?.length || 0) + academicSummary(academic.byDate[ymd(d)]).exams.length, 0);
  const weekDue = days.reduce((sum, d) => sum + academicSummary(academic.byDate[ymd(d)]).deadlines, 0);

  function loadLabel(load) {
    if (!load.minutes) return t("plan.loadAriaEmpty");
    const names = load.courses.map(entry => entry.id ? courseName(entry.id) : t("plan.unassigned")).filter(Boolean);
    return t("plan.loadAria").replace("{t}", formatMinutesShort(load.minutes * 60)).replace("{courses}", names.join(", "));
  }

  return (
    <section className="card overflow-hidden bt-plan-week">
      <div className="bt-plan-week-head">
        <h2 className="bt-plan-section-label">{t("plan.weekLoadTitle")}</h2>
        <p className="bt-plan-week-sum">
          {[weekMinutes > 0 && <strong key="t" className="font-num tabular-nums">{formatMinutesShort(weekMinutes * 60)}</strong>,
            weekExams > 0 && <span key="e">{t(weekExams === 1 ? "plan.examCountOne" : "plan.examCountMany").replace("{n}", weekExams)}</span>,
            weekDue > 0 && <span key="d">{t(weekDue === 1 ? "academic.countOne" : "academic.countMany").replace("{n}", weekDue)}</span>,
          ].filter(Boolean).reduce((acc, node, i) => (i ? [...acc, <span key={`s${i}`} aria-hidden="true"> · </span>, node] : [node]), [])}
        </p>
      </div>

      <ul className="bt-plan-week-list">
        {days.map((d, i) => {
          const key       = ymd(d);
          const load      = loads[i];
          const items     = byDate[key] || [];
          const imported  = academicSummary(academic.byDate[key]);
          const examItems = [...(examsByDate[key] || []), ...imported.exams.map(e => ({ id: e.key, name: e.title, course_id: e.course_id, exam_time: null }))];
          const isToday   = key === today;
          const isPast    = key < today;
          const overdue   = isPast ? items.filter(o => !o.done).length : 0;
          const pending   = items.filter(o => !o.done);
          const empty     = !load.minutes && !examItems.length && !items.length && !imported.deadlines;
          const firstExam = examItems[0];
          const summary = [
            quickDateLabel(key, lang, t),
            loadLabel(load),
            items.length ? t(items.length === 1 ? "plan.objectiveCountOne" : "plan.objectiveCountMany").replace("{n}", items.length) : null,
            overdue ? t(overdue === 1 ? "plan.overdueOne" : "plan.overdueMany").replace("{n}", overdue) : null,
            examItems.length ? `${t(examItems.length === 1 ? "plan.examCountOne" : "plan.examCountMany").replace("{n}", examItems.length)} : ${examItems.map(e => e.name || courseName(e.course_id)).join(", ")}` : null,
            imported.deadlines ? t(imported.deadlines === 1 ? "academic.countOne" : "academic.countMany").replace("{n}", imported.deadlines) : null,
          ].filter(Boolean).join(" — ");

          return (
            <li key={key}>
              <button type="button" className="bt-plan-week-row" onClick={() => openDay(key)} aria-label={summary}
                aria-current={isToday ? "date" : undefined}
                data-today={isToday ? "1" : undefined} data-exam={examItems.length ? "1" : undefined} data-empty={empty ? "1" : undefined}
                data-past={isPast ? "1" : undefined}>
                <span className="bt-plan-week-date" aria-hidden="true">
                  <span className="bt-plan-week-weekday">{weekdaysShortFor(lang)[(d.getDay() + 6) % 7]}</span>
                  <span className="bt-plan-week-daynum font-num tabular-nums">{d.getDate()}</span>
                </span>

                <span className="bt-plan-week-load" aria-hidden="true">
                  {load.minutes > 0
                    ? <><PlanningLoadBar load={load} courseColor={courseColor} max={3} /><span className="bt-plan-week-total font-num tabular-nums">{formatMinutesShort(load.minutes * 60)}</span></>
                    : <span className="bt-plan-week-none">{empty ? t("plan.noPlan") : "—"}</span>}
                </span>

                <span className="bt-plan-week-work" aria-hidden="true">
                  {items.length > 0 && (
                    <span className="bt-plan-week-titles">
                      {(pending.length ? pending : items).slice(0, 3).map(o => (
                        <span key={o.id} className="bt-plan-week-title" data-done={o.done ? "1" : undefined}><CourseMark id={o.course_id} /><span>{o.title || courseName(o.course_id) || "—"}</span></span>
                      ))}
                    </span>
                  )}
                  {(items.length > 3 || overdue > 0 || (items.length && !pending.length)) && (
                    <span className="bt-plan-week-meta">
                      {[items.length > 3 && t(items.length === 1 ? "plan.objectiveCountOne" : "plan.objectiveCountMany").replace("{n}", items.length),
                        items.length > 0 && !pending.length && t("plan.allDone"),
                        overdue > 0 && t(overdue === 1 ? "plan.overdueOne" : "plan.overdueMany").replace("{n}", overdue)].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>

                <span className="bt-plan-week-academic" aria-hidden="true">
                  {firstExam && (
                    <span className="bt-plan-week-exam">
                      <PlanningExamMark label={t("plan.examTag")} count={examItems.length} compact />
                      <span className="bt-plan-week-exam-name">{firstExam.name || courseName(firstExam.course_id)}{firstExam.exam_time ? ` · ${firstExam.exam_time.slice(0, 5)}` : ""}</span>
                    </span>
                  )}
                  {imported.deadlines > 0 && <span className="bt-plan-week-due">{t(imported.deadlines === 1 ? "academic.countOne" : "academic.countMany").replace("{n}", imported.deadlines)}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── TimeGrid ──────────────────────────────────────────────────
// Les objectifs posés à une heure précise. La grille ne déroule que les
// heures utiles (de la première à la dernière heure occupée, une heure de
// marge de chaque côté) au lieu de seize rangées vides. Sur téléphone, elle
// défile horizontalement plutôt que d'écraser sept colonnes.
function TimeGrid({ days }) {
  const { byDate, examsByDate, selectedDate, courseName, openDay, t, lang } = usePlan();
  const today = localToday();
  const multi = days.length > 1;
  const gridMinWidth = multi ? TIMEGRID_GUTTER + days.length * TIMEGRID_MIN_COL : 0;
  const columns = `${TIMEGRID_GUTTER}px repeat(${days.length}, minmax(0, 1fr))`;
  const used = days.flatMap(d => (byDate[ymd(d)] || []).map(o => getHour(o.scheduled_time))).filter(h => HOURS.includes(h));
  const first = Math.max(HOURS[0], Math.min(...used) - 1);
  const last = Math.min(HOURS[HOURS.length - 1], Math.max(...used) + 1);
  const hours = used.length ? HOURS.filter(h => h >= first && h <= last) : HOURS;

  function handleSlotClick(key, h) {
    openDay(key, h !== null ? String(h).padStart(2, "0") + ":00" : null);
  }

  return (
    <>
      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <div style={{ minWidth: gridMinWidth || undefined }}>
            <div className="grid" style={{ gridTemplateColumns: columns, borderBottom: "1px solid var(--bt-border)" }}>
              <div style={{ borderRight: "1px solid var(--bt-border)" }} />
              {days.map(d => {
                const key     = ymd(d);
                const isToday = key === today;
                const isSel   = key === selectedDate;
                return (
                  <button key={key} type="button" onClick={() => openDay(key)}
                    className="bt-plan-day-head py-2 text-center transition-colors"
                    aria-current={isToday ? "date" : undefined}
                    style={{ borderRight: "1px solid var(--bt-border)", backgroundColor: isSel ? "var(--bt-mint-strong)" : "transparent" }}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--bt-text-3)" }}>
                      {weekdaysShortFor(lang)[(d.getDay() + 6) % 7]}
                    </p>
                    <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full font-num text-sm font-bold tabular-nums"
                      style={isToday ? { backgroundColor: "var(--bt-action)", color: "#fff" } : { color: "var(--bt-text-1)" }}>
                      {d.getDate()}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Toute la journée : les examens seulement. */}
            {days.some(d => (examsByDate[ymd(d)] || []).length) && (
              <div className="grid min-h-[38px]"
                style={{ gridTemplateColumns: columns, backgroundColor: "var(--bt-subtle)", borderBottom: "1px solid var(--bt-border)" }}>
                <div className="flex items-center justify-center px-1" style={{ borderRight: "1px solid var(--bt-border)" }}>
                  <span className="text-[10px] font-medium" style={{ color: "var(--bt-text-3)" }}>{t("plan.allDayShort")}</span>
                </div>
                {days.map(d => {
                  const key       = ymd(d);
                  const examItems = examsByDate[key] || [];
                  return (
                    <div key={key} className="bt-plan-slot cursor-pointer space-y-0.5 p-1"
                      style={{ borderRight: "1px solid var(--bt-border)" }}
                      onClick={() => handleSlotClick(key, null)}>
                      {examItems.map(e => (
                        <button key={e.id} type="button" className="bt-planning-week-exam"
                          title={e.name}
                          onClick={ev => { ev.stopPropagation(); openDay(key); }}>
                          <PlanningExamMark label={t("plan.examTag")} />
                          {e.exam_time && <span className="block text-xs">{e.exam_time.slice(0, 5)}</span>}
                          <strong className="block truncate">{e.name}</strong>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            <div>
              {hours.map(h => (
                <div key={h} className="grid"
                  style={{ gridTemplateColumns: columns, minHeight: 48, borderBottom: "1px solid var(--bt-border)" }}>
                  <div className="shrink-0 px-2 pt-1.5" style={{ borderRight: "1px solid var(--bt-border)" }}>
                    <span className="font-num text-xs tabular-nums" style={{ color: "var(--bt-text-3)" }}>{String(h).padStart(2,"0")}h</span>
                  </div>
                  {days.map(d => {
                    const key      = ymd(d);
                    const isToday  = key === today;
                    const slotObjs = (byDate[key] || []).filter(o => getHour(o.scheduled_time) === h);
                    return (
                      <div key={key} className="bt-plan-slot cursor-pointer p-1"
                        style={{ borderRight: "1px solid var(--bt-border)", backgroundColor: isToday ? TODAY_TINT : "transparent" }}
                        onClick={() => handleSlotClick(key, h)}>
                        {slotObjs.map(o => (
                          <button type="button" key={o.id}
                            className="bt-plan-objective-chip mb-0.5"
                            data-done={o.done ? "1" : undefined}
                            title={o.title || courseName(o.course_id) || ""}
                            onClick={e => { e.stopPropagation(); openDay(key); }}>
                            <CourseMark id={o.course_id} /><span className="min-w-0"><span className="block truncate">{o.title || courseName(o.course_id) || "—"}</span><span className="sr-only">{courseName(o.course_id) || t("plan.unassigned")}</span>
                            {o.target_minutes > 0 && (
                              <span className="font-num text-xs tabular-nums">{formatMinutesShort(o.target_minutes * 60)}</span>
                            )}
                            </span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      {multi && (
        <p className="mt-2 px-1 text-[11px] no-print xl:hidden" style={{ color: "var(--bt-text-2)" }}>
          {t("plan.weekScrollHint")}
        </p>
      )}
    </>
  );
}

// ── WeekView ──────────────────────────────────────────────────
// La répartition d'abord ; la grille horaire n'apparaît que si la semaine
// contient un objectif posé à une heure affichable.
function WeekView({ days }) {
  const { byDate, t } = usePlan();
  const hasTimed = days.some(d => (byDate[ymd(d)] || [])
    .some(o => HOURS.includes(getHour(o.scheduled_time))));
  return (
    <>
      <WeekWorkload days={days} />
      {hasTimed && (
        <section className="mt-4">
          <div className="mb-2 px-1">
            <h2 className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t("plan.timedSectionTitle")}</h2>
            <p className="text-xs" style={{ color: "var(--bt-text-2)" }}>{t("plan.timedSectionHint")}</p>
          </div>
          <TimeGrid days={days} />
        </section>
      )}
    </>
  );
}

// ── DayView ───────────────────────────────────────────────────
function DayView() {
  const { selectedDate } = usePlan();
  return <section className="card bt-day-card"><DayPlan date={selectedDate} /></section>;
}

// ── QuickAddBar ───────────────────────────────────────────────
// L'ajout rapide en langage naturel (« Bio 2h demain 14h »), en BARRE
// d'outil : un champ, son bouton, et l'aperçu de ce qui sera créé seulement
// pendant la saisie. Ce n'est plus une carte titrée qui disputait la place au
// calendrier. 100 % client (lib/planningQuickAdd), l'étudiant voit et corrige
// avant de valider.
function QuickAddBar({ className = "" }) {
  const { activeCourses: courses, addObjectiveForDate, courseName, lang, t } = usePlan();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const trimmed = text.trim();
  const parsed = trimmed ? parseQuickObjective(text, { courses, baseDateISO: localToday() }) : null;
  const canAdd = !!parsed && (parsed.title.trim() !== "" || parsed.courseId !== "");

  async function submit(e) {
    e.preventDefault();
    if (!canAdd || busy) return;
    setBusy(true);
    const data = await addObjectiveForDate(parsed.dateISO, {
      title: parsed.title, courseId: parsed.courseId,
      minutes: parsed.minutes || "", time: parsed.time || "",
      weekdays: [], until: "",
    });
    setBusy(false);
    if (data) setText("");
  }

  const preview = parsed && (parsed.courseId || parsed.title)
    ? [parsed.courseId ? courseName(parsed.courseId) : null, parsed.title || null, quickDateLabel(parsed.dateISO, lang, t),
       parsed.minutes > 0 ? formatMinutesShort(parsed.minutes * 60) : null, parsed.time || null].filter(Boolean)
    : null;

  return (
    <form onSubmit={submit} onFocus={() => setFocused(true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}
      className={`bt-quick-add no-print ${className}`}>
      <div className="bt-quick-add-field">
        <span className="bt-quick-add-icon" aria-hidden="true"><IconSparkle /></span>
        {/* 16 px sur téléphone : en dessous, iOS zoome sur le champ. */}
        <input value={text} onChange={e => setText(e.target.value)}
          placeholder={t("plan.quickAddPrompt")} aria-label={t("plan.quickAddTitle")}
          aria-describedby="bt-quick-add-help"
          className="bt-quick-add-input" />
        <button type="submit" disabled={!canAdd || busy} className={canAdd && !busy ? "btn-primary bt-quick-add-submit" : "bt-quick-add-submit bt-quick-add-submit--idle"}>
          {t("common.add")}
        </button>
      </div>
      <p id="bt-quick-add-help" className="bt-quick-add-help" aria-live="polite">
        {trimmed
          ? preview
            ? <><span className="bt-quick-add-help-label">{t("plan.quickAddPreview")}</span> {preview.join(" · ")}</>
            : t("plan.quickAddNothing")
          : focused ? t("plan.quickAddHint") : null}
      </p>
    </form>
  );
}

// ── PlanToolbar ───────────────────────────────────────────────
// La période d'abord, la navigation ensuite. Les actions globales — calendrier
// universitaire, export, partage, copie de la semaine — vivent toutes dans le
// « … » ; sa pastille ne s'allume que pour une chose qui demande l'étudiant
// (un cours importé à associer, une synchronisation en échec).
function PlanToolbar({ periodLabel, onPrev, onNext, onToday, showToday, view, onViewChange, actions, actionsBadge, className = "" }) {
  const { t } = usePlan();
  const viewOptions = [
    { value: "day", label: t("plan.day") },
    { value: "week", label: t("plan.week") },
    { value: "month", label: t("plan.month") },
  ];
  const nav = (
    <>
      <button type="button" onClick={onPrev} aria-label={t("plan.prevPeriod")}
        className="bt-plan-nav-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
        <IconChevron dir="left" />
      </button>
      <button type="button" onClick={onNext} aria-label={t("plan.nextPeriod")}
        className="bt-plan-nav-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
        <IconChevron dir="right" />
      </button>
    </>
  );
  const menu = (
    <PlanMenu label={t("plan.planningActions")} ariaLabel={actionsBadge ? `${t("plan.planningActions")} — ${t("plan.needsAttention")}` : t("plan.planningActions")}
      triggerClassName="bt-plan-nav-btn relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" width={300} items={actions}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>
      </svg>
      {actionsBadge && <span className="bt-plan-badge" aria-hidden="true" />}
    </PlanMenu>
  );
  const today = showToday && (
    <button type="button" onClick={onToday} className="bt-plan-action bt-plan-action--quiet bt-plan-today-btn shrink-0">
      {t("common.today")}
    </button>
  );
  return (
    <div className={className}>
      <div className="bt-plan-toolbar-head flex items-center gap-2">
        <h1 className="bt-page-title bt-plan-toolbar-title min-w-0 flex-1">
          {sentenceCase(periodLabel)}
        </h1>
        {/* Ordinateur : bascule de vue, navigation, « Aujourd'hui » et « … »
            sur la même ligne que la période. */}
        <div className="bt-plan-toolbar-actions hidden shrink-0 items-center gap-1 no-print lg:flex">
          <div className="mr-2">
            <SegmentedGlide className="inline-flex" buttonClassName="px-4 py-2 text-xs" options={viewOptions} value={view} onChange={onViewChange} />
          </div>
          {nav}
          {today}
          <span className="ml-1">{menu}</span>
        </div>
        <div className="no-print lg:hidden">{today}</div>
      </div>

      {/* Téléphone et tablette : une seule seconde ligne — la vue occupe la
          place libre, la navigation et le « … » restent à droite. */}
      <div className="bt-plan-toolbar-mobile mt-3 flex items-center gap-1.5 no-print lg:hidden">
        <SegmentedGlide className="min-w-0 flex-1" buttonClassName="flex-1 px-1.5 py-2 text-xs" options={viewOptions} value={view} onChange={onViewChange} />
        {nav}
        {menu}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function Planning() {
  const { user, profile, refreshProfile } = useAuth();
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const {
    courseId: timerCourseId, setCourseId: setTimerCourseId, setNote: setTimerNote,
    running: timerRunning, elapsed: timerElapsed, pause: pauseTimer, reset: resetTimer,
  } = useTimer();
  const [view, setView]             = useState("month");
  // Premier chargement des donnees de la page. Tant qu'il n'est pas termine on
  // affiche un squelette : sinon la page rend des zeros et des listes vides,
  // que les gens lisent comme un bug et non comme un chargement.
  const [ready, setReady] = useState(false);
  const forceSkeleton = useSkeletonHatch();
  const [courses, setCourses]       = useState([]);
  const [objectives, setObjectives] = useState([]);
  const [examRows, setExamRows]     = useState([]);
  const exams = normalizePlanningExams(courses, examRows);
  const academic = useAcademicCalendar(user, courses, exams);
  const loadAcademic = academic.load;
  // Vues d'ensemble (Aujourd'hui, Par cours) : un examen importé que
  // l'étudiant a marqué comme examen EST un examen — le calendrier le dessine
  // déjà ainsi. Un import converti en examen local n'apparaît qu'une fois.
  const overviewExams = [...exams, ...confirmedImportedExams(academic.byDate)];
  const [examLoadWarning, setExamLoadWarning] = useState(false);
  // Serialise exam writes: deleting two same-day events concurrently could
  // otherwise let each assume the other still represents the legacy date.
  const examWrites = useRef(new Set());
  const [sessions, setSessions]     = useState([]);
  const [frozenDays, setFrozenDays] = useState([]); // gel de série (v29)
  const [cursor, setCursor]         = useState(() => {
    const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState(localToday());
  const [modalDate, setModalDate] = useState(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [academicPrefill, setAcademicPrefill] = useState(null);
  const [modalPrefillTime, setModalPrefillTime] = useState(null); // heure pré-remplie quand on ouvre depuis un créneau de la grille
  const [togglingShare, setTogglingShare] = useState(false); // pilote l'UI (disabled/opacité)
  const togglingShareRef = useRef(false); // verrou synchrone anti double-clic (cf. togglePlanningPublic)

  // Le planning s'ouvre toujours sur le MOIS, téléphone comme ordinateur :
  // c'est la vue d'ensemble du blocus. Changer de vue vaut pour la visite en
  // cours, pas pour la suivante.
  const changeView = useCallback((v) => {
    setView(v);
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    const ninetyAgo = new Date(Date.now() - 90 * 864e5).toISOString();
    const [courseRes, { data: o }, examRes, { data: s }] = await Promise.all([
      supabase.from("courses").select("*").eq("user_id", user.id).order("created_at"),
      supabase.from("objectives").select("*").eq("user_id", user.id).order("scheduled_date"),
      supabase.from("exams").select("*").eq("user_id", user.id).order("exam_date"),
      supabase.from("sessions")
        .select("user_id,course_id,duration_seconds,started_at")
        .eq("user_id", user.id)
        .gte("started_at", ninetyAgo),
      loadAcademic(),
    ].map(query => Promise.resolve(query).catch(error => ({ data: null, error }))));
    if (!courseRes.error) setCourses(courseRes.data || []);
    setObjectives(o || []);
    if (!examRes.error) setExamRows(examRes.data || []);
    setExamLoadWarning(!!(courseRes.error || examRes.error));
    setSessions(s || []);
    // Gel de série : mêmes jours gelés que le dashboard (mémoïsé par jour).
    const freeze = await runStreakFreezeUpkeep(supabase, user.id);
    if (freeze.supported) setFrozenDays(freeze.frozenDays);
  }, [user, loadAcademic]);

  useEffect(() => { load().finally(() => setReady(true)); }, [load]);

  useEffect(() => {
    if (view === "month") {
      const d = dateFromYmd(selectedDate);
      setCursor({ year: d.getFullYear(), month: d.getMonth() });
    }
  }, [view]); // eslint-disable-line

  // Point d'entrée unique vers la fiche d'un jour (le modal). Synchronise
  // aussi la sélection du calendrier, et transporte l'éventuelle heure
  // cliquée dans la grille horaire pour pré-remplir le formulaire d'ajout.
  function openDay(date, prefillTime = null) {
    setAcademicPrefill(null);
    setSelectedDate(date);
    setModalPrefillTime(prefillTime);
    setModalDate(date);
  }

  // « Planifier du travail » (échéance importée) et « Planifier une révision »
  // (un cours) ouvrent le même formulaire d'objectif, prérempli, sur la fiche
  // d'aujourd'hui, avec une date au choix. Aucune durée n'est inventée.
  function planWork(prefill) {
    openDay(localToday());
    setAcademicPrefill(prefill);
  }
  function planAcademicWork(event) {
    planWork({ title: event.title, courseId: event.course_id || "" });
  }

  async function toggle(o) {
    const { data } = await supabase.from("objectives").update({ done: !o.done }).eq("id", o.id).select().single();
    if (data) {
      setObjectives(p => p.map(x => x.id === o.id ? data : x));
      notifyXPChanged();
      if (!o.done) {
        playSensoryCue("task");
        // A completed objective is shared at most once, even if rechecked.
        autoSharePost(supabase, {
          userId: user.id,
          kind: "goal_completed",
          eventKey: data.id,
          activity: { version: 1, type: "goal_completed", title: data.title || "" },
        });
        const nextDate = nextRecurrenceDate(o);
        if (nextDate) {
          const alreadyExists = objectives.some(x =>
            !x.done && x.title === o.title && x.course_id === o.course_id && x.scheduled_date === nextDate
          );
          if (!alreadyExists) {
            const { data: next } = await supabase.from("objectives")
              .insert({ user_id: user.id, title: o.title, course_id: o.course_id,
                target_minutes: o.target_minutes, scheduled_date: nextDate,
                scheduled_time: o.scheduled_time || null, done: false,
                recurrence: o.recurrence || null,
                recurrence_weekdays: o.recurrence_weekdays || null,
                recurrence_until: o.recurrence_until || null })
              .select().single();
            if (next) setObjectives(p => [...p, next]);
          }
        }
      }
    }
  }

  // Pont planning -> chrono : lance le chrono du dashboard pré-rempli avec ce
  // cours, la durée visée de l'objectif et son titre en note — on arrive prêt
  // à démarrer, sans resaisir ce qui était déjà planifié. Si une session est
  // deja en cours (ou du temps non enregistre en pause) sur un AUTRE cours, on
  // confirme avant d'ecraser (meme logique que confirmDiscardIfWorking sur le
  // dashboard : on ne perd jamais du temps silencieusement).
  function launchTimer(cId, targetMinutes, title) {
    if (!cId) return;
    if ((timerRunning || timerElapsed > 0) && timerCourseId !== cId) {
      if (!window.confirm(t("plan.confirmSwitchCourse"))) return;
      if (timerRunning) pauseTimer();
      resetTimer();
    }
    setTimerCourseId(cId);
    // Uniquement si l'objectif porte réellement ces informations : sans ça on
    // écraserait la note ou la durée que la personne venait de choisir.
    if (Number(targetMinutes) > 0) writeSessionGoal(Number(targetMinutes));
    if (title && title.trim() && !timerRunning && timerElapsed === 0) setTimerNote(title.trim());
    router.push("/dashboard");
  }

  async function remove(id) {
    await supabase.from("objectives").delete().eq("id", id);
    setObjectives(p => p.filter(x => x.id !== id));
  }

  async function postpone(id, newDate) {
    const { data } = await supabase.from("objectives")
      .update({ scheduled_date: newDate, done: false }).eq("id", id).select().single();
    if (data) setObjectives(p => p.map(x => x.id === id ? data : x));
  }

  async function addExam(examData) {
    if (examWrites.current.size) return false;
    examWrites.current.add("add");
    try {
      const { data, error } = await supabase.from("exams")
        .insert({ user_id: user.id, ...examData }).select().single();
      if (error || !data) throw error || new Error("Missing exam");
      setExamRows(p => [...p, data]);
      notifyXPChanged();
      toast(t("toast.examAdded"));
      return true;
    } catch { toast(t("plan.examWriteError"), "error"); return false; }
    finally { examWrites.current.delete("add"); }
  }

  async function removeExam(id) {
    const exam = exams.find(e => e.id === id);
    if (!exam || examWrites.current.size) return;
    examWrites.current.add(id);
    try {
      await deletePlanningExam(supabase, user.id, exam, exams);
      await load();
    } catch {
      toast(t("plan.examWriteError"), "error");
      await load();
    } finally { examWrites.current.delete(id); }
  }

  async function saveExamEdit(id, examData) {
    if (examWrites.current.size) return false;
    examWrites.current.add(id);
    try {
      const { data, error } = await supabase.from("exams")
        .update(examData).eq("id", id).eq("user_id", user.id).select().single();
      if (error || !data) throw error || new Error("Missing exam");
      setExamRows(p => p.map(x => x.id === id ? data : x));
      return true;
    } catch { toast(t("plan.examWriteError"), "error"); return false; }
    finally { examWrites.current.delete(id); }
  }

  async function saveLegacyDate(exam, date) {
    if (examWrites.current.size) return;
    examWrites.current.add(exam.id);
    try {
      await updateLegacyExamDate(supabase, user.id, exam, date);
      await load();
    } catch { toast(t("plan.examWriteError"), "error"); await load(); }
    finally { examWrites.current.delete(exam.id); }
  }

  async function addObjectiveForDate(date, { title: ft, courseId: fc, minutes: fm, time: fti, weekdays: fw, until: fu }) {
    if (!ft.trim() && !fc) return null;
    const { data } = await supabase.from("objectives")
      .insert({ user_id: user.id, title: ft.trim(), course_id: fc || null,
        target_minutes: Number(fm) || 0, scheduled_date: date,
        scheduled_time: fti || null, ...recurrenceFields(fw, fu) })
      .select().single();
    if (data) { setObjectives(p => [...p, data]); toast(t("toast.objectiveAdded")); }
    return data;
  }

  async function saveObjEdit(id, form) {
    const { data } = await supabase.from("objectives")
      .update({ title: form.title.trim(), course_id: form.courseId || null,
        target_minutes: Number(form.minutes) || 0, scheduled_time: form.time || null,
        ...recurrenceFields(form.weekdays, form.until) })
      .eq("id", id).select().single();
    if (data) setObjectives(p => p.map(x => x.id === id ? data : x));
  }

  // Copie tous les objectifs d'un jour vers un autre. La récurrence est retirée
  // sur les copies : un doublon est ponctuel (sinon on recréerait des séries
  // récurrentes qui re-spawneraient à l'infini). Insert groupé = 1 requête.
  async function duplicateDay(sourceDate, targetDate) {
    const src = objectives.filter(o => o.scheduled_date === sourceDate);
    if (!src.length || !targetDate || targetDate === sourceDate) return 0;
    const rows = src.map(o => ({
      user_id: user.id, title: o.title, course_id: o.course_id,
      target_minutes: o.target_minutes || 0, scheduled_date: targetDate,
      scheduled_time: o.scheduled_time || null, done: false,
    }));
    const { data } = await supabase.from("objectives").insert(rows).select();
    if (data && data.length) {
      setObjectives(p => [...p, ...data]);
      toast(t("toast.dayDuplicated").replace("{n}", String(data.length)));
      return data.length;
    }
    return 0;
  }

  // Copie la semaine affichée vers la suivante (+7 j par objectif).
  async function duplicateWeek() {
    const weekISO = getWeekDays(selectedDate).map(ymd);
    const rows = objectives
      .filter(o => weekISO.includes(o.scheduled_date))
      .map(o => ({
        user_id: user.id, title: o.title, course_id: o.course_id,
        target_minutes: o.target_minutes || 0, scheduled_date: addDays(o.scheduled_date, 7),
        scheduled_time: o.scheduled_time || null, done: false,
      }));
    if (!rows.length) { toast(t("plan.duplicateEmpty"), "info"); return; }
    if (!window.confirm(t("plan.duplicateWeekConfirm").replace("{n}", String(rows.length)))) return;
    const { data } = await supabase.from("objectives").insert(rows).select();
    if (data && data.length) {
      setObjectives(p => [...p, ...data]);
      toast(t("toast.weekDuplicated").replace("{n}", String(data.length)));
    }
  }

  // Bug corrigé : sans garde ni await, un double-clic rapide relisait le
  // même `profile.planning_public` périmé (stale closure) et recalculait
  // la même valeur `next` au lieu de l'inverser — le toggle semblait figé.
  // Verrou sur un ref (pas juste un state) : un `useState` seul ne suffit
  // pas ici, sa mise à jour n'est visible qu'après le prochain rendu React,
  // donc deux clics strictement synchrones (avant tout re-rendu) verraient
  // encore tous les deux `togglingShare === false` et passeraient la garde.
  // Le ref, lui, est mis à jour immédiatement et bloque le second appel
  // même dans ce cas limite. On attend aussi le refresh du profil avant
  // d'autoriser un nouveau clic, et on prévient en cas d'erreur (RLS,
  // réseau) au lieu de rester silencieux.
  async function togglePlanningPublic() {
    if (togglingShareRef.current) return;
    togglingShareRef.current = true;
    setTogglingShare(true);
    try {
      const next = !profile?.planning_public;
      const { error } = await supabase.from("profiles").update({ planning_public: next }).eq("id", user.id);
      if (error) toast(t("plan.shareError"), "error");
      else await refreshProfile();
    } catch {
      // Réseau, exception inattendue... — sans ce filet, une seule erreur ici
      // laissait togglingShareRef bloqué à `true` pour toujours (rien après
      // ce point ne le remettait à `false`), rendant le bouton figé et
      // silencieusement inactif à chaque clic suivant.
      toast(t("plan.shareError"), "error");
    } finally {
      togglingShareRef.current = false;
      setTogglingShare(false);
    }
  }

  // `courses` garde tout : un objectif posé sur un cours archivé doit conserver
  // son nom et sa couleur. Seuls les CHOIX se limitent aux cours du semestre.
  const activeCourses = courses.filter(c => !c.archived_at);
  const courseColor = id => {
    const color = courses.find(c => c.id === id)?.color;
    return rgbTriplet(color) ? color : null;
  };
  const courseName  = id => courses.find(c => c.id === id)?.name;

  // Export .ics : examens + objectifs (non terminés) vers un agenda externe.
  function exportCalendar() {
    if (countExportable({ objectives, exams }) === 0) { toast(t("plan.exportEmpty"), "info"); return; }
    const ics = buildIcs({ objectives, exams, courseName, t, calName: t("plan.calendarName") });
    downloadIcs(`blocus-tracker-${localToday()}.ics`, ics);
    toast(t("toast.planningExported"));
  }

  const byDate = objectives.reduce((acc, o) => {
    (acc[o.scheduled_date] = acc[o.scheduled_date] || []).push(o); return acc;
  }, {});

  const examsByDate = exams.reduce((acc, e) => {
    (acc[e.exam_date] = acc[e.exam_date] || []).push(e); return acc;
  }, {});

  const today = localToday();
  const todayObjectives = byDate[today] || [];
  const todayExams      = examsByDate[today] || [];
  const nextExam = relevantUpcomingExams(overviewExams, today)[0] || null;
  const nextExamDays = nextExam ? daysUntil(nextExam.exam_date) : null;
  const hasPreparationForNextExam = nextExam
    ? objectives.some(o => !o.done
        && o.scheduled_date >= today
        && o.scheduled_date < nextExam.exam_date
        && (!nextExam.course_id || o.course_id === nextExam.course_id))
    : false;
  const todayMinutes = todayObjectives.reduce((sum, o) => sum + (Number(o.target_minutes) || 0), 0);
  const missingExamPreparation = nextExam && nextExamDays > 0 && nextExamDays <= 7 && !hasPreparationForNextExam;
  // La mascotte doit dire la même chose que la carte du jour. Elle annonçait
  // « planning prêt, tu sais quoi faire aujourd'hui » alors que la carte
  // affichait « rien de prévu » — il suffisait d'un objectif posé un autre
  // jour. D'où l'état `todayEmpty`, évalué avant `ready`.
  // Un seul moment sur cette page : l'examen qui approche sans révision
  // prévue. C'est une échéance qu'on peut avoir laissée passer, et il y a
  // quelque chose à faire — les deux conditions d'une apparition.
  const examMoment = missingExamPreparation && nextExam
    ? {
        key: `planning-exam-${nextExam.id}`,
        message: nextExamDays === 1
          ? t("mascot.examTomorrow")
          : t("mascot.exam").replace("{days}", String(nextExamDays)),
      }
    : null;

  function shiftDays(n) { const d = dateFromYmd(selectedDate); d.setDate(d.getDate() + n); setSelectedDate(ymd(d)); }
  function shiftMonth(delta) { setCursor(c => { const d = new Date(c.year, c.month + delta, 1); return { year: d.getFullYear(), month: d.getMonth() }; }); }
  function goToday() { const now = localToday(); setSelectedDate(now); const d = new Date(); setCursor({ year: d.getFullYear(), month: d.getMonth() }); }
  function handlePrev() { if (view==="day") shiftDays(-1); else if (view==="week") shiftDays(-7); else shiftMonth(-1); }
  function handleNext() { if (view==="day") shiftDays(1);  else if (view==="week") shiftDays(7);  else shiftMonth(1); }
  const planningSwipe = usePlanningSwipe(handlePrev, handleNext);

  // « Aujourd'hui » ne sert qu'à revenir : inutile quand on y est déjà.
  const isOnToday = view === "day"
    ? selectedDate === today
    : view === "week"
      ? getWeekDays(selectedDate).map(ymd).includes(today)
      : cursor.year === dateFromYmd(today).getFullYear() && cursor.month === dateFromYmd(today).getMonth();

  function periodLabel() {
    const months = monthsFor(lang);
    if (view === "day") return dateFromYmd(selectedDate).toLocaleDateString(localeFor(lang), { weekday:"long", day:"numeric", month:"long" });
    if (view === "week") {
      const days = getWeekDays(selectedDate), f = days[0], l = days[6];
      return f.getMonth() === l.getMonth()
        ? `${f.getDate()} – ${l.getDate()} ${months[f.getMonth()]} ${f.getFullYear()}`
        : `${f.getDate()} ${months[f.getMonth()]} – ${l.getDate()} ${months[l.getMonth()]} ${l.getFullYear()}`;
    }
    return `${months[cursor.month]} ${cursor.year}`;
  }

  // Actions globales du planning — toutes dans le menu « … ». Le calendrier
  // universitaire y vit aussi : sa gestion n'occupe plus de place sous le
  // calendrier. La pastille du « … » ne s'allume que si l'étudiant a quelque
  // chose à faire (cours importé à associer, examen modifié à la source,
  // synchronisation en échec) — pas pour un réglage.
  const providerLabel = source => ({ canvas: "Canvas", moodle: "Moodle", brightspace: "Brightspace" })[source.provider] || t("uc.otherProvider");
  const ucPending = academic.sources.reduce((sum, source) => sum + externalCourses(academic.rows, academic.maps, source.id).filter(c => !c.mapping).length, 0);
  const ucChanged = academic.sources.reduce((sum, source) => sum + calendarReview(academic.rows, academic.maps, academic.links, source.id, academic.hidden).attention.filter(row => row.link).length, 0);
  const ucFailed = academic.error || academic.sources.some(source => source.sync_status === "error");
  const ucAttention = !!(ucPending || ucChanged || ucFailed);
  const ucDescription = !academic.sources.length ? t("plan.ucConnectHint")
    : ucFailed ? t("plan.ucSyncFailed")
    : ucChanged ? t(ucChanged === 1 ? "plan.ucChangedOne" : "plan.ucChangedMany").replace("{n}", ucChanged)
    : ucPending ? t("uc.needsMatching").replace("{n}", ucPending)
    : `${academic.sources.map(providerLabel).join(", ")} · ${t("uc.connected").toLocaleLowerCase()}`;
  const planningActions = [
    { key: "university", label: t("academic.settings"), description: ucDescription, onSelect: () => setCalendarOpen(true),
      icon: <Glyph size={16}><path d="M22 10 12 5 2 10l10 5 10-5Z" /><path d="M6 12v5c3 2 9 2 12 0v-5" /></Glyph> },
    { key: "export", label: t("plan.exportCalendar"), description: t("plan.exportCalendarShort"), icon: <IconCalendar size={16} />, onSelect: exportCalendar },
    view === "week" && { key: "duplicate", label: t("plan.duplicateWeek"), description: t("plan.duplicateWeekHint"), icon: <IconCopy size={16} />, onSelect: duplicateWeek },
    { key: "share", label: t("plan.shareMenu"), checked: !!profile?.planning_public, disabled: togglingShare, separated: true,
      hint: profile?.planning_public ? t("plan.shareShared") : t("plan.sharePrivate"), onSelect: togglePlanningPublic,
      icon: <Glyph size={16} strokeWidth={1.8}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></Glyph> },
  ];

  const ctxValue = {
    academic, academicPrefill, planAcademicWork, planWork, overviewExams,
    view, isOnToday, courses, activeCourses, objectives, byDate, examsByDate, cursor, selectedDate, setSelectedDate,
    toggle, remove, courseColor, courseName, exams, sessions, postpone, addExam, removeExam, saveExamEdit, saveLegacyDate,
    modalDate, setModalDate, modalPrefillTime, openDay, addObjectiveForDate, saveObjEdit,
    launchTimer, duplicateDay, duplicateWeek,
    lang, t,
  };

  if (!ready || forceSkeleton) return <Layout><PageContentSkeleton pathname="/planning" /></Layout>;

  return (
    <Ctx.Provider value={ctxValue}>
      <style>{`@media print { aside, nav, header, footer, .no-print { display: none !important; } body { background: white !important; } .card { box-shadow: none !important; } }`}</style>
      <Layout>
        {/* Une colonne par défaut, deux à partir de xl. Le seuil est xl et non
            lg : à 1024 px la barre latérale de navigation (232 px) plus une
            colonne de contexte de 320 px ne laissaient que ~380 px au
            calendrier, soit des cases de 54 px où le titre d'un objectif ne
            rentre pas. Entre 1024 et 1280 px la page reste donc sur une
            colonne large, ce qui s'y lit mieux.
            Les deux enveloppes sont `display:contents` sous xl : les 6 blocs
            redeviennent enfants directs de la pile, et `order-*` fixe l'ordre
            mobile une bonne fois (l'ordre du DOM sert la colonne desktop). */}
        <div className="bt-planning flex flex-col gap-4">
          {examLoadWarning && <div role="status" className="bt-plan-notice">
            <p>{t("plan.examLoadWarning")}</p><button type="button" className="bt-plan-action bt-plan-action--outline" onClick={load}>{t("plan.retryLoad")}</button>
          </div>}
          {academic.error && <div role="alert" className="bt-plan-notice">
            <p>{t("academic.loadError")}</p><button type="button" className="bt-plan-action bt-plan-action--outline" onClick={academic.load}>{t("academic.retry")}</button>
          </div>}
          <TodayCard examMoment={examMoment} />
          <div className="flex min-w-0 flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_288px] xl:items-start xl:gap-6">
            <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-3">
              <PlanToolbar
                className="order-1"
                periodLabel={periodLabel()}
                onPrev={handlePrev} onNext={handleNext} onToday={goToday} showToday={!isOnToday}
                view={view} onViewChange={changeView}
                actions={planningActions} actionsBadge={ucAttention} />

              <QuickAddBar className="order-2" />

              {/* Keyed on the view so switching mois/semaine/jour plays a soft fade. */}
              <div {...planningSwipe} className="order-5 min-w-0">
                <div key={`${view}-${view === "month" ? `${cursor.year}-${cursor.month}` : selectedDate}`} className="bt-tab-fade">
                  {view === "month" && <MonthView />}
                  {view === "week"  && <WeekView days={getWeekDays(selectedDate)} />}
                  {view === "day"   && <DayView />}
                </div>
              </div>
            </div>

            <div className="contents xl:block xl:sticky xl:top-6">
              <CourseOverview className="order-6"
                courses={activeCourses} objectives={objectives} exams={overviewExams} academic={academic} today={today}
                t={t} lang={lang} openDay={openDay} toggle={toggle} launchTimer={launchTimer} planWork={planWork} onPlanAcademic={planAcademicWork} />
            </div>
          </div>
        </div>
      </Layout>

      {/* Day detail modal — mounted outside Layout to avoid stacking context issues */}
      <DayDetailModal />
      {calendarOpen && <UniversityCalendar calendar={academic} courses={activeCourses} exams={exams} t={t} lang={lang}
        onClose={() => setCalendarOpen(false)} refresh={load}
        onOpenExam={exam => { setCalendarOpen(false); openDay(exam.exam_date); }} />}
    </Ctx.Provider>
  );
}
