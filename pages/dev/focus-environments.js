import Head from "next/head";
import { useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../../contexts/AuthContext";
import { useI18n } from "../../contexts/I18nContext";
import { useTimer } from "../../contexts/TimerContext";
import { supabase, isOfflineDev } from "../../lib/supabaseClient";
import { clearUserLevelCache } from "../../lib/userLevels";
import { LEVELS } from "../../lib/xp";
import { useChrono } from "../../components/timer/useChrono";
import ChronoFocus from "../../components/timer/ChronoFocus";
import FocusEnvironmentGallery from "../../components/focus/FocusEnvironmentGallery";
import { useFocusEnvironment } from "../../hooks/useFocusEnvironment";

export function getServerSideProps() {
  return process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_OFFLINE_DEV === "true"
    ? { props: {} } : { notFound: true };
}

// Explicit local fixtures. No accounts or study data are written in production.
export default function FocusEnvironmentPreview() {
  const { user } = useAuth();
  const { t, setLang } = useI18n();
  const router = useRouter();
  const timer = useTimer();
  const preferences = useFocusEnvironment();
  const [focus, setFocus] = useState(false);
  const chrono = useChrono({ ownerId: user?.id, enabled: !!user });
  const courses = [{ id: "focus-demo-course", name: "Services Marketing", color: "#EC4899" }];

  async function prepare(level, reset = false) {
    if (!isOfflineDev) return;
    await supabase.auth.signInWithPassword();
    await supabase.from("profiles").select("*");
    const db = JSON.parse(localStorage.getItem("bt_offline_db_v3"));
    db.focus_environment_preview = { level };
    if (reset) delete db.focus_environment_preferences;
    const totalXP = LEVELS.find(item => item.level === level)?.xp || 0;
    db.social_profile_preview = { user_id: "offline-user-mathias", total_xp: totalXP, streak: 3, badge_count: 2 };
    localStorage.setItem("bt_offline_db_v3", JSON.stringify(db));
    clearUserLevelCache();
    window.dispatchEvent(new Event("bt-xp-changed"));
    await preferences.refresh({ force: true });
  }

  function openFocus(pomodoro) {
    timer.setCourseId(courses[0].id);
    chrono.pickMode(pomodoro ? "pomodoro" : "free");
    setFocus(true);
  }

  return <main className="mx-auto max-w-3xl p-5">
    <Head><title>Focus environments — local fixtures</title><meta name="robots" content="noindex" /></Head>
    <h1 className="text-lg font-bold mb-4">Focus Environments · local fixtures</h1>
    <div className="flex flex-wrap gap-3 mb-5">
      <button className="btn-secondary px-3 min-h-11" onClick={() => prepare(1, true)}>New Level 1</button>
      <button className="btn-secondary px-3 min-h-11" onClick={() => prepare(5, true)}>New Level 5</button>
      <button className="btn-secondary px-3 min-h-11" onClick={() => prepare(20)}>Level 20</button>
      <button className="btn-secondary px-3 min-h-11" onClick={() => prepare(1)}>Drop to Level 1</button>
      <button className="btn-secondary px-3 min-h-11" onClick={() => openFocus(false)}>Open Focus</button>
      <button className="btn-secondary px-3 min-h-11" onClick={() => openFocus(true)}>Pomodoro Focus</button>
      <button className="btn-secondary px-3 min-h-11" onClick={() => router.push("/progression")}>Progression</button>
      <button className="btn-secondary px-3 min-h-11" onClick={() => setLang("fr")}>FR</button>
      <button className="btn-secondary px-3 min-h-11" onClick={() => setLang("en")}>EN</button>
      <button className="btn-secondary px-3 min-h-11" onClick={() => document.documentElement.classList.toggle("dark")}>Light / dark</button>
    </div>
    <section className="card p-5"><h2 className="font-bold mb-4">{t("focusEnv.title")}</h2><FocusEnvironmentGallery preferences={preferences} /></section>
    {focus && <ChronoFocus chrono={chrono} courses={courses} onClose={() => setFocus(false)} onFinish={() => timer.reset()} />}
  </main>;
}
