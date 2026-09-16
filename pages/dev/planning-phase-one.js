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

    // Période de blocus réelle : journées de 6-8 h, 3-4 cours sur une même
    // date, huit objectifs, examens rapprochés et travail sans cours. Les
    // proportions viennent des statistiques de production relevées pendant
    // l'audit (max 8 objectifs/jour, max 4 cours/jour, max 6 examens/jour).
    if (scenario === "dense") {
      db.exams = [
        { id: "phase2-exam-1", user_id, course_id: db.courses[0].id, name: "Comptabilité analytique — session de janvier", exam_date: date(3), exam_time: "08:30", location: "Auditoire P12" },
        { id: "phase2-exam-2", user_id, course_id: db.courses[1].id, name: "Statistiques", exam_date: date(3), exam_time: "14:00" },
        { id: "phase2-exam-3", user_id, course_id: db.courses[2].id, name: "Droit", exam_date: date(3) },
        { id: "phase2-exam-4", user_id, course_id: db.courses[3].id, name: "Marketing international", exam_date: date(9), exam_time: "09:00" },
        { id: "phase2-exam-5", user_id, course_id: db.courses[4].id, name: "Finance d'entreprise", exam_date: date(12), exam_time: "13:00" },
      ];
      const heavy = [
        // aujourd'hui : 8 objectifs, 4 cours + travail sans cours, ~7 h
        [0, [[0, 240, "Finance — annales complètes"], [1, 45, "Stats — exercices"], [1, 30, "Stats — formulaire"],
             [2, 60, "Droit — jurisprudence"], [2, 30, "Droit — fiches"], [3, 45, "Marketing — cas Nespresso"],
             [null, 60, "Trier mes notes"], [4, 20, "Anglais — vocabulaire"]]],
        // demain : une seule matière, journée longue
        [1, [[0, 180, "Finance — chapitre 4"], [0, 150, "Finance — exercices corrigés"]]],
        [2, [[1, 90, "Stats — TP"], [null, 30, "Imprimer les syllabus"]]],
        // veille d'examens : révision légère
        [3, [[0, 45, "Relecture rapide"]]],
        [4, [[2, 120, "Droit — plan de dissertation"], [3, 60, "Marketing — résumé"], [4, 45, "Anglais — oral"]]],
        [5, []],
        [6, [[3, 300, "Marketing — mémoire"]]],
        // passé : du travail non terminé, pour l'état « en retard »
        [-1, [[1, 90, "Stats — série 3"], [2, 60, "Droit — lecture"]]],
        [-2, [[0, 120, "Finance — révision"]]],
      ];
      db.objectives = heavy.flatMap(([offset, rows]) => rows.map(([courseIndex, minutes, title], j) => ({
        id: `phase2-${offset}-${j}`, user_id,
        course_id: courseIndex === null ? null : db.courses[courseIndex].id,
        title, target_minutes: minutes, scheduled_date: date(offset),
        scheduled_time: offset === 0 && j < 2 ? `${String(9 + j * 2).padStart(2, "0")}:00` : null,
        done: offset === 0 && j === 7,
      })));
      db.courses = db.courses.map((c, i) => ({ ...c, exam_date: i === 7 ? date(15) : null }));
    }
    localStorage.setItem("bt_offline_db_v3", JSON.stringify(db));
    localStorage.setItem("bt_theme", theme);
    localStorage.setItem("bt_lang_pref", lang);
    localStorage.setItem("bt_plan_view", view);
    window.location.assign("/planning");
  }
  return <main className="p-6 space-y-4">
    <Head><title>Planning — offline fixtures</title><meta name="robots" content="noindex" /></Head>
    <h1>Planning — local test data only</h1>
    <p>Replaces this local origin’s demo courses, objectives and exams. No production data.</p>
    <label className="block">Theme <select value={theme} onChange={e => setTheme(e.target.value)}><option>light</option><option>dark</option></select></label>
    <label className="block">Language <select value={lang} onChange={e => setLang(e.target.value)}><option>fr</option><option>en</option></select></label>
    <label className="block">View <select value={view} onChange={e => setView(e.target.value)}><option>month</option><option>week</option><option>day</option></select></label>
    <label className="block">Scenario <select value={scenario} onChange={e => setScenario(e.target.value)}><option>mixed</option><option>dense</option><option>empty</option></select></label>
    <button className="btn-primary min-h-11 px-4" onClick={open}>Open offline Planning</button>
  </main>;
}
