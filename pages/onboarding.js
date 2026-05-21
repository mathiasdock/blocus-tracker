import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabaseClient";

const COLORS = [
  "#10b981", "#84cc16", "#14b8a6", "#0ea5e9",
  "#06b6d4", "#2563eb", "#6366f1", "#8b5cf6",
  "#7c3aed", "#d946ef", "#ec4899", "#f43f5e",
  "#ef4444", "#be123c", "#f97316", "#f59e0b",
];

const YEARS = [
  "BAC 1", "BAC 2", "BAC 3",
  "Année préparatoire", "Année passerelle",
  "Master 1", "Master 2",
  "Année de spécialisation", "Certificat / formation courte",
  "Doctorat", "Formation continue", "Autre",
];

const STEPS = ["Bienvenue", "Tes matières", "Ta filière", "C'est parti !"];

export default function Onboarding() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);

  // Step 1 – courses
  const [courses, setCourses] = useState([]);
  const [newCourse, setNewCourse] = useState("");
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [adding, setAdding] = useState(false);

  // Step 2 – study field & year
  const [studyField, setStudyField] = useState("");
  const [studyYear, setStudyYear] = useState("");
  const [studyYearCustom, setStudyYearCustom] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    if (typeof window !== "undefined") {
      if (localStorage.getItem(`bt_onboarded_${user.id}`) === "true") {
        router.replace("/dashboard");
      }
    }
  }, [user, loading, router]);

  async function addCourse(e) {
    e.preventDefault();
    const name = newCourse.trim();
    if (!name) return;
    setAdding(true);
    const { data } = await supabase
      .from("courses")
      .insert({ user_id: user.id, name, color: newColor })
      .select()
      .single();
    setAdding(false);
    if (data) { setCourses(prev => [...prev, data]); setNewCourse(""); }
  }

  async function saveFieldYear() {
    setSavingInfo(true);
    const actualYear = studyYear === "Autre"
      ? (studyYearCustom.trim() || "Autre")
      : studyYear;
    await supabase.from("profiles").update({
      study_field: studyField.trim() || null,
      study_year:  actualYear || null,
    }).eq("id", user.id);
    setSavingInfo(false);
    setStep(3);
  }

  function finish() {
    localStorage.setItem(`bt_onboarded_${user.id}`, "true");
    router.replace("/dashboard");
  }

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl text-stone-900 dark:text-stone-100">
            blocus<span className="text-accent">·</span>tracker
          </h1>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                i < step ? "bg-accent text-white" :
                i === step ? "bg-accent text-white ring-4 ring-accent/20" :
                "bg-stone-200 dark:bg-stone-700 text-stone-400"
              }`}>
                {i < step ? "✓" : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-0.5 rounded ${i < step ? "bg-accent" : "bg-stone-200 dark:bg-stone-700"}`} />
              )}
            </div>
          ))}
        </div>

        {/* ── Step 0: Welcome ──────────────────────────────────── */}
        {step === 0 && (
          <div className="card p-8 text-center space-y-5">
            <div className="text-5xl">👋</div>
            <h2 className="text-2xl">Bienvenue{profile?.first_name ? `, ${profile.first_name}` : ""} !</h2>
            <p className="text-stone-500 text-sm leading-relaxed">
              blocus·tracker t&apos;aide à suivre tes heures d&apos;étude,
              organiser ton planning et rester motivé avec tes amis.
            </p>
            <div className="grid grid-cols-3 gap-3 pt-2 text-center text-xs text-stone-600">
              <div className="bg-stone-50 rounded-xl p-3">
                <div className="text-2xl mb-1">⏱</div>
                Chronomètre par matière
              </div>
              <div className="bg-stone-50 rounded-xl p-3">
                <div className="text-2xl mb-1">📊</div>
                Stats & progression
              </div>
              <div className="bg-stone-50 rounded-xl p-3">
                <div className="text-2xl mb-1">👥</div>
                Réseau d&apos;amis
              </div>
            </div>
            <button className="btn-primary w-full text-base py-3" onClick={() => setStep(1)}>
              Commencer →
            </button>
          </div>
        )}

        {/* ── Step 1: Add courses ──────────────────────────────── */}
        {step === 1 && (
          <div className="card p-8 space-y-5">
            <div>
              <h2 className="text-2xl mb-1">Tes matières</h2>
              <p className="text-stone-500 text-sm">
                Ajoute au moins une matière pour commencer à tracker tes sessions.
              </p>
            </div>

            <form onSubmit={addCourse} className="space-y-3">
              <input
                className="input"
                placeholder="Ex : Droit civil, Maths, Marketing…"
                value={newCourse}
                onChange={e => setNewCourse(e.target.value)}
              />
              <div className="flex flex-wrap gap-2 items-center">
                {COLORS.map(col => (
                  <button type="button" key={col}
                    onClick={() => setNewColor(col)}
                    className={`w-7 h-7 rounded-full border-2 transition-transform ${newColor === col ? "border-stone-700 scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: col }} />
                ))}
              </div>
              <button className="btn-primary w-full" type="submit" disabled={adding || !newCourse.trim()}>
                {adding ? "Ajout…" : "+ Ajouter la matière"}
              </button>
            </form>

            {courses.length > 0 && (
              <ul className="space-y-1.5">
                {courses.map(c => (
                  <li key={c.id} className="flex items-center gap-2 text-sm px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-800">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                    <span className="font-medium">{c.name}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex gap-2 pt-1">
              <button className="btn-ghost flex-1" onClick={() => setStep(0)}>← Retour</button>
              <button
                className="btn-primary flex-1"
                onClick={() => setStep(2)}
                disabled={courses.length === 0}>
                Continuer →
              </button>
            </div>
            {courses.length === 0 && (
              <p className="text-center text-xs text-stone-400">Ajoute au moins une matière pour continuer.</p>
            )}
          </div>
        )}

        {/* ── Step 2: Study field & year ───────────────────────── */}
        {step === 2 && (
          <div className="card p-8 space-y-5">
            <div>
              <h2 className="text-2xl mb-1">Ta filière</h2>
              <p className="text-stone-500 text-sm">
                Ces infos apparaîtront sur ton profil. Tu pourras les modifier plus tard.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">Filière / domaine d&apos;études</label>
                <input
                  className="input"
                  placeholder="Ex : Sciences éco, Droit, Médecine…"
                  value={studyField}
                  onChange={e => setStudyField(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Année d&apos;études</label>
                <select
                  className="input"
                  value={studyYear}
                  onChange={e => { setStudyYear(e.target.value); setStudyYearCustom(""); }}
                >
                  <option value="">— Choisir —</option>
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              {studyYear === "Autre" && (
                <div>
                  <label className="label">Précise ton année d&apos;étude</label>
                  <input
                    className="input"
                    placeholder="Ex : 3e année ingénieur…"
                    value={studyYearCustom}
                    onChange={e => setStudyYearCustom(e.target.value)}
                    autoFocus
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button className="btn-ghost flex-1" onClick={() => setStep(1)}>← Retour</button>
              <button
                className="btn-primary flex-1"
                onClick={saveFieldYear}
                disabled={savingInfo}>
                {savingInfo ? "Enregistrement…" : "Continuer →"}
              </button>
            </div>
            <p className="text-center text-xs text-stone-400">
              Ces champs sont optionnels, tu peux passer cette étape.
            </p>
          </div>
        )}

        {/* ── Step 3: Done ─────────────────────────────────────── */}
        {step === 3 && (
          <div className="card p-8 text-center space-y-5">
            <div className="text-5xl">🎉</div>
            <h2 className="text-2xl">Tout est prêt !</h2>
            <p className="text-stone-500 text-sm leading-relaxed">
              Lance ton chronomètre, suis tes sessions et invite tes amis à te rejoindre.
              Bonne étude !
            </p>
            <div className="text-left bg-accent/10 rounded-xl p-4 space-y-2 text-sm text-stone-700">
              <p className="font-medium text-accent-dark">Pour démarrer :</p>
              <p>1. Sélectionne une matière sur le dashboard</p>
              <p>2. Lance le chrono et étudie</p>
              <p>3. Clique sur &quot;Terminer&quot; pour sauvegarder ta session</p>
            </div>
            <button className="btn-primary w-full text-base py-3" onClick={finish}>
              Accéder au dashboard →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
