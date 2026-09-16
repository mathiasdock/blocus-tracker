import Head from "next/head";
import { useState } from "react";
import { supabase, isOfflineDev } from "../../lib/supabaseClient";
import { COURSE_COLORS } from "../../lib/courseColors";

export function getServerSideProps() {
  return process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_OFFLINE_DEV === "true"
    ? { props: {} } : { notFound: true };
}

// An explicit offline-only rehearsal. Never imports a privileged client or
// writes to the real API. Kept reproducible for Phase 2/regression checks.
export default function PlanningPhaseOneFixture() {
  const [theme, setTheme] = useState("light");
  const [lang, setLang] = useState("fr");
  const [view, setView] = useState("month");
  const [scenario, setScenario] = useState("mixed");
  async function open() {
    if (!isOfflineDev) return;
    await supabase.auth.signInWithPassword(); // offline adapter's fixed demo user
    await supabase.from("courses").select("*"); // initialise this origin's offline seed
    const db = JSON.parse(localStorage.getItem("bt_offline_db_v3"));
    const user_id = "offline-user-mathias";
    const date = offset => {
      const d = new Date(); d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const palette = [COURSE_COLORS[4], COURSE_COLORS[3], COURSE_COLORS[2], COURSE_COLORS[7], COURSE_COLORS[9], COURSE_COLORS[0], COURSE_COLORS[15], COURSE_COLORS[12]];
    const names = ["Lime", "Yellow", "Amber", "Emerald", "Cyan", "Red", "Pink", "Indigo"];
    db.courses = palette.map((color, i) => ({ id: `phase1-course-${i}`, user_id, name: names[i], color,
      exam_date: i === 6 ? date(0) : i === 1 ? date(2) : null, created_at: new Date().toISOString() }));
    db.exams = scenario === "empty" ? [] : [
      { id: "phase1-exam-a", user_id, course_id: db.courses[6].id, name: "Épreuve de marketing — stratégie et études de cas", exam_date: date(0), exam_time: "09:00", location: "Auditorium" },
      { id: "phase1-exam-b", user_id, course_id: db.courses[5].id, name: "Exam 2", exam_date: date(0), exam_time: "14:00" },
      { id: "phase1-exam-past", user_id, course_id: db.courses[5].id, name: "Previous exam", exam_date: date(-2) },
      { id: "phase1-exam-future", user_id, course_id: db.courses[6].id, name: "Final exam", exam_date: date(4) },
    ];
    if (scenario === "empty") db.courses = db.courses.map(c => ({ ...c, exam_date: null }));
    db.objectives = scenario === "empty" ? [] : palette.flatMap((_, i) => [
      { id: `phase1-task-${i}`, user_id, course_id: db.courses[i].id, title: `${names[i]} — Réviser les chapitres`, target_minutes: 45, scheduled_date: date(0), scheduled_time: `${String(9 + i).padStart(2, "0")}:00`, done: i === 2 },
      { id: `phase1-untimed-${i}`, user_id, course_id: db.courses[i].id, title: `${names[i]} — Practice`, target_minutes: 30, scheduled_date: date(1 + (i % 3)), done: false },
    ]);
    if (scenario !== "empty") db.objectives.push({ id: "phase1-unassigned", user_id, course_id: null, title: "Préparer mon matériel", scheduled_date: date(0), target_minutes: 15, done: false });
    localStorage.setItem("bt_offline_db_v3", JSON.stringify(db));
    localStorage.setItem("bt_theme", theme);
    localStorage.setItem("bt_lang_pref", lang);
    localStorage.setItem("bt_plan_view", view);
    window.location.assign("/planning");
  }
  return <main className="p-6 space-y-4">
    <Head><title>Planning Phase 1 — offline fixtures</title><meta name="robots" content="noindex" /></Head>
    <h1>Planning Phase 1 — local test data only</h1>
    <p>Replaces this local origin’s demo courses, objectives and exams. No production data.</p>
    <label className="block">Theme <select value={theme} onChange={e => setTheme(e.target.value)}><option>light</option><option>dark</option></select></label>
    <label className="block">Language <select value={lang} onChange={e => setLang(e.target.value)}><option>fr</option><option>en</option></select></label>
    <label className="block">View <select value={view} onChange={e => setView(e.target.value)}><option>month</option><option>week</option><option>day</option></select></label>
    <label className="block">Scenario <select value={scenario} onChange={e => setScenario(e.target.value)}><option>mixed</option><option>empty</option></select></label>
    <button className="btn-primary min-h-11 px-4" onClick={open}>Open offline Planning</button>
  </main>;
}
