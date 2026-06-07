import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import Layout from "../components/Layout";
import CourseChecklistModal from "../components/CourseChecklistModal";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { todayISO, formatMinutesShort } from "../lib/format";
import { notifyXPChanged } from "../lib/xpEvents";

// ── Constants ─────────────────────────────────────────────────
const WEEKDAYS_SHORT = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
const MONTHS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
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

// ── ObjectiveRow ──────────────────────────────────────────────
function ObjectiveRow({ o }) {
  const { courses, editingId, editForm, setEditForm, startEdit, saveEdit, setEditingId,
          toggle, remove, courseColor, courseName, postpone, sessions, dragId, setDragId } = usePlan();
  const [showPostpone, setShowPostpone] = useState(false);
  const [customDate, setCustomDate]     = useState("");

  const tomorrow = tomorrowISO();
  const realSecs = o.course_id
    ? sessions
        .filter(s => s.course_id === o.course_id && s.started_at.slice(0, 10) === o.scheduled_date)
        .reduce((a, s) => a + s.duration_seconds, 0)
    : 0;
  const realMin = Math.round(realSecs / 60);

  if (editingId === o.id) {
    return (
      <li className="rounded-xl border border-accent/40 px-3 py-2 space-y-2">
        <input className="input text-sm" value={editForm.title}
          onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
        <div className="flex gap-2">
          <select className="input text-sm" value={editForm.courseId}
            onChange={e => setEditForm(f => ({ ...f, courseId: e.target.value }))}>
            <option value="">Cours —</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input className="input w-20 text-sm" type="number" min={5} step={5}
            value={editForm.minutes}
            onChange={e => setEditForm(f => ({ ...f, minutes: e.target.value }))} />
        </div>
        <input className="input text-sm" type="time" value={editForm.time}
          onChange={e => setEditForm(f => ({ ...f, time: e.target.value }))} />
        <select className="input text-sm" value={editForm.recurrence || ""}
          onChange={e => setEditForm(f => ({ ...f, recurrence: e.target.value }))}>
          <option value="">Aucune répétition</option>
          <option value="daily">Quotidien</option>
          <option value="weekly">Hebdomadaire</option>
        </select>
        <div className="flex gap-2">
          <button onClick={() => saveEdit(o.id)} className="btn-primary text-xs flex-1">Enregistrer</button>
          <button onClick={() => setEditingId(null)} className="btn-ghost text-xs flex-1">Annuler</button>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-stone-100 px-3 py-2"
      draggable={!o.done}
      onDragStart={e => { e.dataTransfer.effectAllowed = "move"; setDragId(o.id); }}
      onDragEnd={() => setDragId(null)}
      style={{ cursor: o.done ? "default" : "grab", opacity: dragId === o.id ? 0.45 : 1 }}>
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={o.done} onChange={() => toggle(o)}
          className="w-4 h-4 accent-emerald-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${o.done ? "line-through text-stone-400" : "text-stone-800"}`}>
            {o.title || courseName(o.course_id) || "—"}
          </p>
          <p className="text-xs text-stone-400 flex items-center gap-1 flex-wrap">
            {o.course_id && (
              <><span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: courseColor(o.course_id) }} />
              {courseName(o.course_id)}</>
            )}
            {o.target_minutes > 0 && <span>{o.course_id ? " · " : ""}{o.target_minutes} min</span>}
            {o.scheduled_time && <span className="font-medium text-stone-500"> · {o.scheduled_time}</span>}
            {o.recurrence && (
              <span className="font-semibold" style={{ color: "#A8A09A" }}>
                {" "}· ↻ {o.recurrence === "daily" ? "quotidien" : "hebdo"}
              </span>
            )}
          </p>
        </div>
        <button onClick={() => startEdit(o)} className="text-stone-300 hover:text-accent text-xs shrink-0" title="Modifier">✎</button>
        {!o.done && (
          <div className="relative shrink-0">
            <button onClick={() => setShowPostpone(p => !p)}
              title="Reporter" className="text-stone-300 hover:text-amber-500">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
                <polyline points="8 14 8.01 14"/><polyline points="12 14 12.01 14"/>
                <path d="M16 14l2 2 4-4"/>
              </svg>
            </button>
            {showPostpone && (
              <div className="absolute right-0 bottom-full mb-1 rounded-xl shadow-lg z-20 min-w-[170px] overflow-hidden bg-white"
                style={{ border: "1px solid #E8E2DC" }}>
                <button
                  onClick={() => { postpone(o.id, tomorrow); setShowPostpone(false); }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-stone-50 font-medium"
                  style={{ color: "#1F1A17", borderBottom: "1px solid #F7F3EF" }}>
                  Reporter à demain
                </button>
                <div className="px-3 py-2">
                  <p className="text-[10px] mb-1" style={{ color: "#A8A09A" }}>Autre date</p>
                  <input type="date" className="input text-xs py-1" min={tomorrow}
                    value={customDate}
                    onChange={e => setCustomDate(e.target.value)}
                    onBlur={e => {
                      if (e.target.value && e.target.value >= tomorrow) {
                        postpone(o.id, e.target.value);
                        setShowPostpone(false);
                        setCustomDate("");
                      }
                    }} />
                </div>
              </div>
            )}
          </div>
        )}
        <button onClick={() => remove(o.id)} className="text-stone-300 hover:text-red-600 text-xs shrink-0">✕</button>
      </div>
      {o.target_minutes > 0 && (
        <div className="flex items-center gap-2 mt-1 pl-6 flex-wrap">
          <span className="text-[10px]" style={{ color: "#A8A09A" }}>
            Prévu {o.target_minutes} min · Réel {realSecs > 0 ? `${realMin} min` : "—"}
          </span>
          {realSecs >= o.target_minutes * 60 ? (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: "#EAFBF4", color: "#0E8F68" }}>Objectif atteint</span>
          ) : realSecs > 0 ? (
            <span className="text-[10px]" style={{ color: "#7C746E" }}>
              — reste {o.target_minutes - realMin} min
            </span>
          ) : null}
        </div>
      )}
    </li>
  );
}

// ── DayPanel ──────────────────────────────────────────────────
function DayPanel() {
  const { selectedDate, courses, dayObjectives, title, setTitle, courseId, setCourseId,
          minutes, setMinutes, newTime, setNewTime, recurrence, setRecurrence, addObjective,
          addExam, removeExam, examsByDate, t } = usePlan();
  const [showExamForm, setShowExamForm] = useState(false);
  const [examForm, setExamForm] = useState({ name: "", courseId: "", time: "", location: "" });

  const d        = dateFromYmd(selectedDate);
  const dayExams = examsByDate[selectedDate] || [];

  async function handleAddExam(e) {
    e.preventDefault();
    if (!examForm.name.trim()) return;
    await addExam({
      name:      examForm.name.trim(),
      course_id: examForm.courseId || null,
      exam_date: selectedDate,
      exam_time: examForm.time     || null,
      location:  examForm.location || null,
    });
    setExamForm({ name: "", courseId: "", time: "", location: "" });
    setShowExamForm(false);
  }

  return (
    <section className="card p-4">
      <h2 className="text-base mb-1 font-display capitalize">
        {d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
      </h2>
      <p className="text-xs text-stone-400 mb-3">
        {dayObjectives.length} objectif{dayObjectives.length > 1 ? "s" : ""}
        {dayExams.length > 0 && ` · ${dayExams.length} examen${dayExams.length > 1 ? "s" : ""}`}
      </p>

      {dayExams.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {dayExams.map(e => {
            const days  = daysUntil(e.exam_date);
            const label = days === 0 ? "Aujourd'hui" : days === 1 ? "Demain" : days > 0 ? `J-${days}` : "Passé";
            return (
              <div key={e.id} className="flex items-center gap-2 rounded-xl px-3 py-2"
                style={{ backgroundColor: "#FEF2F2", border: "1px solid #FECACA" }}>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0"
                  style={{ backgroundColor: "#DC2626", color: "#fff" }}>Examen</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "#1F1A17" }}>{e.name}</p>
                  {(e.location || e.exam_time) && (
                    <p className="text-xs" style={{ color: "#7C746E" }}>
                      {[e.exam_time, e.location].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <span className="text-xs font-bold shrink-0"
                  style={{ color: days <= 3 ? "#DC2626" : "#0E8F68" }}>{label}</span>
                <button onClick={() => removeExam(e.id)} className="shrink-0 text-stone-300 hover:text-red-400">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <ul className="space-y-2 mb-3">
        {dayObjectives.length === 0 && dayExams.length === 0 && (
          <li className="text-sm text-stone-400">{t("plan.nothing")}</li>
        )}
        {dayObjectives.map(o => <ObjectiveRow key={o.id} o={o} />)}
      </ul>

      <form onSubmit={addObjective} className="space-y-2 border-t border-stone-100 pt-3">
        <input className="input" value={title} onChange={e => setTitle(e.target.value)}
          placeholder={t("plan.newObjective")} />
        <div className="flex gap-2">
          <select className="input" value={courseId} onChange={e => setCourseId(e.target.value)}>
            <option value="">Cours —</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input className="input w-24" type="number" min={5} step={5} placeholder="min"
            value={minutes} onChange={e => setMinutes(e.target.value)} />
        </div>
        <input className="input" type="time" value={newTime} onChange={e => setNewTime(e.target.value)} />
        <select className="input" value={recurrence} onChange={e => setRecurrence(e.target.value)}>
          <option value="">Aucune répétition</option>
          <option value="daily">Répéter chaque jour</option>
          <option value="weekly">Répéter chaque semaine</option>
        </select>
        <button className="btn-primary w-full">{t("common.add")}</button>
      </form>

      <div className="mt-3 border-t border-stone-100 pt-3">
        {!showExamForm ? (
          <button onClick={() => setShowExamForm(true)}
            className="w-full text-xs font-medium py-2 rounded-xl transition-colors flex items-center justify-center gap-1.5"
            style={{ color: "#DC2626", border: "1px dashed #FECACA" }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Ajouter un examen
          </button>
        ) : (
          <form onSubmit={handleAddExam} className="space-y-2">
            <p className="text-xs font-semibold" style={{ color: "#DC2626" }}>Nouvel examen</p>
            <input className="input text-sm" value={examForm.name} required
              onChange={e => setExamForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Nom de l'examen…" />
            <div className="flex gap-2">
              <select className="input text-sm flex-1" value={examForm.courseId}
                onChange={e => setExamForm(f => ({ ...f, courseId: e.target.value }))}>
                <option value="">Matière —</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input className="input w-24 text-sm" type="time" value={examForm.time}
                onChange={e => setExamForm(f => ({ ...f, time: e.target.value }))} />
            </div>
            <input className="input text-sm" value={examForm.location}
              onChange={e => setExamForm(f => ({ ...f, location: e.target.value }))}
              placeholder="Salle / lieu (optionnel)" />
            <div className="flex gap-2">
              <button type="submit" className="flex-1 py-1.5 rounded-xl text-xs font-semibold"
                style={{ backgroundColor: "#DC2626", color: "#fff" }}>
                Ajouter l'examen
              </button>
              <button type="button" onClick={() => setShowExamForm(false)} className="btn-ghost text-xs flex-1">Annuler</button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

// ── Legend ────────────────────────────────────────────────────
function Legend() {
  const { courses, t } = usePlan();
  if (!courses.length) return null;
  return (
    <div className="card px-5 py-4 mt-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider mb-3"
        style={{ color: "var(--bt-text-4)" }}>
        {t("plan.legend")}
      </p>
      <div className="flex flex-wrap gap-2">
        {courses.map(c => (
          <span key={c.id}
            className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-full"
            style={{
              backgroundColor: "var(--bt-subtle)",
              border: "1px solid var(--bt-border)",
              color: "var(--bt-text-1)",
            }}>
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
            {c.name}
          </span>
        ))}
      </div>
    </div>
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

// ── UpcomingExamsStrip ────────────────────────────────────────
function UpcomingExamsStrip() {
  const { exams, courseColor } = usePlan();
  const today = todayISO();
  const upcoming = exams
    .filter(e => e.exam_date >= today)
    .sort((a, b) => a.exam_date.localeCompare(b.exam_date))
    .slice(0, 8);
  if (!upcoming.length) return null;
  return (
    <div className="card px-4 py-3 mb-5">
      <h3 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "#A8A09A" }}>
        Examens à venir
      </h3>
      <div className="flex flex-wrap gap-2">
        {upcoming.map(e => {
          const days   = daysUntil(e.exam_date);
          const label  = days === 0 ? "Aujourd'hui" : days === 1 ? "Demain" : `J-${days}`;
          const urgent = days <= 3;
          return (
            <div key={e.id} className="flex items-center gap-2 px-3 py-2 rounded-2xl"
              style={{
                backgroundColor: urgent ? "#FEF2F2" : "#F7F3EF",
                border: `1px solid ${urgent ? "#FECACA" : "#E8E2DC"}`,
              }}>
              {e.course_id && (
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: courseColor(e.course_id) }} />
              )}
              <span className="font-medium text-sm" style={{ color: urgent ? "#DC2626" : "#1F1A17" }}>{e.name}</span>
              <span className="text-xs font-bold" style={{ color: urgent ? "#DC2626" : "#0E8F68" }}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── ObjectivesToggle ──────────────────────────────────────────
function ObjectivesToggle() {
  const { showObjectives, setShowObjectives, dayObjectives, examsByDate, selectedDate, t } = usePlan();
  const examCount = (examsByDate[selectedDate] || []).length;
  const total = dayObjectives.length + examCount;

  if (!showObjectives) {
    return (
      <button
        onClick={() => setShowObjectives(true)}
        className="card w-full p-5 text-left transition-all"
        style={{ display: "block" }}
        onMouseEnter={e => e.currentTarget.style.borderColor = "#14B885"}
        onMouseLeave={e => e.currentTarget.style.borderColor = "var(--bt-border)"}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: "var(--bt-accent-bg)", color: "#0E8F68" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </span>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>
                {t("plan.addGoals")}
              </p>
              {total > 0 && (
                <p className="text-xs mt-0.5" style={{ color: "var(--bt-text-3)" }}>
                  {dayObjectives.length > 0 && `${dayObjectives.length} objectif${dayObjectives.length > 1 ? "s" : ""}`}
                  {dayObjectives.length > 0 && examCount > 0 && " · "}
                  {examCount > 0 && `${examCount} examen${examCount > 1 ? "s" : ""}`}
                </p>
              )}
            </div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ color: "var(--bt-text-4)", flexShrink: 0 }}>
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </div>
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => setShowObjectives(false)}
        className="flex items-center gap-1.5 text-xs font-medium transition-colors px-1"
        style={{ color: "var(--bt-text-3)" }}
        onMouseEnter={e => e.currentTarget.style.color = "var(--bt-text-2)"}
        onMouseLeave={e => e.currentTarget.style.color = "var(--bt-text-3)"}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        {t("plan.collapse")}
      </button>
      <DayPanel />
    </div>
  );
}

// ── DayDetailModal ────────────────────────────────────────────
function DayDetailModal() {
  const { modalDate, setModalDate, byDate, examsByDate, sessions, courses,
          courseColor, courseName, toggle, remove,
          addObjectiveForDate, saveObjEdit, removeExam, lang, t } = usePlan();

  const [showAddForm, setShowAddForm] = useState(false);
  const [formTitle, setFormTitle]     = useState("");
  const [formCourseId, setFormCourseId] = useState("");
  const [formMinutes, setFormMinutes] = useState("");
  const [formTime, setFormTime]       = useState("");

  // Inline edit state
  const [editingObjId, setEditingObjId] = useState(null);
  const [editForm, setEditForm]         = useState({});

  function startInlineEdit(o) {
    setEditingObjId(o.id);
    setEditForm({ title: o.title || "", courseId: o.course_id || "", minutes: o.target_minutes || "", time: o.scheduled_time || "" });
  }

  async function handleInlineSave(e) {
    e.preventDefault();
    await saveObjEdit(editingObjId, editForm);
    setEditingObjId(null);
  }

  if (!modalDate) return null;

  const locale     = lang === "en" ? "en-GB" : "fr-FR";
  const d          = dateFromYmd(modalDate);
  const today      = todayISO();
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
    const data = await addObjectiveForDate(modalDate, {
      title: formTitle, courseId: formCourseId, minutes: formMinutes, time: formTime,
    });
    if (data) {
      setFormTitle(""); setFormCourseId(""); setFormMinutes(""); setFormTime("");
      setShowAddForm(false);
    }
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

            {/* ── Exams ── */}
            {exams.length > 0 && (
              <div className="mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--bt-text-4)" }}>
                  {t("plan.dayExams")}
                </p>
                <div className="space-y-2">
                  {exams.map(ex => {
                    const days  = daysUntil(ex.exam_date);
                    const label = days === 0 ? t("common.today") : days === 1 ? "Demain" : days > 0 ? `J-${days}` : t("plan.dayOverdue");
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
                        <span className="text-xs font-bold shrink-0" style={{ color: days <= 3 ? "#DC2626" : "#0E8F68" }}>{label}</span>
                        <button onClick={() => removeExam(ex.id)} className="shrink-0" style={{ color: "#FECACA" }}
                          onMouseEnter={ev => ev.currentTarget.style.color = "#DC2626"}
                          onMouseLeave={ev => ev.currentTarget.style.color = "#FECACA"}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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
                  const statusLabel = o.done ? t("plan.dayDone") : isPast ? t("plan.dayOverdue") : t("plan.dayTodo");
                  const statusColor = o.done ? "#0E8F68" : isPast ? "#DC2626" : "var(--bt-text-3)";
                  const statusBg    = o.done ? "#EAFBF4"  : isPast ? "#FEF2F2"  : "var(--bt-subtle)";
                  const isEditing   = editingObjId === o.id;

                  return (
                    <div key={o.id} className="rounded-2xl overflow-hidden"
                      style={{ border: `1px solid ${isEditing ? "#14B885" : "var(--bt-border)"}`, transition: "border-color 0.15s" }}>

                      {/* ── View mode ── */}
                      {!isEditing && (
                        <div className="flex items-start gap-3 px-4 py-3"
                          style={{ backgroundColor: "var(--bt-subtle)" }}>
                          <input type="checkbox" checked={o.done} onChange={() => toggle(o)}
                            className="w-4 h-4 mt-0.5 accent-emerald-600 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {o.course_id && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: courseColor(o.course_id) }} />}
                              <p className={`text-sm font-medium flex-1 min-w-0 ${o.done ? "line-through" : ""}`}
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
                      )}

                      {/* ── Inline edit mode ── */}
                      {isEditing && (
                        <form onSubmit={handleInlineSave} className="px-4 py-3 space-y-2.5"
                          style={{ backgroundColor: "var(--bt-surface)" }}>
                          <input className="input text-sm" value={editForm.title} autoFocus
                            onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                            placeholder={t("plan.newObjective")} />
                          <div className="flex gap-2">
                            <select className="input text-sm flex-1" value={editForm.courseId}
                              onChange={e => setEditForm(f => ({ ...f, courseId: e.target.value }))}>
                              <option value="">Cours —</option>
                              {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <input className="input w-20 text-sm" type="number" min={5} step={5} placeholder="min"
                              value={editForm.minutes}
                              onChange={e => setEditForm(f => ({ ...f, minutes: e.target.value }))} />
                          </div>
                          <input className="input text-sm" type="time" value={editForm.time}
                            onChange={e => setEditForm(f => ({ ...f, time: e.target.value }))} />
                          <div className="flex gap-2">
                            <button type="submit" className="btn-primary flex-1 text-sm py-2">{t("common.save")}</button>
                            <button type="button" onClick={() => setEditingObjId(null)} className="btn-ghost flex-1 text-sm py-2">{t("common.cancel")}</button>
                          </div>
                        </form>
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
                <form onSubmit={handleAdd} className="space-y-2.5 p-4 rounded-2xl"
                  style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}>
                  <input className="input text-sm" value={formTitle}
                    onChange={e => setFormTitle(e.target.value)}
                    placeholder={t("plan.newObjective")} autoFocus />
                  <div className="flex gap-2">
                    <select className="input text-sm flex-1" value={formCourseId}
                      onChange={e => setFormCourseId(e.target.value)}>
                      <option value="">Cours —</option>
                      {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <input className="input w-20 text-sm" type="number" min={5} step={5} placeholder="min"
                      value={formMinutes} onChange={e => setFormMinutes(e.target.value)} />
                  </div>
                  <input className="input text-sm" type="time" value={formTime}
                    onChange={e => setFormTime(e.target.value)} />
                  <div className="flex gap-2">
                    <button type="submit" className="btn-primary flex-1 text-sm py-2">{t("common.add")}</button>
                    <button type="button" onClick={() => setShowAddForm(false)} className="btn-ghost flex-1 text-sm py-2">{t("common.cancel")}</button>
                  </div>
                </form>
              )
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── MonthView ─────────────────────────────────────────────────
function MonthView() {
  const { cursor, byDate, examsByDate, selectedDate, setSelectedDate, setModalDate, courseColor, dragId, setDragId, postpone } = usePlan();
  const grid  = buildMonthGrid(cursor.year, cursor.month);
  const today = todayISO();

  // Split into 6 rows of 7
  const weeks = Array.from({ length: 6 }, (_, i) => grid.slice(i * 7, i * 7 + 7));

  return (
    <section className="card overflow-hidden lg:col-span-2">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b" style={{ borderColor: "var(--bt-border)" }}>
        {WEEKDAYS_SHORT.map((d, i) => (
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
                <button key={key} onClick={() => { setSelectedDate(key); if (inMonth) setModalDate(key); }}
                  onDragOver={e => { if (dragId) { e.preventDefault(); e.currentTarget.style.outline = "2px dashed #14B885"; e.currentTarget.style.outlineOffset = "-2px"; } }}
                  onDragLeave={e => { e.currentTarget.style.outline = ""; }}
                  onDrop={e => { e.preventDefault(); e.currentTarget.style.outline = ""; if (dragId) { postpone(dragId, key); setDragId(null); setSelectedDate(key); } }}
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

                  {/* Events */}
                  <div className="space-y-0.5">
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
  const { byDate, examsByDate, selectedDate, setSelectedDate, courseColor, setNewTime, startEdit } = usePlan();
  const today = todayISO();

  function handleSlotClick(key, h) {
    setSelectedDate(key);
    if (h !== null) setNewTime(String(h).padStart(2,"0") + ":00");
  }

  return (
    <div className="card overflow-hidden flex flex-col">
      <div className="grid border-b border-stone-200 bg-white sticky top-0 z-20"
        style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)` }}>
        <div className="border-r border-stone-100" />
        {days.map((d, i) => {
          const key     = ymd(d);
          const isToday = key === today;
          const isSel   = key === selectedDate;
          return (
            <button key={key} onClick={() => setSelectedDate(key)}
              className="py-2 text-center transition"
              style={{ borderRight: "1px solid #E8E2DC", backgroundColor: isSel ? "#EAFBF4" : "" }}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.backgroundColor = "#F7F3EF"; }}
              onMouseLeave={e => { if (!isSel) e.currentTarget.style.backgroundColor = isSel ? "#EAFBF4" : ""; }}>
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#A8A09A" }}>{WEEKDAYS_SHORT[i % 7]}</p>
              <span className="mt-0.5 inline-flex w-7 h-7 items-center justify-center rounded-full text-sm font-semibold"
                style={isToday ? { backgroundColor: "#14B885", color: "#fff" }
                  : isSel ? { backgroundColor: "#EAFBF4", color: "#0E8F68" }
                  : { color: "#1F1A17" }}>
                {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid border-b border-stone-200 bg-stone-50/60 min-h-[36px]"
        style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)` }}>
        <div className="border-r border-stone-100 flex items-center justify-center px-1">
          <span className="text-[10px] text-stone-400 font-medium">Tj.</span>
        </div>
        {days.map(d => {
          const key       = ymd(d);
          const items     = (byDate[key] || []).filter(o => !o.scheduled_time);
          const examItems = examsByDate[key] || [];
          return (
            <div key={key} className="border-r border-stone-100 p-0.5 space-y-0.5 cursor-pointer hover:bg-stone-100/50"
              onClick={() => handleSlotClick(key, null)}>
              {items.map(o => (
                <div key={o.id} className="text-[11px] rounded px-1.5 py-0.5 truncate text-white font-medium"
                  style={{ backgroundColor: courseColor(o.course_id) }}
                  title={o.title}
                  onClick={e => { e.stopPropagation(); setSelectedDate(key); startEdit(o); }}>
                  {o.title}
                </div>
              ))}
              {examItems.map(e => (
                <div key={e.id} className="text-[11px] rounded px-1.5 py-0.5 truncate font-bold"
                  style={{ backgroundColor: "#DC2626", color: "#fff" }}
                  title={e.name}
                  onClick={ev => { ev.stopPropagation(); setSelectedDate(key); }}>
                  Examen : {e.name}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: 520 }}>
        {HOURS.map(h => (
          <div key={h} className="grid border-b border-stone-100"
            style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)`, minHeight: 64 }}>
            <div className="border-r border-stone-100 px-2 pt-1.5 shrink-0">
              <span className="text-xs text-stone-400">{String(h).padStart(2,"0")}h</span>
            </div>
            {days.map(d => {
              const key      = ymd(d);
              const isToday  = key === today;
              const slotObjs = (byDate[key] || []).filter(o => getHour(o.scheduled_time) === h);
              return (
                <div key={key}
                  className="p-0.5 cursor-pointer transition"
                  style={{ borderRight: "1px solid #E8E2DC", backgroundColor: isToday ? "#F0FBF6" : "" }}
                  onMouseEnter={e => { if (!isToday) e.currentTarget.style.backgroundColor = "#F7F3EF"; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = isToday ? "#F0FBF6" : ""; }}
                  onClick={() => handleSlotClick(key, h)}>
                  {slotObjs.map(o => (
                    <div key={o.id}
                      className="text-[11px] rounded px-1.5 py-1 mb-0.5 text-white font-medium cursor-pointer hover:brightness-90 truncate"
                      style={{ backgroundColor: courseColor(o.course_id) }}
                      title={o.title}
                      onClick={e => { e.stopPropagation(); setSelectedDate(key); startEdit(o); }}>
                      <span className="block truncate">{o.title}</span>
                      <span className="opacity-80 text-[10px]">{o.target_minutes} min</span>
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

// ── Main component ────────────────────────────────────────────
export default function Planning() {
  const { user, profile, refreshProfile } = useAuth();
  const { t, lang } = useI18n();
  const [view, setView]             = useState("month");
  const [courses, setCourses]       = useState([]);
  const [objectives, setObjectives] = useState([]);
  const [exams, setExams]           = useState([]);
  const [sessions, setSessions]     = useState([]);
  const [cursor, setCursor]         = useState(() => {
    const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [title, setTitle]         = useState("");
  const [courseId, setCourseId]   = useState("");
  const [minutes, setMinutes]     = useState("");
  const [newTime, setNewTime]     = useState("");
  const [recurrence, setRecurrence] = useState("");
  const [dragId, setDragId]       = useState(null);
  const [editingId, setEditingId]   = useState(null);
  const [editForm, setEditForm]     = useState({});
  const [showObjectives, setShowObjectives] = useState(false);
  const [modalDate, setModalDate] = useState(null);
  const prevSelectedDate = useRef(null);

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
  }, [user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (view === "month") {
      const d = dateFromYmd(selectedDate);
      setCursor({ year: d.getFullYear(), month: d.getMonth() });
    }
  }, [view]); // eslint-disable-line

  // Auto-open panel when navigating to a date that has content
  useEffect(() => {
    if (selectedDate === prevSelectedDate.current) return;
    prevSelectedDate.current = selectedDate;
    const hasContent = (byDate[selectedDate] || []).length > 0 || (examsByDate[selectedDate] || []).length > 0;
    setShowObjectives(hasContent);
  }, [selectedDate]); // eslint-disable-line

  async function addObjective(e) {
    e.preventDefault();
    if (!title.trim() && !courseId) return;
    const { data } = await supabase.from("objectives")
      .insert({ user_id: user.id, title: title.trim(), course_id: courseId || null,
        target_minutes: Number(minutes) || 0, scheduled_date: selectedDate,
        scheduled_time: newTime || null, recurrence: recurrence || null })
      .select().single();
    if (data) setObjectives(p => [...p, data]);
    setTitle(""); setMinutes(""); setNewTime(""); setRecurrence("");
  }

  async function toggle(o) {
    const { data } = await supabase.from("objectives").update({ done: !o.done }).eq("id", o.id).select().single();
    if (data) {
      setObjectives(p => p.map(x => x.id === o.id ? data : x));
      notifyXPChanged();
      if (!o.done && o.recurrence) {
        const days = o.recurrence === "daily" ? 1 : 7;
        const nextDate = addDays(o.scheduled_date, days);
        const alreadyExists = objectives.some(x =>
          !x.done && x.title === o.title && x.course_id === o.course_id && x.scheduled_date === nextDate
        );
        if (!alreadyExists) {
          const { data: next } = await supabase.from("objectives")
            .insert({ user_id: user.id, title: o.title, course_id: o.course_id,
              target_minutes: o.target_minutes, scheduled_date: nextDate,
              scheduled_time: o.scheduled_time || null, recurrence: o.recurrence, done: false })
            .select().single();
          if (next) setObjectives(p => [...p, next]);
        }
      }
    }
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
    }
  }

  async function removeExam(id) {
    await supabase.from("exams").delete().eq("id", id);
    setExams(p => p.filter(x => x.id !== id));
  }

  async function addObjectiveForDate(date, { title: ft, courseId: fc, minutes: fm, time: fti }) {
    if (!ft.trim() && !fc) return null;
    const { data } = await supabase.from("objectives")
      .insert({ user_id: user.id, title: ft.trim(), course_id: fc || null,
        target_minutes: Number(fm) || 0, scheduled_date: date,
        scheduled_time: fti || null, recurrence: null })
      .select().single();
    if (data) setObjectives(p => [...p, data]);
    return data;
  }

  function startEdit(o) {
    setEditingId(o.id);
    setEditForm({ title: o.title, courseId: o.course_id || "", minutes: o.target_minutes, time: o.scheduled_time || "", recurrence: o.recurrence || "" });
  }

  async function saveEdit(id) {
    const { data } = await supabase.from("objectives")
      .update({ title: editForm.title.trim(), course_id: editForm.courseId || null,
        target_minutes: Number(editForm.minutes) || 0, scheduled_time: editForm.time || null,
        recurrence: editForm.recurrence || null })
      .eq("id", id).select().single();
    if (data) setObjectives(p => p.map(x => x.id === id ? data : x));
    setEditingId(null);
  }

  async function saveObjEdit(id, form) {
    const { data } = await supabase.from("objectives")
      .update({ title: form.title.trim(), course_id: form.courseId || null,
        target_minutes: Number(form.minutes) || 0, scheduled_time: form.time || null,
        recurrence: form.recurrence || null })
      .eq("id", id).select().single();
    if (data) setObjectives(p => p.map(x => x.id === id ? data : x));
  }

  async function togglePlanningPublic() {
    const next = !profile?.planning_public;
    await supabase.from("profiles").update({ planning_public: next }).eq("id", user.id);
    refreshProfile();
  }

  const courseColor = id => courses.find(c => c.id === id)?.color || "#94a3b8";
  const courseName  = id => courses.find(c => c.id === id)?.name;

  const byDate = objectives.reduce((acc, o) => {
    (acc[o.scheduled_date] = acc[o.scheduled_date] || []).push(o); return acc;
  }, {});

  const examsByDate = exams.reduce((acc, e) => {
    (acc[e.exam_date] = acc[e.exam_date] || []).push(e); return acc;
  }, {});

  const dayObjectives = byDate[selectedDate] || [];

  function shiftDays(n) { const d = dateFromYmd(selectedDate); d.setDate(d.getDate() + n); setSelectedDate(ymd(d)); }
  function shiftMonth(delta) { setCursor(c => { const d = new Date(c.year, c.month + delta, 1); return { year: d.getFullYear(), month: d.getMonth() }; }); }
  function goToday() { const t = todayISO(); setSelectedDate(t); const d = new Date(); setCursor({ year: d.getFullYear(), month: d.getMonth() }); }
  function handlePrev() { if (view==="day") shiftDays(-1); else if (view==="week") shiftDays(-7); else shiftMonth(-1); }
  function handleNext() { if (view==="day") shiftDays(1);  else if (view==="week") shiftDays(7);  else shiftMonth(1); }

  function periodLabel() {
    if (view === "day") return dateFromYmd(selectedDate).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long", year:"numeric" });
    if (view === "week") {
      const days = getWeekDays(selectedDate), f = days[0], l = days[6];
      return f.getMonth() === l.getMonth()
        ? `${f.getDate()} – ${l.getDate()} ${MONTHS[f.getMonth()]} ${f.getFullYear()}`
        : `${f.getDate()} ${MONTHS[f.getMonth()]} – ${l.getDate()} ${MONTHS[l.getMonth()]} ${l.getFullYear()}`;
    }
    return `${MONTHS[cursor.month]} ${cursor.year}`;
  }

  const ctxValue = {
    view, courses, objectives, byDate, examsByDate, cursor, selectedDate, setSelectedDate,
    title, setTitle, courseId, setCourseId, minutes, setMinutes, newTime, setNewTime,
    recurrence, setRecurrence, dragId, setDragId,
    editingId, setEditingId, editForm, setEditForm,
    dayObjectives, addObjective, toggle, remove, startEdit, saveEdit,
    courseColor, courseName, exams, sessions, postpone, addExam, removeExam,
    showObjectives, setShowObjectives,
    modalDate, setModalDate, addObjectiveForDate, saveObjEdit,
    lang, t,
  };

  return (
    <Ctx.Provider value={ctxValue}>
      <style>{`@media print { aside, nav, header, footer, .no-print { display: none !important; } body { background: white !important; } .card { box-shadow: none !important; } }`}</style>
      <Layout>
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <button onClick={goToday} className="btn-ghost text-xs px-3 py-1.5">{t("common.today")}</button>
          <button onClick={() => window.print()} className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5 no-print">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            PDF
          </button>
          <div className="flex items-center gap-1">
            <button onClick={handlePrev} className="btn-ghost px-2.5 py-1.5 text-lg leading-none">‹</button>
            <button onClick={handleNext} className="btn-ghost px-2.5 py-1.5 text-lg leading-none">›</button>
          </div>
          <h2 className="font-display text-lg capitalize flex-1">{periodLabel()}</h2>
          <div className="flex rounded-xl p-0.5 gap-0.5" style={{ backgroundColor: "#E8E2DC" }}>
            {[["day",t("plan.day")],["week",t("plan.week")],["month",t("plan.month")]].map(([v, label]) => (
              <button key={v} onClick={() => setView(v)}
                className="px-3 py-1.5 rounded-[10px] text-xs font-semibold transition-all"
                style={view === v
                  ? { backgroundColor: "#FFFDFB", color: "#1F1A17", boxShadow: "0 1px 4px rgba(31,26,23,0.10)" }
                  : { color: "#7C746E" }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 mb-5 text-sm text-stone-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!profile?.planning_public}
            onChange={togglePlanningPublic}
            className="w-4 h-4 accent-emerald-600"
          />
          {t("plan.public")}
        </label>

        <UpcomingExamsStrip />

        {view === "month" && (
          <div className="grid gap-5 lg:grid-cols-3">
            <MonthView />
            <div><ObjectivesToggle /></div>
          </div>
        )}
        {view === "week" && (
          <div className="grid gap-5 lg:grid-cols-4">
            <div className="lg:col-span-3"><TimeGrid days={getWeekDays(selectedDate)} /></div>
            <div><ObjectivesToggle /></div>
          </div>
        )}
        {view === "day" && (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2"><TimeGrid days={[dateFromYmd(selectedDate)]} /></div>
            <div><ObjectivesToggle /></div>
          </div>
        )}

        <Legend />
        <RevisionChecklists />
      </Layout>

      {/* Day detail modal — mounted outside Layout to avoid stacking context issues */}
      <DayDetailModal />
    </Ctx.Provider>
  );
}
