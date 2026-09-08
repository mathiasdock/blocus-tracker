import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { PageContentSkeleton, useSkeletonHatch } from "../components/PageSkeleton";
import CourseChecklistModal from "../components/CourseChecklistModal";
import MascotCoach from "../components/MascotCoach";
import SegmentedGlide from "../components/SegmentedGlide";
import AnimatedNumber from "../components/AnimatedNumber";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { useToast } from "../contexts/ToastContext";
import { useTimer } from "../contexts/TimerContext";
import { supabase } from "../lib/supabaseClient";
import { formatMinutesShort, computeStreak } from "../lib/format";
import { runStreakFreezeUpkeep } from "../lib/streakFreezes";
import { buildIcs, downloadIcs, countExportable } from "../lib/ics";
import { parseQuickObjective } from "../lib/planningQuickAdd";
import { writeSessionGoal } from "../lib/sessionGoal";
import { notifyXPChanged } from "../lib/xpEvents";
import { playSensoryCue } from "../lib/sensoryFeedback";

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
const TODAY_TINT = "rgba(20,184,133,0.06)";

// ── Context ────────────────────────────────────────────────────
const Ctx = createContext(null);
const usePlan = () => useContext(Ctx);

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
const ic = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
const IconChevron = ({ dir = "left", size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...ic} aria-hidden="true">
    <polyline points={dir === "left" ? "15 18 9 12 15 6" : "9 18 15 12 9 6"} />
  </svg>
);
const IconPlay = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
);
const IconPlus = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...ic} strokeWidth="2.5" aria-hidden="true">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const IconClose = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...ic} strokeWidth="2.5" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const IconTrash = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...ic} aria-hidden="true">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);
const IconEdit = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...ic} aria-hidden="true">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const IconCalendar = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...ic} aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);
const IconCopy = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...ic} aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);
const IconClock = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...ic} aria-hidden="true">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
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
  const { courses, t } = usePlan();
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
// Le rouge n'est plus la couleur du formulaire : il identifie le TYPE
// (liseré + pastille), l'action reste au vert de l'app. Un formulaire
// entièrement rouge se lit comme une erreur, pas comme « examen ».
const EMPTY_EXAM_FORM = { name: "", courseId: "", time: "", location: "" };
function ExamForm({ value, onChange, onSubmit, onCancel, submitLabel, title, dateLabel }) {
  const { courses, t } = usePlan();
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl p-4"
      style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)", borderLeft: "3px solid var(--bt-danger-solid)" }}>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: "var(--bt-danger-solid)" }} />
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
// Compte à rebours à 3 paliers (aujourd'hui/passé → rouge, ≤ 7 j → ambre,
// au-delà → vert). Tokens et non hex en dur : les anciens #FEF2F2/#FEF3C7
// restaient des pastilles blanchâtres illisibles en mode sombre.
function ExamBadge({ days }) {
  const { t } = usePlan();
  const tone = days <= 0
    ? { backgroundColor: "var(--bt-danger-bg)", color: "var(--bt-danger)", border: "1px solid var(--bt-danger-border)" }
    : days <= 7
      ? { backgroundColor: "var(--bt-reward-bg)", color: "var(--bt-reward-text)", border: "1px solid var(--bt-reward-border)" }
      : { backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-text)", border: "1px solid var(--bt-accent-border)" };
  return (
    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums"
      style={tone}>
      {examCountdown(days, t)}
    </span>
  );
}

// ── RevisionChecklists ────────────────────────────────────────
// Avancement des révisions par cours. Rangées compactes : le cours, son
// compteur, sa barre. Les cadres individuels d'avant faisaient trois bordures
// empilées (carte + rangée + barre) pour une seule information.
function RevisionChecklists({ className = "" }) {
  const { courses, t } = usePlan();
  const { user } = useAuth();
  const [counts, setCounts]         = useState({}); // courseId -> { done, total }
  const [openCourse, setOpenCourse] = useState(null);

  const loadCounts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("course_checklist_items")
      .select("course_id, is_done")
      .eq("user_id", user.id);
    const map = {};
    (data || []).forEach(row => {
      if (!map[row.course_id]) map[row.course_id] = { done: 0, total: 0 };
      map[row.course_id].total += 1;
      if (row.is_done) map[row.course_id].done += 1;
    });
    setCounts(map);
  }, [user]);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  if (!courses.length) return null;

  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--bt-text-3)" }}>
        {t("checklist.sectionTitle")}
      </p>
      <ul className="space-y-2.5">
        {courses.map(c => {
          const cnt = counts[c.id] || { done: 0, total: 0 };
          const pct = cnt.total ? Math.round(cnt.done / cnt.total * 100) : 0;
          return (
            <li key={c.id}>
              <button onClick={() => setOpenCourse(c)}
                className="bt-plan-revision-row w-full rounded-xl px-2 py-1.5 text-left transition-colors">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: "var(--bt-text-1)" }}>{c.name}</span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums" style={{ color: cnt.total ? "var(--bt-text-2)" : "var(--bt-text-4)" }}>
                    {cnt.total === 0 ? t("checklist.none") : `${cnt.done}/${cnt.total}`}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--bt-subtle)" }}>
                  <div className="h-full origin-left rounded-full transition-transform duration-300 motion-reduce:transition-none"
                    style={{ transform: `scaleX(${pct / 100})`, backgroundColor: c.color }} />
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {openCourse && (
        <CourseChecklistModal
          course={openCourse}
          userId={user.id}
          onClose={() => setOpenCourse(null)}
          onChanged={loadCounts}
        />
      )}
    </section>
  );
}

// ── TodayCard ─────────────────────────────────────────────────
// Résumé permanent de la journée en cours — toujours visible, avant le
// calendrier, quelle que soit la date actuellement sélectionnée/naviguée.
// Surface ink (même langage que « Aujourd'hui » du Chrono) : c'est le
// moment de marque du planning.
// Intègre la bande "À préparer cette semaine" (strictement demain → J+6,
// jamais aujourd'hui : le haut de la carte couvre déjà le jour même).
function TodayCard({ className = "" }) {
  const { byDate, examsByDate, exams, objectives, toggle, courseColor, courseName, launchTimer, openDay, lang, t } = usePlan();
  const today = localToday();
  const todayObjectives = byDate[today] || [];
  const todayExams      = examsByDate[today] || [];
  const doneCount       = todayObjectives.filter(o => o.done).length;
  const isEmptyToday    = todayObjectives.length === 0 && todayExams.length === 0;

  const weekEnd = addDays(today, 6);
  const weekAhead = [
    ...exams
      .filter(e => e.exam_date > today && e.exam_date <= weekEnd)
      .map(e => ({ kind: "exam", id: `ex-${e.id}`, date: e.exam_date, name: e.name, courseId: e.course_id })),
    ...objectives
      .filter(o => !o.done && o.scheduled_date > today && o.scheduled_date <= weekEnd)
      .map(o => ({ kind: "obj", id: `ob-${o.id}`, date: o.scheduled_date, name: o.title || courseName(o.course_id) || "—", courseId: o.course_id })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const WEEK_AHEAD_MAX = 6;

  const nextExam = exams
    .filter(e => e.exam_date >= today)
    .sort((a, b) => a.exam_date.localeCompare(b.exam_date))[0];
  const nextExamDays = nextExam ? daysUntil(nextExam.exam_date) : null;

  // Premier objectif du jour encore à faire ET rattaché à un cours : c'est
  // celui que « Commencer à réviser » lance (le chrono a besoin d'un cours).
  const nextUp = todayObjectives.find(o => !o.done && o.course_id);

  const dateLabel = dateFromYmd(today).toLocaleDateString(localeFor(lang), { weekday: "long", day: "numeric", month: "long" });

  return (
    <section className={`card-ink bt-grain p-5 ${className}`}>
      <div className="relative z-10">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--bt-ink-muted)" }}>
            {t("plan.todayCardEyebrow")}
          </h2>
          <button onClick={() => openDay(today)}
            className="truncate text-xs underline-offset-2 transition-colors hover:underline"
            style={{ color: "var(--bt-ink-muted)" }}>
            {sentenceCase(dateLabel)}
          </button>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-num text-[2rem] font-extrabold leading-none tabular-nums tracking-[-0.03em]" style={{ color: "var(--bt-ink-text)" }}>
              <AnimatedNumber value={doneCount} />/<AnimatedNumber value={todayObjectives.length} />
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--bt-ink-muted)" }}>{t("plan.todayCardObjectives")}</p>
          </div>

          {todayExams.length > 0 ? (
            <div className="min-w-0 text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--bt-ink-muted)" }}>
                {t("plan.todayCardExamsToday")}
              </p>
              <p className="mt-1 truncate text-sm font-bold" style={{ color: "#FCA5A5" }}>
                {todayExams.map(e => sentenceCase(e.name)).join(" · ")}
              </p>
            </div>
          ) : nextExam ? (
            <div className="min-w-0 text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--bt-ink-muted)" }}>
                {t("plan.nextExam")}
              </p>
              <p className="mt-1 truncate text-sm font-bold" style={{ color: "var(--bt-ink-text)" }}>{sentenceCase(nextExam.name)}</p>
              <p className="text-xs tabular-nums" style={{ color: "#FCA5A5" }}>{examCountdown(nextExamDays, t)}</p>
            </div>
          ) : null}
        </div>

        {isEmptyToday ? (
          <div className="mt-4">
            <p className="text-sm font-semibold" style={{ color: "var(--bt-ink-text)" }}>{t("plan.nothingToday")}</p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--bt-ink-muted)" }}>{t("plan.nothingTodayHint")}</p>
            <button onClick={() => openDay(today)}
              className="bt-plan-ink-btn mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold">
              <IconPlus size={13} />
              {t("plan.dayAddObj")}
            </button>
          </div>
        ) : (
          <>
            {todayObjectives.length > 0 && (
              <ul className="mt-4 space-y-2">
                {todayObjectives.slice(0, 3).map(o => (
                  <li key={o.id} className="flex items-center gap-2.5 text-sm">
                    <input type="checkbox" checked={o.done} onChange={() => toggle(o)}
                      aria-label={o.title || courseName(o.course_id) || "—"}
                      className="bt-task-check bt-task-check--ink h-4 w-4 shrink-0" />
                    {o.course_id && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: courseColor(o.course_id) }} />}
                    {/* La barre de rature vit sur un inline-block : posée sur
                        le conteneur flex-1, elle s'étirait sur toute la
                        largeur libre et barrait aussi le vide après le texte. */}
                    <span className="min-w-0 flex-1" style={{ color: "var(--bt-ink-text)", opacity: o.done ? 0.5 : 1 }}>
                      <span className={`bt-strike ${o.done ? "is-done" : ""} inline-block max-w-full truncate align-bottom`}>
                        {o.title || courseName(o.course_id) || "—"}
                      </span>
                    </span>
                    {o.target_minutes > 0 && (
                      <span className="shrink-0 text-xs tabular-nums" style={{ color: "var(--bt-ink-muted)" }}>{o.target_minutes} min</span>
                    )}
                  </li>
                ))}
                {todayObjectives.length > 3 && (
                  <li>
                    <button onClick={() => openDay(today)} className="pl-6 text-xs underline-offset-2 hover:underline"
                      style={{ color: "var(--bt-ink-muted)" }}>
                      +{todayObjectives.length - 3} {t("plan.todayCardMore")}
                    </button>
                  </li>
                )}
              </ul>
            )}

            {/* Pont vers le Chrono : le cours ET la durée de l'objectif sont
                déjà posés à l'arrivée — plus besoin de les resaisir. */}
            {nextUp && (
              <button onClick={() => launchTimer(nextUp.course_id, nextUp.target_minutes, nextUp.title)}
                className="bt-plan-ink-btn mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold">
                <IconPlay size={12} />
                {t("plan.startStudying")}
              </button>
            )}
          </>
        )}

        {weekAhead.length > 0 && (
          <div className="mt-4 border-t pt-3.5" style={{ borderColor: "var(--bt-ink-border)" }}>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--bt-ink-muted)" }}>
              {t("plan.weekAheadTitle")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {weekAhead.slice(0, WEEK_AHEAD_MAX).map(item => {
                const days = daysUntil(item.date);
                const dayLabel = days === 1 ? t("plan.tomorrow")
                  : weekdaysShortFor(lang)[(dateFromYmd(item.date).getDay() + 6) % 7];
                const isExam = item.kind === "exam";
                return (
                  <button key={item.id} onClick={() => openDay(item.date)}
                    className="flex items-center gap-1.5 rounded-full py-1.5 pl-2.5 pr-2 text-xs transition-colors"
                    style={isExam
                      ? { backgroundColor: "rgba(252,165,165,0.12)", border: "1px solid rgba(252,165,165,0.30)" }
                      : { backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.13)" }}>
                    {item.courseId && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: courseColor(item.courseId) }} />
                    )}
                    <span className="max-w-[140px] truncate font-medium"
                      style={{ color: isExam ? "#FCA5A5" : "var(--bt-ink-text)" }}>
                      {isExam ? `${t("plan.examTag")} · ${item.name}` : item.name}
                    </span>
                    <span className="shrink-0 font-bold tabular-nums" style={{ color: isExam ? "#FCA5A5" : "var(--bt-ink-muted)" }}>
                      {isExam ? examCountdown(days, t) : dayLabel}
                    </span>
                  </button>
                );
              })}
              {weekAhead.length > WEEK_AHEAD_MAX && (
                <span className="flex items-center px-2 py-1.5 text-xs" style={{ color: "var(--bt-ink-muted)" }}>
                  +{weekAhead.length - WEEK_AHEAD_MAX}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── DayDetailModal ────────────────────────────────────────────
// Surface UNIQUE de gestion d'un jour : consulter, ajouter, modifier,
// reporter, supprimer objectifs et examens, lancer le chrono.
function DayDetailModal() {
  const { modalDate, setModalDate, modalPrefillTime, byDate, examsByDate, sessions,
          courseColor, courseName, toggle, remove, postpone, launchTimer,
          addObjectiveForDate, saveObjEdit, addExam, removeExam, saveExamEdit, duplicateDay, lang, t } = usePlan();

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm]         = useState(EMPTY_OBJECTIVE_FORM);
  const [showAddExamForm, setShowAddExamForm] = useState(false);
  const [examForm, setExamForm]               = useState(EMPTY_EXAM_FORM);
  const [dupOpen, setDupOpen]                 = useState(false);

  // Inline edit state
  const [editingObjId, setEditingObjId] = useState(null);
  const [editForm, setEditForm]         = useState({});
  const [postponingId, setPostponingId] = useState(null);
  const [editingExamId, setEditingExamId] = useState(null);
  const [examEditForm, setExamEditForm]   = useState(EMPTY_EXAM_FORM);

  // À chaque ouverture / changement de jour : repartir d'un état propre.
  // Si on arrive depuis un créneau horaire de la grille (modalPrefillTime),
  // ouvrir directement le formulaire d'ajout pré-rempli sur cette heure.
  useEffect(() => {
    if (!modalDate) return;
    setShowAddForm(!!modalPrefillTime);
    setAddForm({ ...EMPTY_OBJECTIVE_FORM, time: modalPrefillTime || "" });
    setShowAddExamForm(false);
    setExamForm(EMPTY_EXAM_FORM);
    setEditingObjId(null);
    setPostponingId(null);
    setEditingExamId(null);
    setDupOpen(false);
  }, [modalDate, modalPrefillTime]);

  // Échap ferme la fiche — un bottom sheet sans sortie clavier est une
  // impasse pour qui ne peut pas viser la croix.
  useEffect(() => {
    if (!modalDate) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setModalDate(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalDate, setModalDate]);

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
    await saveExamEdit(editingExamId, {
      name:      examEditForm.name.trim(),
      course_id: examEditForm.courseId || null,
      exam_time: examEditForm.time     || null,
      location:  examEditForm.location || null,
    });
    setEditingExamId(null);
  }

  if (!modalDate) return null;

  const d          = dateFromYmd(modalDate);
  const today      = localToday();
  const tomorrow   = tomorrowISO();
  const isPast     = modalDate < today;
  const isToday    = modalDate === today;
  const objectives = byDate[modalDate]     || [];
  const exams      = examsByDate[modalDate] || [];
  const doneCount  = objectives.filter(o => o.done).length;

  const totalStudiedSecs = sessions
    .filter(s => s.started_at.slice(0, 10) === modalDate)
    .reduce((a, s) => a + s.duration_seconds, 0);
  const totalTargetMin = objectives.reduce((a, o) => a + (o.target_minutes || 0), 0);
  const studiedPct = totalTargetMin > 0
    ? Math.min(100, Math.round(totalStudiedSecs / 60 / totalTargetMin * 100))
    : null;

  async function handleAdd(e) {
    e.preventDefault();
    const data = await addObjectiveForDate(modalDate, addForm);
    if (data) {
      setAddForm(EMPTY_OBJECTIVE_FORM);
      setShowAddForm(false);
    }
  }

  async function handleAddExam(e) {
    e.preventDefault();
    if (!examForm.name.trim()) return;
    await addExam({
      name:      examForm.name.trim(),
      course_id: examForm.courseId || null,
      exam_date: modalDate,
      exam_time: examForm.time     || null,
      location:  examForm.location || null,
    });
    setExamForm(EMPTY_EXAM_FORM);
    setShowAddExamForm(false);
  }

  const dayTitle = sentenceCase(d.toLocaleDateString(localeFor(lang), { weekday: "long", day: "numeric", month: "long" }));

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" style={{ backgroundColor: "rgba(0,0,0,0.42)", backdropFilter: "blur(3px)" }}
        onClick={() => setModalDate(null)} />

      {/* Card — bottom sheet on mobile, centered on sm+ */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4">
        <div role="dialog" aria-modal="true" aria-label={dayTitle}
          className="pointer-events-auto rounded-t-[28px] sm:w-full sm:max-w-lg sm:rounded-[24px]"
          style={{
            backgroundColor: "var(--bt-surface)",
            border: "1px solid var(--bt-border)",
            boxShadow: "0 -8px 48px rgba(0,0,0,0.18), 0 2px 16px rgba(0,0,0,0.08)",
            maxHeight: "88vh",
            overflowY: "auto",
          }}>

          {/* Drag handle (mobile only) */}
          <div className="flex justify-center pb-1 pt-3 sm:hidden">
            <div className="h-1 w-10 rounded-full" style={{ backgroundColor: "var(--bt-border)" }} />
          </div>

          <div className="px-5 pb-8 pt-2">

            {/* ── Header ── */}
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold leading-tight" style={{ color: "var(--bt-text-1)" }}>
                  {dayTitle}
                </h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {isToday && (
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                      style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-text)" }}>
                      {t("common.today")}
                    </span>
                  )}
                  {isPast && !isToday && (
                    <span className="text-[11px] font-medium" style={{ color: "var(--bt-text-4)" }}>
                      {t("plan.dayPast")}
                    </span>
                  )}
                  {objectives.length > 0 && (
                    <span className="text-xs tabular-nums" style={{ color: "var(--bt-text-3)" }}>
                      {doneCount} {t("plan.dayObjectiveOf")} {objectives.length} {t("plan.dayObjectives").toLowerCase()}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => setModalDate(null)} aria-label={t("common.close")}
                className="ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors"
                style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)", border: "1px solid var(--bt-border)" }}>
                <IconClose />
              </button>
            </div>

            {/* ── Temps étudié — toujours visible : c'est le lien vivant
                 entre le planning et le Chrono, y compris à 0. ── */}
            <div className="mb-4 flex items-center gap-3 rounded-2xl px-4 py-3"
              style={{ backgroundColor: "var(--bt-mint-surface)", border: "1px solid var(--bt-accent-border)" }}>
              <span style={{ color: "var(--bt-accent-text)" }}><IconClock size={18} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--bt-accent-text)" }}>
                  {t("plan.dayStudied")}
                </p>
                <p className="font-num text-base font-bold leading-tight tabular-nums" style={{ color: "var(--bt-accent-text)" }}>
                  {formatMinutesShort(totalStudiedSecs)}
                </p>
              </div>
              {totalTargetMin > 0 && (
                <div className="shrink-0 text-right">
                  <p className="text-xs tabular-nums" style={{ color: "var(--bt-accent-text)" }}>/ {totalTargetMin} min</p>
                  <p className="text-xs font-bold tabular-nums" style={{ color: "var(--bt-accent-text)" }}>{studiedPct}%</p>
                </div>
              )}
            </div>

            {/* ── Examens ── */}
            {exams.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--bt-text-3)" }}>
                  {t("plan.dayExams")}
                </p>
                <div className="space-y-2">
                  {exams.map(ex => {
                    if (editingExamId === ex.id) {
                      return (
                        <ExamForm key={ex.id}
                          value={examEditForm}
                          onChange={patch => setExamEditForm(f => ({ ...f, ...patch }))}
                          onSubmit={handleExamEditSave}
                          onCancel={() => setEditingExamId(null)}
                          submitLabel={t("common.save")}
                          title={t("plan.dayEdit")} />
                      );
                    }
                    return (
                      <div key={ex.id} className="flex items-center gap-3 rounded-2xl px-4 py-3"
                        style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)", borderLeft: "3px solid var(--bt-danger-solid)" }}>
                        {ex.course_id && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: courseColor(ex.course_id) }} />}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>{ex.name}</p>
                          {(ex.exam_time || ex.location) && (
                            <p className="mt-0.5 text-xs" style={{ color: "var(--bt-text-3)" }}>
                              {[ex.exam_time, ex.location].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                        <ExamBadge days={daysUntil(ex.exam_date)} />
                        <div className="flex shrink-0 items-center gap-0.5">
                          <button onClick={() => startExamEdit(ex)} title={t("plan.dayEdit")} aria-label={t("plan.dayEdit")}
                            className="bt-plan-icon-btn flex h-8 w-8 items-center justify-center rounded-lg">
                            <IconEdit />
                          </button>
                          <button onClick={() => removeExam(ex.id)} title={t("common.delete")} aria-label={t("common.delete")}
                            className="bt-plan-icon-btn bt-plan-icon-btn--danger flex h-8 w-8 items-center justify-center rounded-lg">
                            <IconTrash />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Objectifs ── */}
            <div className="mb-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--bt-text-3)" }}>
                {t("plan.dayPlans")}
              </p>
              {/* Sur un jour d'examen sans objectif, la section « Prévu »
                  restait un titre suivi de rien. Elle parle des objectifs :
                  son vide se mesure aux objectifs seuls, pas aux examens. */}
              {objectives.length === 0 && (
                <p className="py-3 text-sm" style={{ color: "var(--bt-text-3)" }}>
                  {t("plan.dayNothingPlanned")}
                </p>
              )}
              <div className="space-y-2">
                {objectives.map(o => {
                  const realSecs = o.course_id
                    ? sessions.filter(s => s.course_id === o.course_id && s.started_at.slice(0, 10) === o.scheduled_date)
                        .reduce((a, s) => a + s.duration_seconds, 0)
                    : 0;
                  const recurLabel  = recurrenceBadgeLabel(o, t, lang);
                  const statusLabel = o.done ? t("plan.dayDone") : isPast ? t("plan.dayOverdue") : t("plan.dayTodo");
                  const statusTone  = o.done
                    ? { backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-text)" }
                    : isPast
                      ? { backgroundColor: "var(--bt-danger-bg)", color: "var(--bt-danger)" }
                      : { backgroundColor: "var(--bt-surface)", color: "var(--bt-text-3)" };
                  const isEditing   = editingObjId === o.id;

                  return (
                    <div key={o.id} className="overflow-hidden rounded-2xl"
                      style={{ border: `1px solid ${isEditing ? "var(--bt-accent)" : "var(--bt-border)"}`, transition: "border-color 0.15s" }}>

                      {/* ── View mode ── */}
                      {!isEditing && (
                        <>
                        <div className="flex items-start gap-3 px-4 py-3" style={{ backgroundColor: "var(--bt-subtle)" }}>
                          <input type="checkbox" checked={o.done} onChange={() => toggle(o)}
                            aria-label={o.title || courseName(o.course_id) || "—"}
                            className="bt-task-check mt-0.5 h-4 w-4 shrink-0" />
                          <div className="min-w-0 flex-1">
                            {/* Le titre garde sa ligne entière. La pastille
                                d'état partageait cette ligne avec quatre
                                boutons d'action : à 375 px il ne restait
                                qu'une centaine de pixels et « Relire les
                                fiches » se lisait « Relire l… ». */}
                            <div className="flex items-center gap-2">
                              {o.course_id && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: courseColor(o.course_id) }} />}
                              <p className="min-w-0 flex-1 text-sm font-medium"
                                style={{ color: o.done ? "var(--bt-text-4)" : "var(--bt-text-1)" }}>
                                <span className={`bt-strike ${o.done ? "is-done" : ""} inline-block max-w-full truncate align-bottom`}>
                                  {o.title || courseName(o.course_id) || "—"}
                                </span>
                              </p>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={statusTone}>
                                {statusLabel}
                              </span>
                              {o.course_id && <span className="text-xs" style={{ color: "var(--bt-text-3)" }}>{courseName(o.course_id)}</span>}
                              {o.scheduled_time && <span className="text-xs font-medium tabular-nums" style={{ color: "var(--bt-text-3)" }}>· {o.scheduled_time}</span>}
                              {o.target_minutes > 0 && <span className="text-xs tabular-nums" style={{ color: "var(--bt-text-3)" }}>· {o.target_minutes} min</span>}
                              {recurLabel && <span className="text-xs font-semibold" style={{ color: "var(--bt-text-4)" }}>· ↻ {recurLabel}</span>}
                              {realSecs > 0 && <span className="text-xs font-semibold" style={{ color: "var(--bt-accent-text)" }}>· {formatMinutesShort(realSecs)} {t("plan.dayStudied").toLowerCase()}</span>}
                            </div>
                            {o.target_minutes > 0 && realSecs > 0 && (
                              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--bt-border)" }}>
                                <div className="h-full origin-left rounded-full transition-transform duration-300 motion-reduce:transition-none" style={{
                                  transform: `scaleX(${Math.min(100, Math.round(realSecs / 60 / o.target_minutes * 100)) / 100})`,
                                  backgroundColor: "var(--bt-accent)",
                                }} />
                              </div>
                            )}
                          </div>
                          {/* Actions */}
                          <div className="flex shrink-0 items-center gap-0.5">
                            {!o.done && isToday && o.course_id && (
                              <button onClick={() => launchTimer(o.course_id, o.target_minutes, o.title)}
                                className="bt-plan-icon-btn bt-plan-icon-btn--accent flex h-8 w-8 items-center justify-center rounded-lg"
                                title={t("plan.launchTimer")} aria-label={t("plan.launchTimer")}>
                                <IconPlay />
                              </button>
                            )}
                            {!o.done && (
                              <button onClick={() => setPostponingId(p => p === o.id ? null : o.id)}
                                className="bt-plan-icon-btn flex h-8 w-8 items-center justify-center rounded-lg"
                                style={postponingId === o.id ? { color: "var(--bt-warning)" } : undefined}
                                title={t("plan.postponeTooltip")} aria-label={t("plan.postponeTooltip")}
                                aria-expanded={postponingId === o.id}>
                                <svg width="12" height="12" viewBox="0 0 24 24" {...ic} aria-hidden="true">
                                  <rect x="3" y="4" width="18" height="18" rx="2"/>
                                  <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                                  <line x1="3" y1="10" x2="21" y2="10"/>
                                  <path d="M16 14l2 2 4-4"/>
                                </svg>
                              </button>
                            )}
                            <button onClick={() => startInlineEdit(o)}
                              className="bt-plan-icon-btn flex h-8 w-8 items-center justify-center rounded-lg"
                              title={t("plan.dayEdit")} aria-label={t("plan.dayEdit")}>
                              <IconEdit />
                            </button>
                            {/* Corbeille et non croix : dans une fiche qui se
                                ferme aussi par une croix, la même icône
                                voulait dire « fermer » ici et « supprimer
                                définitivement » là. */}
                            <button onClick={() => remove(o.id)}
                              className="bt-plan-icon-btn bt-plan-icon-btn--danger flex h-8 w-8 items-center justify-center rounded-lg"
                              title={t("common.delete")} aria-label={t("common.delete")}>
                              <IconTrash />
                            </button>
                          </div>
                        </div>

                        {/* Report : demain en un clic, ou une autre date */}
                        {postponingId === o.id && !o.done && (
                          <div className="flex items-center gap-2 px-4 pb-3" style={{ backgroundColor: "var(--bt-subtle)" }}>
                            <button onClick={() => { postpone(o.id, tomorrow); setPostponingId(null); }}
                              className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold"
                              style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)", color: "var(--bt-text-1)" }}>
                              {t("plan.dayPostpone")}
                            </button>
                            <input type="date" className="input flex-1 py-1.5 text-xs" min={tomorrow}
                              aria-label={t("plan.postponeOtherDate")}
                              onChange={e => {
                                if (e.target.value && e.target.value >= tomorrow) {
                                  postpone(o.id, e.target.value);
                                  setPostponingId(null);
                                }
                              }} />
                          </div>
                        )}
                        </>
                      )}

                      {/* ── Inline edit mode ── */}
                      {isEditing && (
                        <div className="px-4 py-3" style={{ backgroundColor: "var(--bt-surface)" }}>
                          <ObjectiveForm
                            value={editForm}
                            onChange={patch => setEditForm(f => ({ ...f, ...patch }))}
                            onSubmit={handleInlineSave}
                            onCancel={() => setEditingObjId(null)}
                            minDate={modalDate}
                            submitLabel={t("common.save")}
                            autoFocus />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Ajouter : deux actions compactes côte à côte. Les grands
                 rectangles pointillés d'avant mangeaient un tiers de la fiche
                 pour deux boutons. ── */}
            {!showAddForm && !showAddExamForm && (
              <div className="flex gap-2">
                {!isPast && (
                  <button onClick={() => setShowAddForm(true)}
                    className="btn-ghost flex min-h-11 flex-1 items-center justify-center gap-1.5 text-sm font-semibold">
                    <IconPlus size={13} />
                    {t("plan.addObjectiveShort")}
                  </button>
                )}
                <button onClick={() => setShowAddExamForm(true)}
                  className="btn-ghost flex min-h-11 flex-1 items-center justify-center gap-1.5 text-sm font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--bt-danger-solid)" }} />
                  {t("plan.addExamShort")}
                </button>
              </div>
            )}

            {showAddForm && !isPast && (
              <ObjectiveForm
                className="rounded-2xl p-4"
                style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}
                title={t("plan.newObjectiveTitle")}
                value={addForm}
                onChange={patch => setAddForm(f => ({ ...f, ...patch }))}
                onSubmit={handleAdd}
                onCancel={() => setShowAddForm(false)}
                minDate={modalDate}
                submitLabel={t("common.add")}
                autoFocus />
            )}

            {showAddExamForm && (
              <ExamForm
                value={examForm}
                onChange={patch => setExamForm(f => ({ ...f, ...patch }))}
                onSubmit={handleAddExam}
                onCancel={() => setShowAddExamForm(false)}
                submitLabel={t("plan.examSubmit")}
                title={t("plan.newExamTitle")}
                dateLabel={dayTitle} />
            )}

            {/* ── Dupliquer ce jour : recopie tous ses objectifs vers une autre
                 date (structure de révision réutilisable) ── */}
            {objectives.length > 0 && (
              <div className="mt-3">
                {!dupOpen ? (
                  <button onClick={() => setDupOpen(true)}
                    className="bt-plan-quiet-btn flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium">
                    <IconCopy size={12} />
                    {t("plan.duplicateDay")}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl p-2.5"
                    style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}>
                    <span className="shrink-0 text-xs" style={{ color: "var(--bt-text-3)" }}>{t("plan.duplicateDayTo")}</span>
                    <input type="date" className="input flex-1 py-1.5 text-xs" min={today}
                      aria-label={t("plan.duplicateDayTo")}
                      onChange={async e => {
                        if (e.target.value && e.target.value !== modalDate) {
                          await duplicateDay(modalDate, e.target.value);
                          setDupOpen(false);
                        }
                      }} />
                    <button type="button" onClick={() => setDupOpen(false)} className="btn-ghost px-2 py-1 text-xs">{t("common.cancel")}</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── CalendarLegend ────────────────────────────────────────────
function CalendarLegend() {
  const { courses, t } = usePlan();
  // Un objectif n'a pas de couleur à lui : il porte celle de son cours. Une
  // seule pastille grise l'annonçait donc à tort. On montre les vraies
  // couleurs de SES cours — la légende devient un mini-index lisible.
  const swatches = courses.slice(0, 3).map(c => c.color).filter(Boolean);
  const objectiveNode = swatches.length ? (
    <span className="flex items-center -space-x-1">
      {swatches.map((c, i) => (
        <span key={i} className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: c, boxShadow: "0 0 0 1.5px var(--bt-surface)", zIndex: swatches.length - i }} />
      ))}
    </span>
  ) : (
    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--bt-text-3)" }} />
  );

  const items = [
    { label: t("plan.legendObjective"), node: objectiveNode },
    { label: t("plan.legendExam"),      node: <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--bt-danger-solid)" }} /> },
    { label: t("common.today"),         node: <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "var(--bt-accent)" }} /> },
  ];
  return (
    <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 no-print">
      {items.map(i => (
        <li key={i.label} className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--bt-text-3)" }}>
          {i.node}{i.label}
        </li>
      ))}
    </ul>
  );
}

// ── MonthView ─────────────────────────────────────────────────
// Une case = au plus DEUX couches visuelles : son fond d'état (week-end ou
// sélection) et ses marqueurs. Avant, un même jour pouvait cumuler un lavis
// de couleur de cours, un voile rouge d'examen, une teinte week-end, un voile
// de passé et une diagonale : la couleur ne voulait plus rien dire.
function MonthView() {
  const { cursor, byDate, examsByDate, selectedDate, setSelectedDate, openDay, courseColor, courseName, lang, t } = usePlan();
  const grid  = buildMonthGrid(cursor.year, cursor.month);
  const today = localToday();
  const weeks = Array.from({ length: 6 }, (_, i) => grid.slice(i * 7, i * 7 + 7));

  return (
    <section className="card overflow-hidden">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b" style={{ borderColor: "var(--bt-border)" }}>
        {weekdaysShortFor(lang).map((d, i) => (
          <div key={d}
            className="py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: i >= 5 ? "var(--bt-text-3)" : "var(--bt-text-2)" }}>
            {d}
          </div>
        ))}
      </div>

      {/* Week rows */}
      <div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7"
            style={{ borderBottom: wi < 5 ? "1px solid var(--bt-border)" : "none" }}>
            {week.map((d, di) => {
              const key       = ymd(d);
              const inMonth   = d.getMonth() === cursor.month;
              const isToday   = key === today;
              const isSel     = key === selectedDate;
              const isPast    = key < today;
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              const items     = byDate[key]      || [];
              const examItems = examsByDate[key] || [];

              // Couleurs des cours réellement présents ce jour-là (une par
              // cours, pas une par objectif : trois objectifs du même cours
              // sont UNE information de couleur, pas trois).
              const dayCourseIds = [...new Set(items.filter(o => o.course_id).map(o => o.course_id))];
              const dayColors    = dayCourseIds.map(id => courseColor(id));
              const hasUncoursed = items.some(o => !o.course_id);
              const soloTint     = dayColors.length === 1 && !hasUncoursed ? rgbTriplet(dayColors[0]) : null;

              // UNE seule source de fond par case — jamais deux règles CSS qui
              // se disputent la même cellule. La sélection n'en fait PAS partie :
              // elle s'exprime par le contour vert, pas par un aplat. Sinon le
              // jour sélectionné — aujourd'hui par défaut — était le seul à ne
              // jamais montrer la couleur de son cours.
              const fill = soloTint ? "course"   // un seul cours → sa couleur, très diluée
                : items.length ? "multi"         // plusieurs cours (ou sans cours) → neutre, les pastilles disent lesquels
                : isWeekend ? "weekend"
                : null;

              const label = `${d.getDate()} — ${items.length} ${t("plan.legendObjective")}, ${examItems.length} ${t("plan.legendExam")}`;

              return (
                <button key={key} onClick={() => { if (inMonth) openDay(key); else setSelectedDate(key); }}
                  aria-label={label} aria-current={isToday ? "date" : undefined}
                  data-fill={fill || undefined} data-selected={isSel ? "1" : undefined}
                  className="bt-plan-day-cell relative min-h-[84px] p-1.5 text-left sm:p-2"
                  style={{
                    "--bt-day-tint": soloTint || undefined,
                    borderRight: di < 6 ? "1px solid var(--bt-border)" : "none",
                    opacity: inMonth ? (isPast && !isToday ? 0.62 : 1) : 0.3,
                  }}>
                  {/* Day number */}
                  <span className="mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full font-num text-xs font-bold tabular-nums"
                    style={isToday
                      ? { backgroundColor: "var(--bt-accent)", color: "#fff" }
                      : { color: isWeekend ? "var(--bt-text-3)" : "var(--bt-text-1)" }}>
                    {d.getDate()}
                  </span>

                  {/* Marqueurs — mobile : pastilles (aucun texte ne rentre).
                      Une pastille par COURS, pas par objectif : le fond dit
                      « il y a quelque chose », les pastilles disent « de quels
                      cours ». Répéter la même couleur n'ajoutait rien. */}
                  <div className="flex flex-wrap gap-1 sm:hidden">
                    {examItems.slice(0, 2).map(e => (
                      <span key={e.id} className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: "var(--bt-danger-solid)" }} />
                    ))}
                    {dayColors.slice(0, 4).map((c, i) => (
                      <span key={i} className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: c }} />
                    ))}
                    {hasUncoursed && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: "var(--bt-text-3)" }} />
                    )}
                    {dayColors.length > 4 && (
                      <span className="text-[9px] leading-none tabular-nums" style={{ color: "var(--bt-text-4)" }}>
                        +{dayColors.length - 4}
                      </span>
                    )}
                  </div>

                  {/* Marqueurs — sm+ : titres. L'examen passe en premier. */}
                  <div className="hidden space-y-0.5 sm:block">
                    {examItems.slice(0, 1).map(e => (
                      <div key={e.id} className="flex items-center gap-1 truncate" title={e.name}>
                        <span className="h-1.5 w-1.5 flex-none shrink-0 rounded-full" style={{ backgroundColor: "var(--bt-danger-solid)" }} />
                        <span className="truncate text-[10px] font-semibold leading-tight" style={{ color: "var(--bt-danger)" }}>{e.name}</span>
                      </div>
                    ))}
                    {items.slice(0, 2).map(o => (
                      <div key={o.id} className="flex items-center gap-1 truncate" title={o.title || courseName(o.course_id) || ""}>
                        <span className="h-1.5 w-1.5 flex-none shrink-0 rounded-full"
                          style={{ backgroundColor: courseColor(o.course_id), opacity: o.done ? 0.3 : 1 }} />
                        <span className="truncate text-[10px] leading-tight"
                          style={{ color: o.done ? "var(--bt-text-4)" : "var(--bt-text-2)",
                            textDecoration: o.done ? "line-through" : "none" }}>
                          {o.title || courseName(o.course_id) || "—"}
                        </span>
                      </div>
                    ))}
                    {(items.length + examItems.length) > 3 && (
                      <span className="text-[10px] tabular-nums" style={{ color: "var(--bt-text-4)" }}>
                        +{items.length + examItems.length - 3}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── TimeGrid ──────────────────────────────────────────────────
// Semaine et jour partagent la même grille horaire. Sur téléphone, sept
// colonnes dans 390 px donnaient ~45 px par jour : illisible dès qu'un
// objectif porte un titre. La grille garde donc une largeur mini par colonne
// et défile horizontalement quand l'écran est trop étroit.
function TimeGrid({ days }) {
  const { byDate, examsByDate, selectedDate, courseColor, courseName, openDay, t, lang } = usePlan();
  const today = localToday();
  const multi = days.length > 1;
  const gridMinWidth = multi ? TIMEGRID_GUTTER + days.length * TIMEGRID_MIN_COL : 0;
  const columns = `${TIMEGRID_GUTTER}px repeat(${days.length}, minmax(0, 1fr))`;

  // Clic sur un créneau : ouvre la fiche du jour, formulaire d'ajout
  // pré-rempli sur l'heure cliquée (une seule surface d'ajout : le modal).
  function handleSlotClick(key, h) {
    openDay(key, h !== null ? String(h).padStart(2, "0") + ":00" : null);
  }

  return (
    <>
      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <div style={{ minWidth: gridMinWidth || undefined }}>

            {/* En-tête jours */}
            <div className="grid" style={{ gridTemplateColumns: columns, borderBottom: "1px solid var(--bt-border)" }}>
              <div style={{ borderRight: "1px solid var(--bt-border)" }} />
              {days.map(d => {
                const key     = ymd(d);
                const isToday = key === today;
                const isSel   = key === selectedDate;
                return (
                  <button key={key} onClick={() => openDay(key)}
                    className="bt-plan-day-head py-2 text-center transition-colors"
                    aria-current={isToday ? "date" : undefined}
                    style={{ borderRight: "1px solid var(--bt-border)", backgroundColor: isSel ? "var(--bt-mint-strong)" : "transparent" }}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--bt-text-3)" }}>
                      {weekdaysShortFor(lang)[(d.getDay() + 6) % 7]}
                    </p>
                    <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full font-num text-sm font-bold tabular-nums"
                      style={isToday ? { backgroundColor: "var(--bt-accent)", color: "#fff" } : { color: "var(--bt-text-1)" }}>
                      {d.getDate()}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Ligne "toute la journée" (objectifs sans heure + examens) */}
            <div className="grid min-h-[38px]"
              style={{ gridTemplateColumns: columns, backgroundColor: "var(--bt-subtle)", borderBottom: "1px solid var(--bt-border)" }}>
              <div className="flex items-center justify-center px-1" style={{ borderRight: "1px solid var(--bt-border)" }}>
                <span className="text-[10px] font-medium" style={{ color: "var(--bt-text-3)" }}>{t("plan.allDayShort")}</span>
              </div>
              {days.map(d => {
                const key       = ymd(d);
                const items     = (byDate[key] || []).filter(o => !o.scheduled_time);
                const examItems = examsByDate[key] || [];
                return (
                  <div key={key} className="bt-plan-slot cursor-pointer space-y-0.5 p-1"
                    style={{ borderRight: "1px solid var(--bt-border)" }}
                    onClick={() => handleSlotClick(key, null)}>
                    {examItems.map(e => (
                      <div key={e.id} className="truncate rounded-md px-1.5 py-0.5 text-[11px] font-bold"
                        style={{ backgroundColor: "var(--bt-danger-solid)", color: "#fff" }}
                        title={e.name}
                        onClick={ev => { ev.stopPropagation(); openDay(key); }}>
                        {e.name}
                      </div>
                    ))}
                    {items.map(o => (
                      <div key={o.id} className="truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium text-white"
                        style={{ backgroundColor: courseColor(o.course_id), opacity: o.done ? 0.45 : 1 }}
                        title={o.title || courseName(o.course_id) || ""}
                        onClick={e => { e.stopPropagation(); openDay(key); }}>
                        {o.title || courseName(o.course_id) || "—"}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Grille horaire */}
            <div className="overflow-y-auto" style={{ maxHeight: 520 }}>
              {HOURS.map(h => (
                <div key={h} className="grid"
                  style={{ gridTemplateColumns: columns, minHeight: 64, borderBottom: "1px solid var(--bt-border)" }}>
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
                          <div key={o.id}
                            className="mb-0.5 cursor-pointer truncate rounded-md px-1.5 py-1 text-[11px] font-medium text-white hover:brightness-90"
                            style={{ backgroundColor: courseColor(o.course_id), opacity: o.done ? 0.45 : 1 }}
                            title={o.title || courseName(o.course_id) || ""}
                            onClick={e => { e.stopPropagation(); openDay(key); }}>
                            <span className="block truncate">{o.title || courseName(o.course_id) || "—"}</span>
                            {o.target_minutes > 0 && (
                              <span className="font-num text-[10px] tabular-nums opacity-80">{o.target_minutes} min</span>
                            )}
                          </div>
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
        <p className="mt-2 px-1 text-[11px] no-print xl:hidden" style={{ color: "var(--bt-text-4)" }}>
          {t("plan.weekScrollHint")}
        </p>
      )}
    </>
  );
}

// ── QuickAddBar ───────────────────────────────────────────────
// Barre d'ajout rapide en langage naturel : « Bio 2h demain 14h » → objectif.
// C'est la voie la plus rapide pour remplir un planning, mais rien ne le
// disait : un champ nu, sans titre, ressemblait à une recherche. Aperçu live
// de ce qui sera créé (le parsing est faillible → l'utilisateur voit et
// corrige avant de valider). 100 % client (lib/planningQuickAdd).
function QuickAddChip({ children, accent }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={accent
        ? { backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-text)", border: "1px solid var(--bt-accent-border)" }
        : { backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)", border: "1px solid var(--bt-border)" }}>
      {children}
    </span>
  );
}
function QuickAddBar({ className = "" }) {
  const { courses, addObjectiveForDate, courseName, lang, t } = usePlan();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
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

  return (
    <form onSubmit={submit} className={`card p-4 no-print ${className}`}>
      <div className="mb-2.5 flex items-center gap-1.5">
        <span style={{ color: "var(--bt-accent)" }}><IconSparkle /></span>
        <h2 className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t("plan.quickAddTitle")}</h2>
        <span className="ml-auto hidden truncate text-[11px] sm:block" style={{ color: "var(--bt-text-4)" }}>
          {t("plan.quickAddHint")}
        </span>
      </div>

      {/* Empilé sur téléphone : côte à côte, le champ tombait sous ~200 px et
          l'exemple du placeholder était coupé en plein milieu — or c'est lui
          qui apprend la syntaxe. Le 16 px reste obligatoire (en dessous, iOS
          zoome sur le champ au focus). */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input value={text} onChange={e => setText(e.target.value)}
          placeholder={t("plan.quickAddPlaceholder")} aria-label={t("plan.quickAddTitle")}
          className="input min-w-0 flex-1 text-base sm:text-sm" />
        <button type="submit" disabled={!canAdd || busy}
          className={`${canAdd && !busy ? "btn-primary" : "btn-ghost"} min-h-11 w-full shrink-0 px-4 text-sm font-semibold sm:w-auto`}
          style={!canAdd || busy ? { opacity: 0.6, cursor: "default" } : undefined}>
          {t("common.add")}
        </button>
      </div>

      {trimmed && parsed && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="shrink-0 text-[10px] uppercase tracking-wider" style={{ color: "var(--bt-text-4)" }}>{t("plan.quickAddPreview")}</span>
          {parsed.courseId
            ? <QuickAddChip accent>{courseName(parsed.courseId)}</QuickAddChip>
            : parsed.title
              ? <QuickAddChip accent>{parsed.title}</QuickAddChip>
              : <span className="text-xs" style={{ color: "var(--bt-text-4)" }}>{t("plan.quickAddNothing")}</span>}
          {parsed.courseId && parsed.title && <QuickAddChip>{parsed.title}</QuickAddChip>}
          {(parsed.courseId || parsed.title) && <QuickAddChip>{quickDateLabel(parsed.dateISO, lang, t)}</QuickAddChip>}
          {parsed.minutes > 0 && <QuickAddChip>{parsed.minutes} min</QuickAddChip>}
          {parsed.time && <QuickAddChip>{parsed.time}</QuickAddChip>}
        </div>
      )}
    </form>
  );
}

// ── PlanToolbar ───────────────────────────────────────────────
// Le mois d'abord, la navigation ensuite, les vues en dessous. Avant, six
// boutons de même poids se disputaient une seule rangée qui repassait à la
// ligne dès 390 px, et le mois — la seule info à lire — s'y perdait.
function PlanToolbar({ periodLabel, onPrev, onNext, onToday, showToday, view, onViewChange, actions, actionsBadge, className = "" }) {
  const { t } = usePlan();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <h1 className="font-display min-w-0 flex-1 truncate text-xl font-bold sm:text-2xl"
          style={{ color: "var(--bt-text-1)", letterSpacing: "-0.02em" }}>
          {sentenceCase(periodLabel)}
        </h1>

        <div className="flex shrink-0 items-center gap-1 no-print">
          <button onClick={onPrev} aria-label={t("plan.prevPeriod")}
            className="bt-plan-nav-btn flex h-9 w-9 items-center justify-center rounded-xl">
            <IconChevron dir="left" />
          </button>
          <button onClick={onNext} aria-label={t("plan.nextPeriod")}
            className="bt-plan-nav-btn flex h-9 w-9 items-center justify-center rounded-xl">
            <IconChevron dir="right" />
          </button>
          {showToday && (
            <button onClick={onToday} className="btn-ghost ml-1 px-3 py-1.5 text-xs font-semibold">
              {t("common.today")}
            </button>
          )}

          <div className="relative ml-1">
            <button onClick={() => setMenuOpen(v => !v)}
              aria-label={t("plan.planningActions")} aria-expanded={menuOpen} aria-haspopup="menu"
              className="bt-plan-nav-btn relative flex h-9 w-9 items-center justify-center rounded-xl">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>
              </svg>
              {actionsBadge && (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: "var(--bt-accent)" }} />
              )}
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
                <div role="menu" className="absolute right-0 top-full z-30 mt-1.5 min-w-[230px] overflow-hidden rounded-2xl"
                  style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)", boxShadow: "0 12px 32px var(--bt-shadow)" }}>
                  <div className="flex flex-col gap-0.5 p-1.5" onClick={() => setMenuOpen(false)}>
                    {actions}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 no-print">
        <SegmentedGlide
          className="w-full sm:w-auto sm:inline-flex"
          buttonClassName="flex-1 sm:flex-none px-4 py-2 text-xs"
          options={[
            { value: "day", label: t("plan.day") },
            { value: "week", label: t("plan.week") },
            { value: "month", label: t("plan.month") },
          ]}
          value={view}
          onChange={onViewChange}
        />
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
  const [exams, setExams]           = useState([]);
  const [sessions, setSessions]     = useState([]);
  const [frozenDays, setFrozenDays] = useState([]); // gel de série (v29)
  const [cursor, setCursor]         = useState(() => {
    const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState(localToday());
  const [modalDate, setModalDate] = useState(null);
  const [modalPrefillTime, setModalPrefillTime] = useState(null); // heure pré-remplie quand on ouvre depuis un créneau de la grille
  const [togglingShare, setTogglingShare] = useState(false); // pilote l'UI (disabled/opacité)
  const togglingShareRef = useRef(false); // verrou synchrone anti double-clic (cf. togglePlanningPublic)

  // Vue par défaut adaptée au support : sur un téléphone la grille MOIS ne
  // montre que des points anonymes (aucun texte ne rentre dans une case de
  // ~50 px), alors que la vue JOUR répond à « qu'est-ce que je révise là ».
  // Le desktop garde le mois, qui y est lisible. Un choix explicite gagne
  // toujours : on le mémorise et on ne le réécrase jamais.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("bt_plan_view");
      if (saved && ["day", "week", "month"].includes(saved)) { setView(saved); return; }
      if (window.matchMedia("(max-width: 1023px)").matches) setView("day");
    } catch {}
  }, []);

  const changeView = useCallback((v) => {
    setView(v);
    try { localStorage.setItem("bt_plan_view", v); } catch {}
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    const ninetyAgo = new Date(Date.now() - 90 * 864e5).toISOString();
    const [{ data: c }, { data: o }, examRes, { data: s }] = await Promise.all([
      supabase.from("courses").select("*").eq("user_id", user.id).order("created_at"),
      supabase.from("objectives").select("*").eq("user_id", user.id).order("scheduled_date"),
      supabase.from("exams").select("*").eq("user_id", user.id).order("exam_date"),
      supabase.from("sessions")
        .select("user_id,course_id,duration_seconds,started_at")
        .eq("user_id", user.id)
        .gte("started_at", ninetyAgo),
    ]);
    setCourses(c || []);
    setObjectives(o || []);
    setExams(examRes.data || []);
    setSessions(s || []);
    // Gel de série : mêmes jours gelés que le dashboard (mémoïsé par jour).
    const freeze = await runStreakFreezeUpkeep(supabase, user.id, s || []);
    if (freeze.supported) setFrozenDays(freeze.frozenDays);
  }, [user]);

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
    setSelectedDate(date);
    setModalPrefillTime(prefillTime);
    setModalDate(date);
  }

  async function toggle(o) {
    const { data } = await supabase.from("objectives").update({ done: !o.done }).eq("id", o.id).select().single();
    if (data) {
      setObjectives(p => p.map(x => x.id === o.id ? data : x));
      notifyXPChanged();
      if (!o.done) {
        playSensoryCue("task");
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
    const { data } = await supabase.from("exams")
      .insert({ user_id: user.id, ...examData }).select().single();
    if (data) {
      setExams(p => [...p, data]);
      notifyXPChanged();
      toast(t("toast.examAdded"));
    }
  }

  async function removeExam(id) {
    await supabase.from("exams").delete().eq("id", id);
    setExams(p => p.filter(x => x.id !== id));
  }

  async function saveExamEdit(id, examData) {
    const { data } = await supabase.from("exams")
      .update(examData).eq("id", id).select().single();
    if (data) setExams(p => p.map(x => x.id === id ? data : x));
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

  const courseColor = id => courses.find(c => c.id === id)?.color || "#94a3b8";
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
  const nextExam = exams
    .filter(e => e.exam_date >= today)
    .sort((a, b) => a.exam_date.localeCompare(b.exam_date))[0] || null;
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
  const planningCoachKind = missingExamPreparation
    ? "exam"
    : (todayObjectives.length >= 5 || todayMinutes >= 240)
      ? "heavy"
      : (objectives.length === 0 && exams.length === 0)
        ? "empty"
        : (todayObjectives.length === 0 && todayExams.length === 0)
          ? "todayEmpty"
          : "ready";
  const planningCoachMessage = planningCoachKind === "exam"
    ? t("coach.planning.exam").replace("{days}", String(nextExamDays))
    : t(`coach.planning.${planningCoachKind}`);
  const planningCoachId = planningCoachKind === "exam"
    ? `planning-exam-${nextExam.id}`
    : `planning-${planningCoachKind}`;

  function shiftDays(n) { const d = dateFromYmd(selectedDate); d.setDate(d.getDate() + n); setSelectedDate(ymd(d)); }
  function shiftMonth(delta) { setCursor(c => { const d = new Date(c.year, c.month + delta, 1); return { year: d.getFullYear(), month: d.getMonth() }; }); }
  function goToday() { const now = localToday(); setSelectedDate(now); const d = new Date(); setCursor({ year: d.getFullYear(), month: d.getMonth() }); }
  function handlePrev() { if (view==="day") shiftDays(-1); else if (view==="week") shiftDays(-7); else shiftMonth(-1); }
  function handleNext() { if (view==="day") shiftDays(1);  else if (view==="week") shiftDays(7);  else shiftMonth(1); }

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

  // Actions globales du planning — toutes dans le menu « … », quelle que soit
  // la largeur. Elles étaient inline sur desktop et encombraient la barre sans
  // qu'aucune ne mérite d'être toujours visible.
  const secondaryActions = (
    <>
      <button onClick={togglePlanningPublic} disabled={togglingShare}
        role="switch" aria-checked={!!profile?.planning_public}
        className="bt-plan-menu-item flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm"
        style={{ opacity: togglingShare ? 0.6 : 1, cursor: togglingShare ? "wait" : "pointer" }}>
        <svg width="15" height="15" viewBox="0 0 24 24" {...ic} strokeWidth="1.8" className="shrink-0" aria-hidden="true">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
        </svg>
        <span className="min-w-0 flex-1 truncate">{t("plan.public")}</span>
        <span className="shrink-0 text-[11px] font-bold"
          style={{ color: profile?.planning_public ? "var(--bt-accent-text)" : "var(--bt-text-4)" }}>
          {profile?.planning_public ? t("plan.shareShared") : t("plan.sharePrivate")}
        </span>
      </button>
      <button onClick={duplicateWeek} title={t("plan.duplicateWeekHint")}
        className="bt-plan-menu-item flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm">
        <span className="shrink-0"><IconCopy /></span>
        <span className="min-w-0 flex-1 truncate">{t("plan.duplicateWeek")}</span>
      </button>
      <button onClick={exportCalendar} title={t("plan.exportCalendarHint")}
        className="bt-plan-menu-item flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm">
        <span className="shrink-0"><IconCalendar /></span>
        <span className="min-w-0 flex-1 truncate">{t("plan.exportCalendar")}</span>
      </button>
    </>
  );

  const ctxValue = {
    view, courses, objectives, byDate, examsByDate, cursor, selectedDate, setSelectedDate,
    toggle, remove, courseColor, courseName, exams, sessions, postpone, addExam, removeExam, saveExamEdit,
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
        <div className="flex flex-col gap-5 xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start xl:gap-5">
          <div className="contents xl:flex xl:flex-col xl:gap-5">
            <PlanToolbar
              className="order-1"
              periodLabel={periodLabel()}
              onPrev={handlePrev} onNext={handleNext} onToday={goToday} showToday={!isOnToday}
              view={view} onViewChange={changeView}
              actions={secondaryActions} actionsBadge={!!profile?.planning_public} />

            <QuickAddBar className="order-2" />

            {/* Keyed on the view so switching mois/semaine/jour plays a soft fade.
                Calendrier pleine largeur : le détail d'un jour vit dans le modal. */}
            <div key={view} className="bt-tab-fade order-5 min-w-0">
              {view === "month" && <MonthView />}
              {view === "week"  && <TimeGrid days={getWeekDays(selectedDate)} />}
              {view === "day"   && <TimeGrid days={[dateFromYmd(selectedDate)]} />}
              <CalendarLegend />
            </div>
          </div>

          <div className="contents xl:flex xl:flex-col xl:gap-5">
            <TodayCard className="order-3" />

            <MascotCoach
              id={planningCoachId}
              message={planningCoachMessage}
              streak={computeStreak(sessions, frozenDays)}
              persistence="day"
              className="order-4"
            />

            <RevisionChecklists className="order-6" />
          </div>
        </div>
      </Layout>

      {/* Day detail modal — mounted outside Layout to avoid stacking context issues */}
      <DayDetailModal />
    </Ctx.Provider>
  );
}
