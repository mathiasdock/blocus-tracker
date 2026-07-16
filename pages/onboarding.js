import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { COURSE_COLORS } from "../lib/courseColors";

const COLORS = COURSE_COLORS;

// La VALEUR est canonique (stockée telle quelle dans profiles.study_year, donc
// stable quelle que soit la langue) ; le libellé affiché est traduit.
const YEARS = [
  { value: "BAC 1", key: "onboarding.year.bac1" },
  { value: "BAC 2", key: "onboarding.year.bac2" },
  { value: "BAC 3", key: "onboarding.year.bac3" },
  { value: "Année préparatoire", key: "onboarding.year.prep" },
  { value: "Année passerelle", key: "onboarding.year.bridge" },
  { value: "Master 1", key: "onboarding.year.master1" },
  { value: "Master 2", key: "onboarding.year.master2" },
  { value: "Année de spécialisation", key: "onboarding.year.spec" },
  { value: "Certificat / formation courte", key: "onboarding.year.cert" },
  { value: "Doctorat", key: "onboarding.year.phd" },
  { value: "Formation continue", key: "onboarding.year.continuing" },
  { value: "Autre", key: "onboarding.year.other" },
];

const STEP_KEYS = [
  "onboarding.step.welcome",
  "onboarding.step.courses",
  "onboarding.step.field",
  "onboarding.step.ready",
];

export default function Onboarding() {
  const { user, profile, loading } = useAuth();
  const { t } = useI18n();
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
          {STEP_KEYS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                i < step ? "bg-accent text-white" :
                i === step ? "bg-accent text-white ring-4 ring-accent/20" :
                "bg-stone-200 dark:bg-stone-700 text-stone-400"
              }`}>
                {i < step ? "✓" : i + 1}
              </div>
              {i < STEP_KEYS.length - 1 && (
                <div className={`w-8 h-0.5 rounded ${i < step ? "bg-accent" : "bg-stone-200 dark:bg-stone-700"}`} />
              )}
            </div>
          ))}
        </div>

        {/* ── Step 0: Welcome ──────────────────────────────────── */}
        {step === 0 && (
          <div className="card p-8 text-center space-y-5">
            <div className="text-5xl">👋</div>
            <h2 className="text-2xl">{t("onboarding.welcome.hello")}{profile?.first_name ? `, ${profile.first_name}` : ""} !</h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--bt-text-3)" }}>
              {t("onboarding.welcome.subtitle")}
            </p>
            <div className="grid grid-cols-3 gap-3 pt-2 text-center text-xs">
              {["⏱", "📊", "👥"].map((emoji, i) => (
                <div key={emoji} className="rounded-xl p-3"
                  style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)" }}>
                  <div className="text-2xl mb-1">{emoji}</div>
                  {t(`onboarding.welcome.feat${i + 1}`)}
                </div>
              ))}
            </div>
            <button className="btn-primary w-full text-base py-3" onClick={() => setStep(1)}>
              {t("onboarding.welcome.start")} →
            </button>
          </div>
        )}

        {/* ── Step 1: Add courses ──────────────────────────────── */}
        {step === 1 && (
          <div className="card p-8 space-y-5">
            <div>
              <h2 className="text-2xl mb-1">{t("onboarding.courses.title")}</h2>
              <p className="text-sm" style={{ color: "var(--bt-text-3)" }}>
                {t("onboarding.courses.subtitle")}
              </p>
            </div>

            <form onSubmit={addCourse} className="space-y-3">
              <input
                className="input"
                placeholder={t("onboarding.courses.placeholder")}
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
                {adding ? t("onboarding.courses.adding") : t("onboarding.courses.add")}
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
              <button className="btn-ghost flex-1" onClick={() => setStep(0)}>← {t("comm.back")}</button>
              <button
                className="btn-primary flex-1"
                onClick={() => setStep(2)}
                disabled={courses.length === 0}>
                {t("onboarding.continue")} →
              </button>
            </div>
            {courses.length === 0 && (
              <p className="text-center text-xs" style={{ color: "var(--bt-text-3)" }}>{t("onboarding.courses.needOne")}</p>
            )}
          </div>
        )}

        {/* ── Step 2: Study field & year ───────────────────────── */}
        {step === 2 && (
          <div className="card p-8 space-y-5">
            <div>
              <h2 className="text-2xl mb-1">{t("onboarding.field.title")}</h2>
              <p className="text-sm" style={{ color: "var(--bt-text-3)" }}>
                {t("onboarding.field.subtitle")}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">{t("onboarding.field.label")}</label>
                <input
                  className="input"
                  placeholder={t("onboarding.field.placeholder")}
                  value={studyField}
                  onChange={e => setStudyField(e.target.value)}
                />
              </div>

              <div>
                <label className="label">{t("onboarding.year.label")}</label>
                <select
                  className="input"
                  value={studyYear}
                  onChange={e => { setStudyYear(e.target.value); setStudyYearCustom(""); }}
                >
                  <option value="">{t("onboarding.year.choose")}</option>
                  {YEARS.map(y => <option key={y.value} value={y.value}>{t(y.key)}</option>)}
                </select>
              </div>

              {studyYear === "Autre" && (
                <div>
                  <label className="label">{t("onboarding.year.customLabel")}</label>
                  <input
                    className="input"
                    placeholder={t("onboarding.year.customPlaceholder")}
                    value={studyYearCustom}
                    onChange={e => setStudyYearCustom(e.target.value)}
                    autoFocus
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button className="btn-ghost flex-1" onClick={() => setStep(1)}>← {t("comm.back")}</button>
              <button
                className="btn-primary flex-1"
                onClick={saveFieldYear}
                disabled={savingInfo}>
                {savingInfo ? t("onboarding.saving") : `${t("onboarding.continue")} →`}
              </button>
            </div>
            <p className="text-center text-xs" style={{ color: "var(--bt-text-3)" }}>
              {t("onboarding.field.optional")}
            </p>
          </div>
        )}

        {/* ── Step 3: Done ─────────────────────────────────────── */}
        {step === 3 && (
          <div className="card p-8 text-center space-y-5">
            <div className="text-5xl">🎉</div>
            <h2 className="text-2xl">{t("onboarding.done.title")}</h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--bt-text-3)" }}>
              {t("onboarding.done.subtitle")}
            </p>
            <div className="text-left rounded-xl p-4 space-y-2 text-sm"
              style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-text-2)" }}>
              <p className="font-medium" style={{ color: "var(--bt-accent-dark)" }}>{t("onboarding.done.howTitle")}</p>
              <p>{t("onboarding.done.how1")}</p>
              <p>{t("onboarding.done.how2")}</p>
              <p>{t("onboarding.done.how3")}</p>
            </div>
            <button className="btn-primary w-full text-base py-3" onClick={finish}>
              {t("onboarding.done.cta")} →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
