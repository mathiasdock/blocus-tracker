import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import AuthBrand from "../components/AuthBrand";
import UniPicker from "../components/UniPicker";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { clearClientCache } from "../lib/clientCache";
import { COURSE_COLORS } from "../lib/courseColors";
import { supabase } from "../lib/supabaseClient";
import { STUDY_YEARS } from "../lib/studyYears";

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l4 4L19 6" />
    </svg>
  );
}

function LoadingState({ label }) {
  return (
    <div className="card p-6 sm:p-8" aria-busy="true" aria-label={label}>
      <div className="bt-skeleton h-7 w-2/3 rounded-lg" />
      <div className="bt-skeleton mt-3 h-4 w-full rounded-lg" />
      <div className="bt-skeleton mt-2 h-4 w-4/5 rounded-lg" />
      <div className="bt-skeleton mt-7 h-11 w-full rounded-xl" />
      <div className="bt-skeleton mt-5 h-11 w-full rounded-xl" />
    </div>
  );
}

export default function Onboarding() {
  const { user, loading, refreshProfile } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [ready, setReady] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [firstName, setFirstName] = useState("");
  const [loadError, setLoadError] = useState("");

  const [university, setUniversity] = useState("");
  const [customUniversity, setCustomUniversity] = useState("");
  const [useCustomUniversity, setUseCustomUniversity] = useState(false);
  const [savingUniversity, setSavingUniversity] = useState(false);
  const [universityError, setUniversityError] = useState("");

  const [studyField, setStudyField] = useState("");
  const [studyYear, setStudyYear] = useState("");
  const [studyYearCustom, setStudyYearCustom] = useState("");
  const [savingStudyInfo, setSavingStudyInfo] = useState(false);
  const [studyInfoError, setStudyInfoError] = useState("");

  const [courses, setCourses] = useState([]);
  const [newCourse, setNewCourse] = useState("");
  const [newColor, setNewColor] = useState(COURSE_COLORS[0]);
  const [savingCourse, setSavingCourse] = useState(false);
  const [courseError, setCourseError] = useState("");
  const [finishing, setFinishing] = useState(false);

  function goToStep(nextStep) {
    setStep(nextStep);
    try { localStorage.setItem(`bt_onboarding_step_${user.id}`, String(nextStep)); } catch (_) {}
  }

  useEffect(() => {
    if (loading) return undefined;
    if (!user) {
      router.replace("/login");
      return undefined;
    }

    try {
      if (localStorage.getItem(`bt_onboarded_${user.id}`) === "true") {
        router.replace("/dashboard");
        return undefined;
      }
    } catch (_) {}

    let cancelled = false;

    async function loadSetup() {
      setReady(false);
      setLoadError("");
      try {
        const [profileResult, coursesResult] = await Promise.all([
          supabase
            .from("profiles")
            .select("first_name,university,study_field,study_year")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("courses")
            .select("id,name,color,created_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: true })
            .limit(30),
        ]);

        if (cancelled) return;
        if (profileResult.error || coursesResult.error) throw new Error("setup_load_failed");

        const currentProfile = profileResult.data || {};
        const currentCourses = coursesResult.data || [];
        const currentYear = currentProfile.study_year || "";
        const knownYear = STUDY_YEARS.some(year => year.value === currentYear);
        let savedStep = 0;
        try { savedStep = Number(localStorage.getItem(`bt_onboarding_step_${user.id}`)) || 0; } catch (_) {}

        setFirstName(currentProfile.first_name || "");
        setUniversity(currentProfile.university || "");
        setStudyField(currentProfile.study_field || "");
        setStudyYear(knownYear ? currentYear : (currentYear ? "Autre" : ""));
        setStudyYearCustom(knownYear ? "" : currentYear);
        setCourses(currentCourses);

        if (!currentProfile.university) setStep(0);
        else if (savedStep >= 1 && savedStep <= 2) setStep(savedStep);
        else setStep(2);

        setReady(true);
      } catch (_) {
        if (!cancelled) {
          setLoadError(t("onboarding.loadError"));
          setReady(true);
        }
      }
    }

    loadSetup();
    return () => { cancelled = true; };
  }, [user, loading, router, reloadKey, t]);

  const selectedUniversity = useCustomUniversity
    ? customUniversity.trim()
    : university.trim();

  async function saveUniversity(event) {
    event.preventDefault();
    setUniversityError("");
    if (!selectedUniversity) {
      setUniversityError(t("onboarding.university.required"));
      return;
    }

    setSavingUniversity(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ university: selectedUniversity })
        .eq("id", user.id);
      if (error) throw error;

      setUniversity(selectedUniversity);
      setUseCustomUniversity(false);
      await refreshProfile();
      goToStep(1);
    } catch (_) {
      setUniversityError(t("onboarding.saveError"));
    } finally {
      setSavingUniversity(false);
    }
  }

  async function saveStudyInfo(event) {
    event.preventDefault();
    setStudyInfoError("");
    const actualYear = studyYear === "Autre"
      ? (studyYearCustom.trim() || "Autre")
      : studyYear;

    setSavingStudyInfo(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          study_field: studyField.trim() || null,
          study_year: actualYear || null,
        })
        .eq("id", user.id);
      if (error) throw error;

      await refreshProfile();
      goToStep(2);
    } catch (_) {
      setStudyInfoError(t("onboarding.saveError"));
    } finally {
      setSavingStudyInfo(false);
    }
  }

  async function createCourse() {
    const name = newCourse.trim();
    setCourseError("");
    if (!name) {
      setCourseError(t("onboarding.courses.needOne"));
      return null;
    }
    if (courses.some(course => course.name.trim().toLowerCase() === name.toLowerCase())) {
      setCourseError(t("onboarding.courses.duplicate"));
      return null;
    }

    setSavingCourse(true);
    try {
      const { data, error } = await supabase
        .from("courses")
        .insert({ user_id: user.id, name, color: newColor })
        .select("id,name,color,created_at")
        .single();
      if (error || !data) throw error || new Error("course_create_failed");

      clearClientCache(`dashboard:${user.id}:`);
      setCourses(current => [...current, data]);
      setNewCourse("");
      return data;
    } catch (_) {
      setCourseError(t("onboarding.courses.saveError"));
      return null;
    } finally {
      setSavingCourse(false);
    }
  }

  async function addCourse(event) {
    event.preventDefault();
    await createCourse();
  }

  async function finish() {
    setCourseError("");
    setFinishing(true);
    let courseCount = courses.length;

    if (newCourse.trim()) {
      const created = await createCourse();
      if (!created) {
        setFinishing(false);
        return;
      }
      courseCount += 1;
    }

    if (courseCount === 0) {
      setCourseError(t("onboarding.courses.needOne"));
      setFinishing(false);
      return;
    }

    try {
      clearClientCache(`dashboard:${user.id}:`);
      try {
        localStorage.setItem(`bt_onboarded_${user.id}`, "true");
        localStorage.removeItem(`bt_onboarding_step_${user.id}`);
      } catch (_) {}
      await refreshProfile();
      await router.replace("/dashboard");
    } catch (_) {
      setCourseError(t("onboarding.finishError"));
      setFinishing(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-dvh bg-stone-50 px-4 py-7 dark:bg-stone-950 sm:py-10">
        <div className="mx-auto w-full max-w-md">
          <AuthBrand compact subtitle={t("onboarding.subtitle")} />
          <LoadingState label={t("loading.preparing")} />
        </div>
      </main>
    );
  }
  if (!user) return null;

  return (
    <main className="min-h-dvh bg-stone-50 px-4 py-7 dark:bg-stone-950 sm:py-10">
      <div className="mx-auto w-full max-w-md">
        <AuthBrand
          compact
          subtitle={firstName ? `${t("onboarding.hello")} ${firstName}. ${t("onboarding.subtitle")}` : t("onboarding.subtitle")}
        />

        <div className="mb-5" aria-label={`${t("onboarding.stepLabel")} ${step + 1} / 3`}>
          <div className="mb-2 flex items-center justify-between text-xs font-semibold" style={{ color: "var(--bt-text-2)" }}>
            <span>{t("onboarding.stepLabel")} {step + 1} / 3</span>
            <span>{t("onboarding.duration")}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: "var(--bt-border)" }}>
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out motion-reduce:transition-none"
              style={{ width: `${((step + 1) / 3) * 100}%` }}
            />
          </div>
        </div>

        {!ready ? (
          <LoadingState label={t("loading.preparing")} />
        ) : loadError ? (
          <div className="card p-6 text-center sm:p-8">
            <h1 className="text-xl">{t("onboarding.loadErrorTitle")}</h1>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>{loadError}</p>
            <button className="btn-primary mt-6 w-full" onClick={() => setReloadKey(key => key + 1)}>
              {t("onboarding.retry")}
            </button>
          </div>
        ) : (
          <div key={step} className="card bt-rise p-6 sm:p-8">
            {step === 0 && (
              <form onSubmit={saveUniversity} noValidate>
                <div className="mb-6">
                  <h1 className="text-2xl">{t("onboarding.university.title")}</h1>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
                    {t("onboarding.university.subtitle")}
                  </p>
                </div>

                <label className="label" htmlFor="onboarding-university">{t("signup.university")}</label>
                {!useCustomUniversity ? (
                  <>
                    <UniPicker
                      id="onboarding-university"
                      value={university}
                      onChange={value => { setUniversity(value); setUniversityError(""); }}
                      placeholder={t("signup.uniSearch")}
                      error={Boolean(universityError)}
                      ariaDescribedBy={universityError ? "university-error" : "university-help"}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setUseCustomUniversity(true);
                        setCustomUniversity("");
                        setUniversityError("");
                      }}
                      className="mt-2 inline-flex min-h-11 items-center text-sm font-medium transition-colors hover:underline"
                      style={{ color: "var(--bt-text-2)" }}
                    >
                      {t("signup.uniNotFound")}
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      id="onboarding-university"
                      className={`input ${universityError ? "input-error" : ""}`}
                      placeholder={t("signup.uniCustom")}
                      value={customUniversity}
                      onChange={event => { setCustomUniversity(event.target.value); setUniversityError(""); }}
                      maxLength={120}
                      autoComplete="organization"
                      autoFocus
                      aria-invalid={Boolean(universityError)}
                      aria-describedby={universityError ? "university-error" : "university-help"}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setUseCustomUniversity(false);
                        setCustomUniversity("");
                        setUniversityError("");
                      }}
                      className="bt-accent-link mt-2 inline-flex min-h-11 items-center text-sm font-medium hover:underline"
                    >
                      {t("signup.backToList")}
                    </button>
                  </>
                )}

                <p id="university-help" className="mt-1 text-xs leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
                  {t("onboarding.university.help")}
                </p>
                {universityError && <p id="university-error" className="bt-form-error mt-2 text-xs" role="alert">{universityError}</p>}

                <button className="btn-primary mt-6 w-full min-h-11" disabled={savingUniversity} aria-busy={savingUniversity}>
                  {savingUniversity ? t("onboarding.saving") : t("onboarding.continue")}
                </button>
              </form>
            )}

            {step === 1 && (
              <form onSubmit={saveStudyInfo} noValidate>
                <div className="mb-6">
                  <h1 className="text-2xl">{t("onboarding.field.title")}</h1>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
                    {t("onboarding.field.subtitle")}
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="label" htmlFor="onboarding-field">{t("onboarding.field.label")}</label>
                    <input
                      id="onboarding-field"
                      className="input"
                      placeholder={t("onboarding.field.placeholder")}
                      value={studyField}
                      onChange={event => setStudyField(event.target.value)}
                      maxLength={100}
                      autoComplete="organization-title"
                    />
                  </div>

                  <div>
                    <label className="label" htmlFor="onboarding-year">{t("onboarding.year.label")}</label>
                    <select
                      id="onboarding-year"
                      className="input"
                      value={studyYear}
                      onChange={event => {
                        setStudyYear(event.target.value);
                        setStudyYearCustom("");
                      }}
                    >
                      <option value="">{t("onboarding.year.choose")}</option>
                      {STUDY_YEARS.map(year => <option key={year.value} value={year.value}>{t(year.key)}</option>)}
                    </select>
                  </div>

                  {studyYear === "Autre" && (
                    <div>
                      <label className="label" htmlFor="onboarding-custom-year">{t("onboarding.year.customLabel")}</label>
                      <input
                        id="onboarding-custom-year"
                        className="input"
                        placeholder={t("onboarding.year.customPlaceholder")}
                        value={studyYearCustom}
                        onChange={event => setStudyYearCustom(event.target.value)}
                        maxLength={80}
                        autoFocus
                      />
                    </div>
                  )}
                </div>

                {studyInfoError && <div className="bt-form-alert mt-5" role="alert">{studyInfoError}</div>}

                <div className="mt-6 flex gap-3">
                  <button type="button" className="btn-ghost flex-1" onClick={() => goToStep(0)}>
                    {t("comm.back")}
                  </button>
                  <button className="btn-primary flex-1" disabled={savingStudyInfo} aria-busy={savingStudyInfo}>
                    {savingStudyInfo
                      ? t("onboarding.saving")
                      : (studyField.trim() || studyYear ? t("onboarding.saveContinue") : t("onboarding.skip"))}
                  </button>
                </div>
                <p className="mt-3 text-center text-xs" style={{ color: "var(--bt-text-2)" }}>
                  {t("onboarding.field.optional")}
                </p>
              </form>
            )}

            {step === 2 && (
              <div>
                <div className="mb-6">
                  <h1 className="text-2xl">{t("onboarding.courses.title")}</h1>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
                    {t("onboarding.courses.subtitle")}
                  </p>
                </div>

                <form onSubmit={addCourse} className="space-y-3">
                  <div className="flex items-stretch gap-2">
                    <input
                      id="onboarding-course"
                      className={`input ${courseError && courses.length === 0 ? "input-error" : ""}`}
                      placeholder={t("onboarding.courses.placeholder")}
                      value={newCourse}
                      onChange={event => { setNewCourse(event.target.value); setCourseError(""); }}
                      maxLength={80}
                      autoFocus
                      aria-invalid={Boolean(courseError && courses.length === 0)}
                      aria-describedby={courseError ? "course-error" : undefined}
                    />
                    <button
                      type="submit"
                      className="btn-primary w-12 shrink-0 px-0"
                      disabled={savingCourse || !newCourse.trim()}
                      aria-label={t("onboarding.courses.add")}
                      title={t("onboarding.courses.add")}
                    >
                      <PlusIcon />
                    </button>
                  </div>

                  <fieldset>
                    <legend className="sr-only">{t("onboarding.courses.color")}</legend>
                    <div className="flex flex-wrap gap-2">
                      {COURSE_COLORS.slice(0, 12).map((color, index) => {
                        const selected = newColor === color;
                        return (
                          <button
                            type="button"
                            key={color}
                            onClick={() => setNewColor(color)}
                            className={`bt-tap inline-flex w-9 items-center justify-center rounded-full border-2 transition-transform ${selected ? "scale-105 border-stone-700 dark:border-stone-100" : "border-transparent"}`}
                            style={{ backgroundColor: color }}
                            aria-label={`${t("onboarding.courses.color")} ${index + 1}`}
                            aria-pressed={selected}
                          >
                            {selected && <span className="text-white drop-shadow"><CheckIcon /></span>}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                </form>

                {courses.length > 0 && (
                  <div className="mt-5">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--bt-text-2)" }}>
                      {t("onboarding.courses.added")} · {courses.length}
                    </p>
                    <ul className="space-y-2">
                      {courses.map(course => (
                        <li key={course.id} className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2" style={{ backgroundColor: "var(--bt-subtle)" }}>
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: course.color }} />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{course.name}</span>
                          <span className="bt-accent-link" aria-hidden="true"><CheckIcon /></span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {courseError && <p id="course-error" className="bt-form-error mt-4 text-sm" role="alert">{courseError}</p>}

                <div className="mt-6 flex gap-3">
                  <button type="button" className="btn-ghost flex-1" onClick={() => goToStep(1)}>
                    {t("comm.back")}
                  </button>
                  <button
                    type="button"
                    className="btn-primary flex-[1.35]"
                    onClick={finish}
                    disabled={finishing || savingCourse || (courses.length === 0 && !newCourse.trim())}
                    aria-busy={finishing}
                  >
                    {finishing ? t("onboarding.saving") : t("onboarding.done.cta")}
                  </button>
                </div>
                <p className="mt-3 text-center text-xs" style={{ color: "var(--bt-text-2)" }}>
                  {t("onboarding.courses.editLater")}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
