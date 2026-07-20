import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import CourseChecklistModal from "../components/CourseChecklistModal";
import MascotCoach from "../components/MascotCoach";
import SegmentedGlide from "../components/SegmentedGlide";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { useToast } from "../contexts/ToastContext";
import { useTimer } from "../contexts/TimerContext";
import { supabase } from "../lib/supabaseClient";
import { formatMinutesShort, computeStreak } from "../lib/format";
import { runStreakFreezeUpkeep } from "../lib/streakFreezes";
import { buildIcs, downloadIcs, countExportable } from "../lib/ics";
import { parseQuickObjective } from "../lib/planningQuickAdd";
import { notifyXPChanged } from "../lib/xpEvents";

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
function getDayCellStyle(items, courseColor) {
  const ids    = [...new Set(items.filter(o => o.course_id).map(o => o.course_id))];
  const colors = ids.map(id => courseColor(id));
  if (!colors.length) return {};
  if (colors.length === 1) return { backgroundColor: colors[0] + "45" };
  if (colors.length === 2)
    return { background: `linear-gradient(135deg, ${colors[0]}55 50%, ${colors[1]}55 50%)` };
  const pct   = 100 / colors.length;
  const stops = colors.flatMap((c, i) => [`${c}55 ${i*pct}%`, `${c}55 ${(i+1)*pct}%`]);
  return { background: `linear-gradient(to right, ${stops.join(",")})` };
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
              className="w-8 h-8 rounded-full text-[11px] font-bold transition-all shrink-0"
              style={active
                ? { backgroundColor: "#14B885", color: "#fff" }
                : { backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-3)", border: "1px solid var(--bt-border)" }}>
              {wd[(dow + 6) % 7].slice(0, 1)}
            </button>
          );
        })}
      </div>
      {weekdays.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs shrink-0" style={{ color: "var(--bt-text-3)" }}>{t("plan.recurrenceUntil")}</span>
          <input type="date" className="input text-xs py-1 flex-1" min={minDate}
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
function ObjectiveForm({ value, onChange, onSubmit, onCancel, minDate, submitLabel, autoFocus, className = "space-y-2.5", style }) {
  const { courses, t } = usePlan();
  const weekdays = value.weekdays || [];
  return (
    <form onSubmit={onSubmit} className={className} style={style}>
      <input className="input text-sm" value={value.title} autoFocus={autoFocus}
        onChange={e => onChange({ title: e.target.value })}
        placeholder={t("plan.newObjective")} />
      <div className="flex gap-2">
        <select className="input text-sm flex-1" value={value.courseId}
          onChange={e => onChange({ courseId: e.target.value })}>
          <option value="">{t("plan.courseSelect")}</option>
          {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className="input text-sm w-20" type="number" min={5} step={5} placeholder="min"
          value={value.minutes} onChange={e => onChange({ minutes: e.target.value })} />
      </div>
      <input className="input text-sm" type="time" value={value.time}
        onChange={e => onChange({ time: e.target.value })} />
      <RecurrencePicker
        weekdays={weekdays}
        onToggle={dow => onChange({ weekdays: weekdays.includes(dow) ? weekdays.filter(d => d !== dow) : [...weekdays, dow] })}
        until={value.until || ""}
        onUntilChange={v => onChange({ until: v })}
        minDate={minDate} />
      <div className="flex gap-2">
        <button type="submit" className="btn-primary flex-1 text-sm py-2">{submitLabel}</button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-ghost flex-1 text-sm py-2">{t("common.cancel")}</button>
        )}
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
// Badge J-X à 3 paliers de couleur (même palette que le badge examen du
// Chrono/dashboard.js, pour rester cohérent visuellement entre les pages) :
// rouge <= 0 j (aujourd'hui/passé), orange <= 7 j (urgent), vert au-delà.
function ExamBadge({ days }) {
  const { t } = usePlan();
  const bg    = days <= 0 ? "#FEF2F2" : days <= 7 ? "#FEF3C7" : "#EAFBF4";
  const color = days <= 0 ? "#DC2626" : days <= 7 ? "#D97706" : "#0E8F68";
  const label = days === 0 ? t("exam.today")
    : days === 1 ? t("plan.tomorrow")
    : days > 1  ? `J-${days}`
    : t("exam.passed");
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 whitespace-nowrap"
      style={{ backgroundColor: bg, color }}>
      {label}
    </span>
  );
}

// ── RevisionChecklists ────────────────────────────────────────
function RevisionChecklists() {
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
    <div className="card p-5 mt-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider mb-3"
        style={{ color: "var(--bt-text-4)" }}>
        {t("checklist.sectionTitle")}
      </p>
      <ul className="space-y-2">
        {courses.map(c => {
          const cnt = counts[c.id] || { done: 0, total: 0 };
          const pct = cnt.total ? Math.round(cnt.done / cnt.total * 100) : 0;
          return (
            <li key={c.id}>
              <button onClick={() => setOpenCourse(c)}
                className="w-full text-left rounded-2xl px-3.5 py-3 transition-colors flex items-center gap-3"
                style={{ border: "1px solid var(--bt-border)", backgroundColor: "var(--bt-surface)" }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bt-subtle)"}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = "var(--bt-surface)"}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-sm font-medium truncate" style={{ color: "var(--bt-text-1)" }}>{c.name}</span>
                    <span className="text-xs shrink-0" style={{ color: "var(--bt-text-3)" }}>
                      {cnt.total === 0
                        ? t("checklist.none")
                        : `${cnt.done}/${cnt.total} ${t("checklist.tasks")} · ${pct}%`}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bt-subtle)" }}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: c.color }} />
                  </div>
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
    </div>
  );
}

// ── TodayCard ─────────────────────────────────────────────────
// Résumé permanent de la journée en cours — toujours visible, avant le
// calendrier, quelle que soit la date actuellement sélectionnée/naviguée.
// Surface ink (même langage que le hero chrono du dashboard et la carte
// percentile des stats) : c'est le "moment de marque" du planning.
// Intègre la bande "À préparer cette semaine" (strictement demain → J+6,
// jamais aujourd'hui : le haut de la carte couvre déjà le jour même —
// l'ancienne carte séparée répétait les objectifs du jour deux fois).
function TodayCard() {
  const { byDate, examsByDate, exams, objectives, toggle, courseColor, courseName, launchTimer, openDay, lang, t } = usePlan();
  const today = localToday();
  const todayObjectives = byDate[today] || [];
  const todayExams      = examsByDate[today] || [];
  const doneCount       = todayObjectives.filter(o => o.done).length;

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

  const locale = lang === "en" ? "en-GB" : "fr-FR";
  const dateLabel = dateFromYmd(today).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="card-ink px-5 py-4 mb-5 cursor-pointer" onClick={() => openDay(today)}>
      <div className="flex items-center justify-between mb-3.5">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--bt-ink-muted)" }}>
          {t("plan.todayCardEyebrow")}
        </p>
        <span className="text-xs capitalize" style={{ color: "var(--bt-ink-muted)" }}>{dateLabel}</span>
      </div>

      <div className="flex items-center gap-6 flex-wrap mb-3.5">
        <div>
          <p className="font-num font-bold tabular-nums leading-none" style={{ fontSize: "1.9rem", color: "var(--bt-ink-text)", letterSpacing: "-0.02em" }}>
            {doneCount}/{todayObjectives.length}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--bt-ink-muted)" }}>{t("plan.todayCardObjectives")}</p>
        </div>
        {todayExams.length > 0 ? (
          <div>
            <p className="font-num font-bold tabular-nums leading-none" style={{ fontSize: "1.9rem", color: "#FCA5A5", letterSpacing: "-0.02em" }}>
              {todayExams.length}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--bt-ink-muted)" }}>{t("plan.todayCardExamsToday")}</p>
          </div>
        ) : nextExam ? (
          <div className="min-w-0">
            <p className="font-num font-bold tabular-nums leading-none" style={{ fontSize: "1.9rem", color: "var(--bt-ink-text)", letterSpacing: "-0.02em" }}>
              J-{nextExamDays}
            </p>
            <p className="text-xs mt-1 truncate max-w-[160px]" style={{ color: "var(--bt-ink-muted)" }}>{nextExam.name}</p>
          </div>
        ) : null}
      </div>

      {todayObjectives.length > 0 ? (
        <div className="space-y-1.5" onClick={e => e.stopPropagation()}>
          {todayObjectives.slice(0, 3).map(o => (
            <div key={o.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={o.done} onChange={() => toggle(o)}
                className="bt-task-check bt-task-check--ink w-3.5 h-3.5 shrink-0" />
              {o.course_id && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: courseColor(o.course_id) }} />}
              <span className={`bt-strike ${o.done ? "is-done" : ""} flex-1 min-w-0 truncate`} style={{ color: "var(--bt-ink-text)", opacity: o.done ? 0.5 : 1 }}>
                {o.title || courseName(o.course_id) || "—"}
              </span>
              {!o.done && o.course_id && (
                <button onClick={() => launchTimer(o.course_id)} title={t("plan.launchTimer")}
                  className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors"
                  style={{ color: "var(--bt-ink-muted)" }}
                  onMouseEnter={e => { e.currentTarget.style.color = "var(--bt-ink-text)"; e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.10)"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "var(--bt-ink-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </button>
              )}
            </div>
          ))}
          {todayObjectives.length > 3 && (
            <p className="text-xs pl-6" style={{ color: "var(--bt-ink-muted)" }}>
              +{todayObjectives.length - 3} {t("plan.todayCardMore")}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--bt-ink-muted)" }}>{t("plan.nothing")}</p>
      )}

      {weekAhead.length > 0 && (
        <div className="mt-3.5 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.10)" }} onClick={e => e.stopPropagation()}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--bt-ink-muted)" }}>
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
                  className="flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 rounded-full text-xs transition-colors"
                  style={isExam
                    ? { backgroundColor: "rgba(252,165,165,0.12)", border: "1px solid rgba(252,165,165,0.30)" }
                    : { backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.13)" }}>
                  {item.courseId && (
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: courseColor(item.courseId) }} />
                  )}
                  <span className="font-medium truncate max-w-[140px]"
                    style={{ color: isExam ? "#FCA5A5" : "var(--bt-ink-text)" }}>
                    {isExam ? `${t("plan.examTag")} · ${item.name}` : item.name}
                  </span>
                  <span className="font-bold shrink-0" style={{ color: isExam ? "#FCA5A5" : "var(--bt-ink-muted)" }}>
                    {isExam ? `J-${days}` : dayLabel}
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
  );
}

// ── DayDetailModal ────────────────────────────────────────────
// Surface UNIQUE de gestion d'un jour : consulter, ajouter, modifier,
// reporter, supprimer objectifs et examens, lancer le chrono. (Avant, un
// panneau latéral dupliquait tout ça avec d'autres formulaires — supprimé.)
function DayDetailModal() {
  const { modalDate, setModalDate, modalPrefillTime, byDate, examsByDate, sessions, courses,
          courseColor, courseName, toggle, remove, postpone, launchTimer,
          addObjectiveForDate, saveObjEdit, addExam, removeExam, saveExamEdit, duplicateDay, lang, t } = usePlan();

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm]         = useState(EMPTY_OBJECTIVE_FORM);
  const [showAddExamForm, setShowAddExamForm] = useState(false);
  const [examForm, setExamForm]               = useState({ name: "", courseId: "", time: "", location: "" });
  const [dupOpen, setDupOpen]                 = useState(false);

  // Inline edit state
  const [editingObjId, setEditingObjId] = useState(null);
  const [editForm, setEditForm]         = useState({});
  const [postponingId, setPostponingId] = useState(null);
  const [editingExamId, setEditingExamId] = useState(null);
  const [examEditForm, setExamEditForm]   = useState({ name: "", courseId: "", time: "", location: "" });

  // À chaque ouverture / changement de jour : repartir d'un état propre.
  // Si on arrive depuis un créneau horaire de la grille (modalPrefillTime),
  // ouvrir directement le formulaire d'ajout pré-rempli sur cette heure.
  useEffect(() => {
    if (!modalDate) return;
    setShowAddForm(!!modalPrefillTime);
    setAddForm({ ...EMPTY_OBJECTIVE_FORM, time: modalPrefillTime || "" });
    setShowAddExamForm(false);
    setExamForm({ name: "", courseId: "", time: "", location: "" });
    setEditingObjId(null);
    setPostponingId(null);
    setEditingExamId(null);
    setDupOpen(false);
  }, [modalDate, modalPrefillTime]);

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

  const locale     = lang === "en" ? "en-GB" : "fr-FR";
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
    setExamForm({ name: "", courseId: "", time: "", location: "" });
    setShowAddExamForm(false);
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" style={{ backgroundColor: "rgba(0,0,0,0.42)", backdropFilter: "blur(3px)" }}
        onClick={() => setModalDate(null)} />

      {/* Card — bottom sheet on mobile, centered on sm+ */}
      <div className="fixed z-50 bottom-0 inset-x-0 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4 pointer-events-none">
        <div className="pointer-events-auto rounded-t-[28px] sm:rounded-[24px] sm:max-w-lg sm:w-full"
          style={{
            backgroundColor: "var(--bt-surface)",
            border: "1px solid var(--bt-border)",
            boxShadow: "0 -8px 48px rgba(0,0,0,0.18), 0 2px 16px rgba(0,0,0,0.08)",
            maxHeight: "88vh",
            overflowY: "auto",
          }}>

          {/* Drag handle (mobile only) */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--bt-border)" }} />
          </div>

          <div className="px-5 pt-2 pb-8">

            {/* ── Header ── */}
            <div className="flex items-start justify-between mb-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold capitalize leading-tight" style={{ color: "var(--bt-text-1)" }}>
                  {d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}
                </h2>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {isToday && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: "#EAFBF4", color: "#0E8F68" }}>
                      {t("common.today")}
                    </span>
                  )}
                  {isPast && !isToday && (
                    <span className="text-[11px] font-medium" style={{ color: "var(--bt-text-4)" }}>
                      {t("plan.dayPast")}
                    </span>
                  )}
                  {objectives.length > 0 && (
                    <span className="text-xs" style={{ color: "var(--bt-text-3)" }}>
                      {doneCount} {t("plan.dayObjectiveOf")} {objectives.length} {t("plan.dayObjectives").toLowerCase()}
                    </span>
                  )}
                  {exams.length > 0 && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
                      {exams.length} {t("plan.dayExams").toLowerCase()}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => setModalDate(null)}
                className="w-8 h-8 flex items-center justify-center rounded-xl shrink-0 ml-3 transition-colors"
                style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)", border: "1px solid var(--bt-border)" }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bt-border)"}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = "var(--bt-subtle)"}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* ── Time studied ── */}
            {totalStudiedSecs > 0 && (
              <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-2xl"
                style={{ backgroundColor: "#EAFBF4", border: "1px solid #C6EED9" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0E8F68" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                <div className="flex-1">
                  <p className="text-xs font-medium" style={{ color: "#0E8F68" }}>{t("plan.dayStudied")}</p>
                  <p className="text-base font-bold leading-tight" style={{ color: "#0E8F68" }}>
                    {formatMinutesShort(totalStudiedSecs)}
                  </p>
                </div>
                {totalTargetMin > 0 && (
                  <div className="text-right">
                    <p className="text-xs" style={{ color: "#0E8F68" }}>/ {totalTargetMin} min</p>
                    <p className="text-xs font-bold" style={{ color: "#0E8F68" }}>
                      {Math.min(100, Math.round(totalStudiedSecs / 60 / totalTargetMin * 100))}%
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── Exams — affichage + ajout, toujours visible (symétrique
                 avec la section "Ajouter un objectif" plus bas) ── */}
            <div className="mb-4">
              {exams.length > 0 && (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--bt-text-4)" }}>
                    {t("plan.dayExams")}
                  </p>
                  <div className="space-y-2 mb-2">
                    {exams.map(ex => {
                      const days = daysUntil(ex.exam_date);
                      if (editingExamId === ex.id) {
                        return (
                          <form key={ex.id} onSubmit={handleExamEditSave} className="space-y-2 p-3 rounded-2xl"
                            style={{ backgroundColor: "#FEF2F2", border: "1px solid #DC2626" }}>
                            <input className="input text-sm" value={examEditForm.name} required autoFocus
                              onChange={e => setExamEditForm(f => ({ ...f, name: e.target.value }))}
                              placeholder={t("plan.examNamePlaceholder")} />
                            <div className="flex gap-2">
                              <select className="input text-sm flex-1" value={examEditForm.courseId}
                                onChange={e => setExamEditForm(f => ({ ...f, courseId: e.target.value }))}>
                                <option value="">{t("plan.courseSelect")}</option>
                                {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                              <input className="input w-24 text-sm" type="time" value={examEditForm.time}
                                onChange={e => setExamEditForm(f => ({ ...f, time: e.target.value }))} />
                            </div>
                            <input className="input text-sm" value={examEditForm.location}
                              onChange={e => setExamEditForm(f => ({ ...f, location: e.target.value }))}
                              placeholder={t("plan.examLocationPlaceholder")} />
                            <div className="flex gap-2">
                              <button type="submit" className="flex-1 py-1.5 rounded-xl text-xs font-semibold"
                                style={{ backgroundColor: "#DC2626", color: "#fff" }}>
                                {t("common.save")}
                              </button>
                              <button type="button" onClick={() => setEditingExamId(null)} className="btn-ghost text-xs flex-1">{t("common.cancel")}</button>
                            </div>
                          </form>
                        );
                      }
                      return (
                        <div key={ex.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                          style={{ backgroundColor: "#FEF2F2", border: "1px solid #FECACA" }}>
                          {ex.course_id && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: courseColor(ex.course_id) }} />}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate" style={{ color: "#991B1B" }}>{ex.name}</p>
                            {(ex.exam_time || ex.location) && (
                              <p className="text-xs mt-0.5" style={{ color: "#B91C1C" }}>{[ex.exam_time, ex.location].filter(Boolean).join(" · ")}</p>
                            )}
                          </div>
                          <ExamBadge days={days} />
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button onClick={() => startExamEdit(ex)} title={t("plan.dayEdit")} style={{ color: "#FCA5A5" }}
                              className="w-7 h-7 flex items-center justify-center rounded-lg"
                              onMouseEnter={ev => ev.currentTarget.style.color = "#DC2626"}
                              onMouseLeave={ev => ev.currentTarget.style.color = "#FCA5A5"}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                              </svg>
                            </button>
                            <button onClick={() => removeExam(ex.id)} title={t("common.delete")} style={{ color: "#FCA5A5" }}
                              className="w-7 h-7 flex items-center justify-center rounded-lg"
                              onMouseEnter={ev => ev.currentTarget.style.color = "#DC2626"}
                              onMouseLeave={ev => ev.currentTarget.style.color = "#FCA5A5"}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              {!showAddExamForm ? (
                <button onClick={() => setShowAddExamForm(true)}
                  className="w-full py-2.5 rounded-2xl text-sm font-medium flex items-center justify-center gap-1.5 transition-all"
                  style={{ border: "1.5px dashed #FECACA", color: "#DC2626" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  {t("plan.dayAddExam")}
                </button>
              ) : (
                <form onSubmit={handleAddExam} className="space-y-2 p-3 rounded-2xl"
                  style={{ backgroundColor: "#FEF2F2", border: "1px solid #FECACA" }}>
                  <input className="input text-sm" value={examForm.name} required autoFocus
                    onChange={e => setExamForm(f => ({ ...f, name: e.target.value }))}
                    placeholder={t("plan.examNamePlaceholder")} />
                  <div className="flex gap-2">
                    <select className="input text-sm flex-1" value={examForm.courseId}
                      onChange={e => setExamForm(f => ({ ...f, courseId: e.target.value }))}>
                      <option value="">{t("plan.courseSelect")}</option>
                      {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <input className="input w-24 text-sm" type="time" value={examForm.time}
                      onChange={e => setExamForm(f => ({ ...f, time: e.target.value }))} />
                  </div>
                  <input className="input text-sm" value={examForm.location}
                    onChange={e => setExamForm(f => ({ ...f, location: e.target.value }))}
                    placeholder={t("plan.examLocationPlaceholder")} />
                  <div className="flex gap-2">
                    <button type="submit" className="flex-1 py-1.5 rounded-xl text-xs font-semibold"
                      style={{ backgroundColor: "#DC2626", color: "#fff" }}>
                      {t("plan.examSubmit")}
                    </button>
                    <button type="button" onClick={() => setShowAddExamForm(false)} className="btn-ghost text-xs flex-1">{t("common.cancel")}</button>
                  </div>
                </form>
              )}
            </div>

            {/* ── Objectives ── */}
            <div className="mb-4">
              {objectives.length > 0 && (
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--bt-text-4)" }}>
                  {t("plan.dayObjectives")}
                </p>
              )}
              {objectives.length === 0 && exams.length === 0 && (
                <p className="text-sm text-center py-8" style={{ color: "var(--bt-text-4)" }}>
                  {t("plan.dayNoContent")}
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
                  const statusColor = o.done ? "#0E8F68" : isPast ? "#DC2626" : "var(--bt-text-3)";
                  const statusBg    = o.done ? "#EAFBF4"  : isPast ? "#FEF2F2"  : "var(--bt-subtle)";
                  const isEditing   = editingObjId === o.id;

                  return (
                    <div key={o.id} className="rounded-2xl overflow-hidden"
                      style={{ border: `1px solid ${isEditing ? "#14B885" : "var(--bt-border)"}`, transition: "border-color 0.15s" }}>

                      {/* ── View mode ── */}
                      {!isEditing && (
                        <>
                        <div className="flex items-start gap-3 px-4 py-3"
                          style={{ backgroundColor: "var(--bt-subtle)" }}>
                          <input type="checkbox" checked={o.done} onChange={() => toggle(o)}
                            className="bt-task-check w-4 h-4 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {o.course_id && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: courseColor(o.course_id) }} />}
                              <p className={`bt-strike ${o.done ? "is-done" : ""} text-sm font-medium flex-1 min-w-0`}
                                style={{ color: o.done ? "var(--bt-text-4)" : "var(--bt-text-1)" }}>
                                {o.title || courseName(o.course_id) || "—"}
                              </p>
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                                style={{ backgroundColor: statusBg, color: statusColor }}>
                                {statusLabel}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {o.course_id && <span className="text-xs" style={{ color: "var(--bt-text-3)" }}>{courseName(o.course_id)}</span>}
                              {o.scheduled_time && <span className="text-xs font-medium" style={{ color: "var(--bt-text-3)" }}>· {o.scheduled_time}</span>}
                              {o.target_minutes > 0 && <span className="text-xs" style={{ color: "var(--bt-text-3)" }}>· {o.target_minutes} min</span>}
                              {recurLabel && <span className="text-xs font-semibold" style={{ color: "var(--bt-text-4)" }}>· ↻ {recurLabel}</span>}
                              {realSecs > 0 && <span className="text-xs font-semibold" style={{ color: "#0E8F68" }}>· {formatMinutesShort(realSecs)} {t("plan.dayStudied").toLowerCase()}</span>}
                            </div>
                            {o.target_minutes > 0 && realSecs > 0 && (
                              <div className="mt-1.5 w-full h-1 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bt-border)" }}>
                                <div className="h-full rounded-full" style={{
                                  width: `${Math.min(100, Math.round(realSecs / 60 / o.target_minutes * 100))}%`,
                                  backgroundColor: "#14B885", transition: "width 0.5s",
                                }} />
                              </div>
                            )}
                          </div>
                          {/* Actions */}
                          <div className="flex items-center gap-0.5 shrink-0">
                            {!o.done && isToday && o.course_id && (
                              <button onClick={() => launchTimer(o.course_id)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg"
                                style={{ color: "var(--bt-text-4)" }} title={t("plan.launchTimer")}
                                onMouseEnter={e => e.currentTarget.style.color = "#14B885"}
                                onMouseLeave={e => e.currentTarget.style.color = "var(--bt-text-4)"}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                  <polygon points="5 3 19 12 5 21 5 3"/>
                                </svg>
                              </button>
                            )}
                            {!o.done && (
                              <button onClick={() => setPostponingId(p => p === o.id ? null : o.id)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg"
                                style={{ color: postponingId === o.id ? "#D97706" : "var(--bt-text-4)" }}
                                title={t("plan.postponeTooltip")}
                                onMouseEnter={e => e.currentTarget.style.color = "#D97706"}
                                onMouseLeave={e => e.currentTarget.style.color = postponingId === o.id ? "#D97706" : "var(--bt-text-4)"}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="4" width="18" height="18" rx="2"/>
                                  <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                                  <line x1="3" y1="10" x2="21" y2="10"/>
                                  <path d="M16 14l2 2 4-4"/>
                                </svg>
                              </button>
                            )}
                            <button onClick={() => startInlineEdit(o)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg"
                              style={{ color: "var(--bt-text-4)" }} title={t("plan.dayEdit")}
                              onMouseEnter={e => e.currentTarget.style.color = "var(--bt-text-2)"}
                              onMouseLeave={e => e.currentTarget.style.color = "var(--bt-text-4)"}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                              </svg>
                            </button>
                            <button onClick={() => remove(o.id)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg"
                              style={{ color: "var(--bt-text-4)" }}
                              onMouseEnter={e => e.currentTarget.style.color = "#DC2626"}
                              onMouseLeave={e => e.currentTarget.style.color = "var(--bt-text-4)"}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                          </div>
                        </div>

                        {/* Report : demain en un clic, ou une autre date */}
                        {postponingId === o.id && !o.done && (
                          <div className="flex items-center gap-2 px-4 pb-3" style={{ backgroundColor: "var(--bt-subtle)" }}>
                            <button onClick={() => { postpone(o.id, tomorrow); setPostponingId(null); }}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0"
                              style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)", color: "var(--bt-text-1)" }}>
                              {t("plan.dayPostpone")}
                            </button>
                            <input type="date" className="input text-xs py-1.5 flex-1" min={tomorrow}
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
                        <div style={{ backgroundColor: "var(--bt-surface)" }}>
                          <ObjectiveForm
                            className="px-4 py-3 space-y-2.5"
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

            {/* ── Add objective ── */}
            {!isPast && (
              !showAddForm ? (
                <button onClick={() => setShowAddForm(true)}
                  className="w-full py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                  style={{ border: "1.5px dashed var(--bt-border)", color: "var(--bt-text-3)" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#14B885"; e.currentTarget.style.color = "#14B885"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--bt-border)"; e.currentTarget.style.color = "var(--bt-text-3)"; }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  {t("plan.dayAddObj")}
                </button>
              ) : (
                <ObjectiveForm
                  className="space-y-2.5 p-4 rounded-2xl"
                  style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}
                  value={addForm}
                  onChange={patch => setAddForm(f => ({ ...f, ...patch }))}
                  onSubmit={handleAdd}
                  onCancel={() => setShowAddForm(false)}
                  minDate={modalDate}
                  submitLabel={t("common.add")}
                  autoFocus />
              )
            )}

            {/* ── Dupliquer ce jour : recopie tous ses objectifs vers une autre
                 date (structure de révision réutilisable) ── */}
            {objectives.length > 0 && (
              <div className="mt-3">
                {!dupOpen ? (
                  <button onClick={() => setDupOpen(true)}
                    className="w-full py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                    style={{ color: "var(--bt-text-3)" }}
                    onMouseEnter={e => e.currentTarget.style.color = "var(--bt-text-1)"}
                    onMouseLeave={e => e.currentTarget.style.color = "var(--bt-text-3)"}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                    {t("plan.duplicateDay")}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl"
                    style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}>
                    <span className="text-xs shrink-0" style={{ color: "var(--bt-text-3)" }}>{t("plan.duplicateDayTo")}</span>
                    <input type="date" className="input text-xs py-1.5 flex-1" min={today}
                      aria-label={t("plan.duplicateDayTo")}
                      onChange={async e => {
                        if (e.target.value && e.target.value !== modalDate) {
                          await duplicateDay(modalDate, e.target.value);
                          setDupOpen(false);
                        }
                      }} />
                    <button type="button" onClick={() => setDupOpen(false)} className="btn-ghost text-xs px-2 py-1">{t("common.cancel")}</button>
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

// ── MonthView ─────────────────────────────────────────────────
function MonthView() {
  const { cursor, byDate, examsByDate, selectedDate, setSelectedDate, openDay, courseColor, lang } = usePlan();
  const grid  = buildMonthGrid(cursor.year, cursor.month);
  const today = localToday();

  // Split into 6 rows of 7
  const weeks = Array.from({ length: 6 }, (_, i) => grid.slice(i * 7, i * 7 + 7));

  return (
    <section className="card overflow-hidden">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b" style={{ borderColor: "var(--bt-border)" }}>
        {weekdaysShortFor(lang).map((d, i) => (
          <div key={d}
            className="py-3 text-center text-xs font-semibold uppercase tracking-wider"
            style={{
              color: i >= 5 ? "var(--bt-accent-dark)" : "var(--bt-text-3)",
              backgroundColor: i >= 5 ? "var(--bt-accent-bg)" : "transparent",
            }}>
            {d}
          </div>
        ))}
      </div>

      {/* Week rows */}
      <div>
        {weeks.map((week, wi) => (
          <div key={wi}
            className="grid grid-cols-7"
            style={{ borderBottom: wi < 5 ? "1px solid var(--bt-border)" : "none" }}>
            {week.map(d => {
              const key       = ymd(d);
              const inMonth   = d.getMonth() === cursor.month;
              const isToday   = key === today;
              const isSel     = key === selectedDate;
              const isPast    = key < today && inMonth && !isToday;
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              const items     = byDate[key]     || [];
              const examItems = examsByDate[key] || [];

              const bgStyle = getDayCellStyle(items, courseColor);
              if (examItems.length && !bgStyle.background && !bgStyle.backgroundColor) {
                bgStyle.backgroundColor = "rgba(220,38,38,0.06)";
              }
              if (isWeekend && !bgStyle.background && !bgStyle.backgroundColor) {
                bgStyle.backgroundColor = "var(--bt-accent-bg)";
              }

              return (
                <button key={key} onClick={() => { if (inMonth) openDay(key); else setSelectedDate(key); }}
                  className="min-h-[82px] p-2 text-left transition-colors relative"
                  style={{
                    ...bgStyle,
                    borderRight: "1px solid var(--bt-border)",
                    outline: isSel ? "2px solid #14B885" : "none",
                    outlineOffset: "-2px",
                    opacity: inMonth ? 1 : 0.3,
                  }}>
                  {/* Past day — diagonal line */}
                  {isPast && (
                    <>
                      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", backgroundColor: "rgba(168,160,154,0.07)" }} />
                      <svg viewBox="0 0 100 100" preserveAspectRatio="none"
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                        <line x1="100" y1="0" x2="0" y2="100" stroke="#A8A09A" strokeWidth="1.2" opacity="0.22" />
                      </svg>
                    </>
                  )}

                  {/* Day number */}
                  <span className="relative inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-bold mb-1"
                    style={isToday
                      ? { backgroundColor: "#14B885", color: "#fff" }
                      : isSel
                      ? { backgroundColor: "rgba(20,184,133,0.15)", color: "#0E8F68" }
                      : { color: isPast ? "var(--bt-text-3)" : "var(--bt-text-1)" }}>
                    {d.getDate()}
                  </span>

                  {/* Events — mobile: dots only (cells too narrow for legible text) */}
                  <div className="flex sm:hidden flex-wrap gap-1">
                    {items.slice(0, 4).map(o => (
                      <span key={o.id} className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: courseColor(o.course_id), opacity: o.done ? 0.35 : 1 }} />
                    ))}
                    {examItems.slice(0, 2).map(e => (
                      <span key={e.id} className="w-1.5 h-1.5 rounded-sm shrink-0" style={{ backgroundColor: "#DC2626" }} />
                    ))}
                    {(items.length + examItems.length) > 6 && (
                      <span className="text-[9px] leading-none" style={{ color: "var(--bt-text-4)" }}>
                        +{items.length + examItems.length - 6}
                      </span>
                    )}
                  </div>

                  {/* Events — sm+: full titles, room for text */}
                  <div className="hidden sm:block space-y-0.5">
                    {items.slice(0, 2).map(o => (
                      <div key={o.id} className="flex items-center gap-1 truncate" title={o.title}>
                        <span className="w-1.5 h-1.5 rounded-full shrink-0 flex-none"
                          style={{ backgroundColor: courseColor(o.course_id), opacity: o.done ? 0.35 : 1 }} />
                        <span className="text-[10px] truncate leading-tight"
                          style={{ color: o.done ? "var(--bt-text-4)" : "var(--bt-text-2)",
                            textDecoration: o.done ? "line-through" : "none" }}>
                          {o.title}
                        </span>
                      </div>
                    ))}
                    {examItems.slice(0, 1).map(e => (
                      <div key={e.id} className="flex items-center gap-1 truncate" title={e.name}>
                        <span className="w-1.5 h-1.5 rounded-sm shrink-0 flex-none" style={{ backgroundColor: "#DC2626" }} />
                        <span className="text-[10px] truncate font-semibold leading-tight" style={{ color: "#DC2626" }}>{e.name}</span>
                      </div>
                    ))}
                    {(items.length + examItems.length) > 3 && (
                      <span className="text-[10px]" style={{ color: "var(--bt-text-4)" }}>
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
function TimeGrid({ days }) {
  const { byDate, examsByDate, selectedDate, courseColor, openDay, t, lang } = usePlan();
  const today = localToday();
  const TODAY_TINT = "rgba(20,184,133,0.06)"; // voile accent — lisible sur light ET dark

  // Clic sur un créneau : ouvre la fiche du jour, formulaire d'ajout
  // pré-rempli sur l'heure cliquée (une seule surface d'ajout : le modal).
  function handleSlotClick(key, h) {
    openDay(key, h !== null ? String(h).padStart(2, "0") + ":00" : null);
  }

  return (
    <div className="card overflow-hidden flex flex-col">
      {/* En-tête jours — sticky */}
      <div className="grid sticky top-0 z-20"
        style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)`, backgroundColor: "var(--bt-surface)", borderBottom: "1px solid var(--bt-border)" }}>
        <div style={{ borderRight: "1px solid var(--bt-border)" }} />
        {days.map((d, i) => {
          const key     = ymd(d);
          const isToday = key === today;
          const isSel   = key === selectedDate;
          return (
            <button key={key} onClick={() => openDay(key)}
              className="py-2 text-center transition-colors"
              style={{ borderRight: "1px solid var(--bt-border)", backgroundColor: isSel ? "var(--bt-accent-bg)" : "transparent" }}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.backgroundColor = "var(--bt-subtle)"; }}
              onMouseLeave={e => { if (!isSel) e.currentTarget.style.backgroundColor = "transparent"; }}>
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--bt-text-3)" }}>{weekdaysShortFor(lang)[(d.getDay() + 6) % 7]}</p>
              <span className="mt-0.5 inline-flex w-7 h-7 items-center justify-center rounded-full text-sm font-num font-bold tabular-nums"
                style={isToday ? { backgroundColor: "#14B885", color: "#fff" }
                  : isSel ? { backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }
                  : { color: "var(--bt-text-1)" }}>
                {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {/* Ligne "toute la journée" (objectifs sans heure + examens) */}
      <div className="grid min-h-[36px]"
        style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)`, backgroundColor: "var(--bt-subtle)", borderBottom: "1px solid var(--bt-border)" }}>
        <div className="flex items-center justify-center px-1" style={{ borderRight: "1px solid var(--bt-border)" }}>
          <span className="text-[10px] font-medium" style={{ color: "var(--bt-text-3)" }}>{t("plan.allDayShort")}</span>
        </div>
        {days.map(d => {
          const key       = ymd(d);
          const items     = (byDate[key] || []).filter(o => !o.scheduled_time);
          const examItems = examsByDate[key] || [];
          return (
            <div key={key} className="p-0.5 space-y-0.5 cursor-pointer transition-colors"
              style={{ borderRight: "1px solid var(--bt-border)" }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "var(--bt-border)"; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; }}
              onClick={() => handleSlotClick(key, null)}>
              {items.map(o => (
                <div key={o.id} className="text-[11px] rounded px-1.5 py-0.5 truncate text-white font-medium"
                  style={{ backgroundColor: courseColor(o.course_id) }}
                  title={o.title}
                  onClick={e => { e.stopPropagation(); openDay(key); }}>
                  {o.title}
                </div>
              ))}
              {examItems.map(e => (
                <div key={e.id} className="text-[11px] rounded px-1.5 py-0.5 truncate font-bold"
                  style={{ backgroundColor: "#DC2626", color: "#fff" }}
                  title={e.name}
                  onClick={ev => { ev.stopPropagation(); openDay(key); }}>
                  {t("plan.examTag")} : {e.name}
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
            style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)`, minHeight: 64, borderBottom: "1px solid var(--bt-border)" }}>
            <div className="px-2 pt-1.5 shrink-0" style={{ borderRight: "1px solid var(--bt-border)" }}>
              <span className="text-xs font-num tabular-nums" style={{ color: "var(--bt-text-3)" }}>{String(h).padStart(2,"0")}h</span>
            </div>
            {days.map(d => {
              const key      = ymd(d);
              const isToday  = key === today;
              const slotObjs = (byDate[key] || []).filter(o => getHour(o.scheduled_time) === h);
              return (
                <div key={key}
                  className="p-0.5 cursor-pointer transition-colors"
                  style={{ borderRight: "1px solid var(--bt-border)", backgroundColor: isToday ? TODAY_TINT : "transparent" }}
                  onMouseEnter={e => { if (!isToday) e.currentTarget.style.backgroundColor = "var(--bt-subtle)"; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = isToday ? TODAY_TINT : "transparent"; }}
                  onClick={() => handleSlotClick(key, h)}>
                  {slotObjs.map(o => (
                    <div key={o.id}
                      className="text-[11px] rounded px-1.5 py-1 mb-0.5 text-white font-medium cursor-pointer hover:brightness-90 truncate"
                      style={{ backgroundColor: courseColor(o.course_id) }}
                      title={o.title}
                      onClick={e => { e.stopPropagation(); openDay(key); }}>
                      <span className="block truncate">{o.title}</span>
                      <span className="opacity-80 text-[10px] font-num tabular-nums">{o.target_minutes} min</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── QuickAddBar ───────────────────────────────────────────────
// Barre d'ajout rapide en langage naturel : « Bio 2h demain 14h » → objectif.
// Aperçu live de ce qui sera créé (le parsing est faillible → l'utilisateur
// voit et corrige avant de valider). 100 % client (lib/planningQuickAdd).
function QuickAddChip({ children, accent }) {
  return (
    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full"
      style={accent
        ? { backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)", border: "1px solid var(--bt-accent-border)" }
        : { backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)", border: "1px solid var(--bt-border)" }}>
      {children}
    </span>
  );
}
function QuickAddBar() {
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
    <form onSubmit={submit} className="mb-4 no-print">
      <div className="flex items-center gap-2 rounded-2xl px-3 py-2"
        style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#14B885" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <path d="M5 3v4M3 5h4M6 17v4M4 19h4" /><path d="M13 3l3.5 7.5L24 14l-7.5 3.5L13 25l-3.5-7.5L2 14l7.5-3.5z" transform="scale(0.62) translate(4 2)" />
        </svg>
        <input value={text} onChange={e => setText(e.target.value)}
          placeholder={t("plan.quickAddPlaceholder")} aria-label={t("plan.quickAddPlaceholder")}
          className="flex-1 bg-transparent text-sm outline-none min-w-0" style={{ color: "var(--bt-text-1)" }} />
        <button type="submit" disabled={!canAdd || busy}
          className="btn-primary text-xs px-3 py-1.5 shrink-0"
          style={{ opacity: canAdd && !busy ? 1 : 0.45, cursor: canAdd && !busy ? "pointer" : "default" }}>
          {t("common.add")}
        </button>
      </div>
      {trimmed && parsed && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2 px-1">
          <span className="text-[10px] uppercase tracking-wider shrink-0" style={{ color: "var(--bt-text-4)" }}>{t("plan.quickAddPreview")}</span>
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

// ── Main component ────────────────────────────────────────────
export default function Planning() {
  const { user, profile, refreshProfile } = useAuth();
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const {
    courseId: timerCourseId, setCourseId: setTimerCourseId,
    running: timerRunning, elapsed: timerElapsed, pause: pauseTimer, reset: resetTimer,
  } = useTimer();
  const [view, setView]             = useState("month");
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

  useEffect(() => { load(); }, [load]);

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

  // Pont planning -> chrono : lance le chrono du dashboard pré-rempli avec
  // ce cours. Si une session est deja en cours (ou du temps non enregistre
  // en pause) sur un AUTRE cours, on confirme avant d'ecraser (meme logique
  // que confirmDiscardIfWorking sur le dashboard : on ne perd jamais du
  // temps silencieusement).
  function launchTimer(cId) {
    if (!cId) return;
    if ((timerRunning || timerElapsed > 0) && timerCourseId !== cId) {
      if (!window.confirm(t("plan.confirmSwitchCourse"))) return;
      if (timerRunning) pauseTimer();
      resetTimer();
    }
    setTimerCourseId(cId);
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
  const planningCoachKind = missingExamPreparation
    ? "exam"
    : (todayObjectives.length >= 5 || todayMinutes >= 240)
      ? "heavy"
      : (objectives.length === 0 && exams.length === 0) ? "empty" : "ready";
  const planningCoachMessage = planningCoachKind === "exam"
    ? t("coach.planning.exam").replace("{days}", String(nextExamDays))
    : t(`coach.planning.${planningCoachKind}`);
  const planningCoachId = planningCoachKind === "exam"
    ? `planning-exam-${nextExam.id}`
    : `planning-${planningCoachKind}`;

  function shiftDays(n) { const d = dateFromYmd(selectedDate); d.setDate(d.getDate() + n); setSelectedDate(ymd(d)); }
  function shiftMonth(delta) { setCursor(c => { const d = new Date(c.year, c.month + delta, 1); return { year: d.getFullYear(), month: d.getMonth() }; }); }
  function goToday() { const t = localToday(); setSelectedDate(t); const d = new Date(); setCursor({ year: d.getFullYear(), month: d.getMonth() }); }
  function handlePrev() { if (view==="day") shiftDays(-1); else if (view==="week") shiftDays(-7); else shiftMonth(-1); }
  function handleNext() { if (view==="day") shiftDays(1);  else if (view==="week") shiftDays(7);  else shiftMonth(1); }

  function periodLabel() {
    const months = monthsFor(lang);
    if (view === "day") return dateFromYmd(selectedDate).toLocaleDateString(localeFor(lang), { weekday:"long", day:"numeric", month:"long", year:"numeric" });
    if (view === "week") {
      const days = getWeekDays(selectedDate), f = days[0], l = days[6];
      return f.getMonth() === l.getMonth()
        ? `${f.getDate()} – ${l.getDate()} ${months[f.getMonth()]} ${f.getFullYear()}`
        : `${f.getDate()} ${months[f.getMonth()]} – ${l.getDate()} ${months[l.getMonth()]} ${l.getFullYear()}`;
    }
    return `${months[cursor.month]} ${cursor.year}`;
  }

  const ctxValue = {
    view, courses, objectives, byDate, examsByDate, cursor, selectedDate, setSelectedDate,
    toggle, remove, courseColor, courseName, exams, sessions, postpone, addExam, removeExam, saveExamEdit,
    modalDate, setModalDate, modalPrefillTime, openDay, addObjectiveForDate, saveObjEdit,
    launchTimer, duplicateDay, duplicateWeek,
    lang, t,
  };

  return (
    <Ctx.Provider value={ctxValue}>
      <style>{`@media print { aside, nav, header, footer, .no-print { display: none !important; } body { background: white !important; } .card { box-shadow: none !important; } }`}</style>
      <Layout>
        {/* Barre d'outils unique : navigation + période à gauche, vue et
            actions secondaires (partage, export) à droite. */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <div className="flex items-center gap-1">
            <button onClick={handlePrev} className="btn-ghost px-2.5 py-1.5 text-lg leading-none">‹</button>
            <button onClick={handleNext} className="btn-ghost px-2.5 py-1.5 text-lg leading-none">›</button>
          </div>
          <button onClick={goToday} className="btn-ghost text-xs px-3 py-1.5">{t("common.today")}</button>
          <h2 className="font-display text-lg capitalize flex-1 min-w-[150px]" style={{ color: "var(--bt-text-1)" }}>{periodLabel()}</h2>
          {/* Glissière à ressort : le pouce glisse entre Jour/Semaine/Mois */}
          <SegmentedGlide
            options={[
              { value: "day", label: t("plan.day") },
              { value: "week", label: t("plan.week") },
              { value: "month", label: t("plan.month") },
            ]}
            value={view}
            onChange={setView}
          />
          <button onClick={togglePlanningPublic} disabled={togglingShare}
            role="switch" aria-checked={!!profile?.planning_public} title={t("plan.public")}
            className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5 no-print"
            style={{ opacity: togglingShare ? 0.6 : 1, cursor: togglingShare ? "wait" : "pointer" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            {profile?.planning_public ? t("plan.shareShared") : t("plan.sharePrivate")}
            <span className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: profile?.planning_public ? "#14B885" : "var(--bt-text-4)" }} />
          </button>
          <button onClick={duplicateWeek} title={t("plan.duplicateWeekHint")}
            className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5 no-print">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            <span className="hidden sm:inline">{t("plan.duplicateWeek")}</span>
          </button>
          <button onClick={exportCalendar} title={t("plan.exportCalendarHint")}
            className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5 no-print">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
              <path d="M12 14v4"/>
              <path d="m10 16 2 2 2-2"/>
            </svg>
            <span className="hidden sm:inline">{t("plan.exportCalendar")}</span>
          </button>
        </div>

        <QuickAddBar />

        <TodayCard />

        <MascotCoach
          id={planningCoachId}
          message={planningCoachMessage}
          streak={computeStreak(sessions, frozenDays)}
          persistence="day"
          className="mb-5 max-w-2xl"
        />

        {/* Keyed on the view so switching mois/semaine/jour plays a soft fade.
            Calendrier pleine largeur : le détail d'un jour vit dans le modal,
            plus de panneau latéral en doublon. */}
        <div key={view} className="bt-tab-fade">
          {view === "month" && <MonthView />}
          {view === "week"  && <TimeGrid days={getWeekDays(selectedDate)} />}
          {view === "day"   && <TimeGrid days={[dateFromYmd(selectedDate)]} />}
        </div>

        <RevisionChecklists />
      </Layout>

      {/* Day detail modal — mounted outside Layout to avoid stacking context issues */}
      <DayDetailModal />
    </Ctx.Provider>
  );
}
