import { useEffect, useState } from "react";
import Glyph from "../components/Glyph";
import { useRouter } from "next/router";
import AuthBrand from "../components/AuthBrand";
import UniPicker from "../components/UniPicker";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { clearClientCache } from "../lib/clientCache";
import { COURSE_COLORS } from "../lib/courseColors";
import { supabase } from "../lib/supabaseClient";
import { STUDY_YEARS } from "../lib/studyYears";
import StudyProgramInput from "../components/StudyProgramInput";
import StudyFieldPicker from "../components/StudyFieldPicker";
import {
  ONBOARDING_VERSION,
  ONBOARDING_STEPS,
  deriveOnboardingState,
  hasDuplicateCourse,
  mergeCourseById,
  nextCourseColor,
  normalizeCourseName,
} from "../lib/onboarding.mjs";
import { newClientId } from "../lib/timerDraft";

function PlusIcon() {
  return (
    <Glyph size={18}>
      <path d="M12 5v14M5 12h14" />
    </Glyph>
  );
}

function CheckIcon() {
  return (
    <Glyph size={13} strokeWidth={3}>
      <path d="M5 12l4 4L19 6" />
    </Glyph>
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
  const { user, loading, refreshProfile, completePendingSignup } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState(ONBOARDING_STEPS.UNIVERSITY);
  const [ready, setReady] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [pseudo, setPseudo] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [identityError, setIdentityError] = useState("");
  const [loadError, setLoadError] = useState("");

  const [university, setUniversity] = useState("");
  const [customUniversity, setCustomUniversity] = useState("");
  const [useCustomUniversity, setUseCustomUniversity] = useState(false);
  const [savingUniversity, setSavingUniversity] = useState(false);
  const [universityError, setUniversityError] = useState("");

  const [studyField, setStudyField] = useState("");
  const [broadField, setBroadField] = useState("");
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
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [editingCourseName, setEditingCourseName] = useState("");
  const [courseActionId, setCourseActionId] = useState(null);

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

    let cancelled = false;

    async function loadSetup() {
      setReady(false);
      setLoadError("");
      try {
        await completePendingSignup(user);
        const [profileResult, coursesResult] = await Promise.all([
          supabase
            .from("profiles")
            .select("id,pseudo,first_name,last_name,university,study_field,study_year,broad_field")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("courses")
            .select("id,name,color,created_at,archived_at")
            .eq("user_id", user.id)
            .is("archived_at", null)
            .order("created_at", { ascending: true })
            .limit(30),
        ]);

        if (cancelled) return;
        if (profileResult.error || coursesResult.error) throw new Error("setup_load_failed");

        const missingProfile = !profileResult.data;
        const currentProfile = profileResult.data || {};
        const currentCourses = coursesResult.data || [];
        const currentYear = currentProfile.study_year || "";
        const knownYear = STUDY_YEARS.some(year => year.value === currentYear);
        // A repair URL is only a hint. Server state remains authoritative so
        // an existing legacy profile is never forced into the new journey.
        const repair = missingProfile;
        const onboardingState = deriveOnboardingState({
          user,
          profile: profileResult.data,
          courses: currentCourses,
          repair,
        });
        if (onboardingState.complete) {
          router.replace("/dashboard");
          return;
        }

        setPseudo(currentProfile.pseudo || "");
        setFirstName(currentProfile.first_name || "");
        setLastName(currentProfile.last_name || "");
        setUniversity(currentProfile.university || "");
        setStudyField(currentProfile.study_field || "");
        setBroadField(currentProfile.broad_field || "");
        setStudyYear(knownYear ? currentYear : (currentYear ? "Autre" : ""));
        setStudyYearCustom(knownYear ? "" : currentYear);
        setCourses(currentCourses);
        setNewColor(nextCourseColor(currentCourses, COURSE_COLORS) || COURSE_COLORS[0]);
        try {
          const draftKey = `bt_onboarding_course_draft_${user.id}`;
          const draft = JSON.parse(localStorage.getItem(draftKey) || "null");
          if (draft?.id && currentCourses.some(course => course.id === draft.id)) {
            localStorage.removeItem(draftKey);
          }
        } catch (_) {}
        setStep(onboardingState.step);

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
  }, [user, loading, router, reloadKey, t, completePendingSignup]);

  const selectedUniversity = useCustomUniversity
    ? customUniversity.trim()
    : university.trim();

  async function saveIdentity(event) {
    event.preventDefault();
    setIdentityError("");
    const cleanPseudo = pseudo.trim();
    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    if (!cleanFirstName) {
      setIdentityError(t("signup.errFirstName"));
      return;
    }
    if (cleanPseudo.length < 3 || cleanPseudo.length > 30 || /\s/.test(cleanPseudo)) {
      setIdentityError(t("signup.errPseudo"));
      return;
    }

    setSavingUniversity(true);
    try {
      const loadOwnProfile = () => supabase
        .from("profiles")
        .select("id,pseudo,first_name,last_name,university")
        .eq("id", user.id)
        .maybeSingle();

      const initialOwnProfile = await loadOwnProfile();
      if (initialOwnProfile.error) throw initialOwnProfile.error;
      let ownProfile = initialOwnProfile.data || null;
      if (!ownProfile) {
        const { data: pseudoAvailable, error: pseudoError } = await supabase
          .rpc("is_pseudo_available", { p_pseudo: cleanPseudo });
        if (pseudoError) throw pseudoError;
        if (pseudoAvailable !== true) {
          const racedOwnProfile = await loadOwnProfile();
          if (racedOwnProfile.error) throw racedOwnProfile.error;
          ownProfile = racedOwnProfile.data || null;
          if (!ownProfile) {
            setIdentityError(t("signup.errPseudoTaken"));
            return;
          }
        }
      }

      if (!ownProfile) {
        const timezone = typeof Intl === "undefined"
          ? "Europe/Paris"
          : (Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris");
        const { data, error } = await supabase
          .from("profiles")
          .insert({
            id: user.id,
            pseudo: cleanPseudo,
            first_name: cleanFirstName,
            last_name: cleanLastName || null,
            email: user.email,
            timezone,
          })
          .select("id")
          .single();
        if (error) {
          if (error.code === "23505") {
            const racedOwnProfile = await loadOwnProfile();
            if (racedOwnProfile.error) throw racedOwnProfile.error;
            ownProfile = racedOwnProfile.data || null;
          }
          if (!ownProfile) throw error;
        }
        if (!ownProfile && data?.id !== user.id) throw new Error("profile_repair_failed");
      } else if (!ownProfile.first_name || !ownProfile.pseudo) {
        const { data, error } = await supabase
          .from("profiles")
          .update({ pseudo: cleanPseudo, first_name: cleanFirstName, last_name: cleanLastName || null })
          .eq("id", user.id)
          .select("id")
          .single();
        if (error || data?.id !== user.id) throw error || new Error("profile_repair_failed");
      }

      // A repaired ghost account now follows the same server-derived journey
      // as a fresh signup, including refresh and another-device resume.
      const { error: metadataError } = await supabase.auth.updateUser({
        data: { ...(user.user_metadata || {}), onboarding_version: ONBOARDING_VERSION },
      });
      if (metadataError) throw metadataError;
      await refreshProfile();
      goToStep(ONBOARDING_STEPS.UNIVERSITY);
    } catch (error) {
      if (error?.code === "23505" && /pseudo/i.test(`${error.message || ""} ${error.details || ""}`)) {
        setIdentityError(t("signup.errPseudoTaken"));
      } else {
        setIdentityError(t("onboarding.saveError"));
      }
    } finally {
      setSavingUniversity(false);
    }
  }

  async function saveUniversity(event) {
    event.preventDefault();
    setUniversityError("");
    if (!selectedUniversity) {
      setUniversityError(t("onboarding.university.required"));
      return;
    }

    setSavingUniversity(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({ university: selectedUniversity })
        .eq("id", user.id)
        .select("id")
        .single();
      if (error || data?.id !== user.id) throw error || new Error("profile_update_failed");

      setUniversity(selectedUniversity);
      setUseCustomUniversity(false);
      await refreshProfile();
      goToStep(ONBOARDING_STEPS.STUDIES);
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
    if (!broadField || !actualYear) {
      setStudyInfoError(t("onboarding.field.required"));
      return;
    }

    setSavingStudyInfo(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({
          study_field: studyField.trim() || null,
          broad_field: broadField || null,
          study_year: actualYear || null,
        })
        .eq("id", user.id)
        .select("id")
        .single();
      if (error || data?.id !== user.id) throw error || new Error("profile_update_failed");

      await refreshProfile();
      goToStep(ONBOARDING_STEPS.COURSES);
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
    if (hasDuplicateCourse(courses, name)) {
      setCourseError(t("onboarding.courses.duplicate"));
      return null;
    }

    setSavingCourse(true);
    try {
      const draftKey = `bt_onboarding_course_draft_${user.id}`;
      let courseId = null;
      try {
        const draft = JSON.parse(localStorage.getItem(draftKey) || "null");
        if (draft?.id && draft?.nameKey === normalizeCourseName(name)) courseId = draft.id;
      } catch (_) {}
      courseId ||= newClientId();
      try {
        localStorage.setItem(draftKey, JSON.stringify({ id: courseId, nameKey: normalizeCourseName(name) }));
      } catch (_) {}

      const { data, error } = await supabase
        .from("courses")
        .upsert({ id: courseId, user_id: user.id, name, color: newColor }, { onConflict: "id" })
        .select("id,name,color,created_at,archived_at")
        .single();
      if (error || !data) throw error || new Error("course_create_failed");

      clearClientCache(`dashboard:${user.id}:`);
      const nextCourses = mergeCourseById(courses, data);
      setCourses(nextCourses);
      setNewCourse("");
      setNewColor(nextCourseColor(nextCourses, COURSE_COLORS) || COURSE_COLORS[0]);
      try { localStorage.removeItem(draftKey); } catch (_) {}
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

  async function saveCourseEdit(course) {
    const name = editingCourseName.trim();
    setCourseError("");
    if (!name || hasDuplicateCourse(courses, name, course.id)) {
      setCourseError(name ? t("onboarding.courses.duplicate") : t("onboarding.courses.needOne"));
      return;
    }
    setCourseActionId(course.id);
    try {
      const { data, error } = await supabase
        .from("courses")
        .update({ name })
        .eq("id", course.id)
        .eq("user_id", user.id)
        .select("id,name,color,created_at,archived_at")
        .single();
      if (error || !data) throw error || new Error("course_update_failed");
      setCourses(current => current.map(item => item.id === data.id ? data : item));
      setEditingCourseId(null);
      setEditingCourseName("");
      clearClientCache(`dashboard:${user.id}:`);
    } catch (_) {
      setCourseError(t("onboarding.courses.saveError"));
    } finally {
      setCourseActionId(null);
    }
  }

  async function removeCourse(course) {
    setCourseError("");
    setCourseActionId(course.id);
    try {
      const { error } = await supabase
        .from("courses")
        .delete()
        .eq("id", course.id)
        .eq("user_id", user.id);
      if (error) throw error;
      const nextCourses = courses.filter(item => item.id !== course.id);
      setCourses(nextCourses);
      setNewColor(nextCourseColor(nextCourses, COURSE_COLORS) || COURSE_COLORS[0]);
      if (editingCourseId === course.id) setEditingCourseId(null);
      clearClientCache(`dashboard:${user.id}:`);
    } catch (_) {
      setCourseError(t("onboarding.courses.removeError"));
    } finally {
      setCourseActionId(null);
    }
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
      <main className="min-h-dvh bg-[var(--bt-bg)] px-4 py-7 sm:py-10">
        <div className="mx-auto w-full max-w-md">
          <AuthBrand compact subtitle={t("onboarding.subtitle")} />
          <LoadingState label={t("loading.preparing")} />
        </div>
      </main>
    );
  }
  if (!user) return null;

  return (
    <main className="min-h-dvh bg-[var(--bt-bg)] px-4 py-7 sm:py-10">
      <div className="mx-auto w-full max-w-md">
        <AuthBrand
          compact
          subtitle={firstName ? `${t("onboarding.hello")} ${firstName}. ${t("onboarding.subtitle")}` : t("onboarding.subtitle")}
        />

        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold" style={{ color: "var(--bt-text-1)" }}>
            <span>{t("onboarding.stepLabel")} {step + 1} / 5</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: "var(--bt-border)" }} role="progressbar" aria-label={`${t("onboarding.stepLabel")} ${step + 1} / 5`} aria-valuemin="1" aria-valuemax="5" aria-valuenow={step + 1}>
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out motion-reduce:transition-none"
              style={{ width: `${((step + 1) / 5) * 100}%` }}
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
            {step === ONBOARDING_STEPS.YOU && (
              <form onSubmit={saveIdentity} noValidate>
                <div className="mb-6">
                  <h1 className="text-2xl">{t("onboarding.repair.title")}</h1>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
                    {t("onboarding.repair.subtitle")}
                  </p>
                </div>

                <div className="mb-5 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="label" htmlFor="onboarding-first-name">{t("profile.firstName")}</label>
                      <input id="onboarding-first-name" className="input" value={firstName} onChange={event => { setFirstName(event.target.value); setIdentityError(""); }} maxLength={80} autoComplete="given-name" autoFocus />
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <label className="label mb-0" htmlFor="onboarding-last-name">{t("profile.lastName")}</label>
                        <span className="text-xs" style={{ color: "var(--bt-text-2)" }}>{t("signup.optional")}</span>
                      </div>
                      <input id="onboarding-last-name" className="input" value={lastName} onChange={event => { setLastName(event.target.value); setIdentityError(""); }} maxLength={80} autoComplete="family-name" />
                    </div>
                  </div>

                  <div>
                    <label className="label" htmlFor="onboarding-pseudo">{t("signup.pseudo")}</label>
                    <input id="onboarding-pseudo" className="input" value={pseudo} onChange={event => { setPseudo(event.target.value); setIdentityError(""); }} maxLength={30} autoComplete="username" autoCapitalize="none" spellCheck="false" />
                    <p className="mt-1 text-xs" style={{ color: "var(--bt-text-2)" }}>{t("signup.pseudoHint")}</p>
                  </div>

                  <div>
                    <label className="label" htmlFor="onboarding-email">{t("signup.email")}</label>
                    <input id="onboarding-email" className="input" value={user.email || ""} readOnly autoComplete="email" />
                    <p className="mt-1 text-xs" style={{ color: "var(--bt-text-2)" }}>{t("onboarding.repair.emailHelp")}</p>
                  </div>

                  {identityError && <div className="bt-form-alert" role="alert">{identityError}</div>}
                </div>

                <button className="btn-primary w-full min-h-11" disabled={savingUniversity} aria-busy={savingUniversity}>
                  {savingUniversity ? t("onboarding.saving") : t("onboarding.continue")}
                </button>
              </form>
            )}

            {step === ONBOARDING_STEPS.UNIVERSITY && (
              <form onSubmit={saveUniversity} noValidate>
                <div className="mb-6">
                  <h1 className="text-2xl">{t("onboarding.university.title")}</h1>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>{t("onboarding.university.subtitle")}</p>
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

            {step === ONBOARDING_STEPS.STUDIES && (
              <form onSubmit={saveStudyInfo} noValidate>
                <div className="mb-6">
                  <h1 className="text-2xl">{t("onboarding.field.title")}</h1>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
                    {t("onboarding.field.subtitle")}
                  </p>
                </div>

                <div className="space-y-4">
                  <StudyFieldPicker value={broadField} onChange={value => { setBroadField(value); setStudyInfoError(""); }} id="onboarding-broad-field" required />
                  <StudyProgramInput id="onboarding-field" value={studyField} onChange={setStudyField} maxLength={100} />

                  <div>
                    <label className="label" htmlFor="onboarding-year">{t("onboarding.year.label")}</label>
                    <select
                      id="onboarding-year"
                      className="input"
                      value={studyYear}
                      onChange={event => {
                        setStudyYear(event.target.value);
                        setStudyYearCustom("");
                        setStudyInfoError("");
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
                  <button type="button" className="btn-ghost flex-1" onClick={() => goToStep(ONBOARDING_STEPS.UNIVERSITY)}>
                    {t("comm.back")}
                  </button>
                  <button className="btn-primary flex-1" disabled={savingStudyInfo} aria-busy={savingStudyInfo}>
                    {savingStudyInfo ? t("onboarding.saving") : t("onboarding.saveContinue")}
                  </button>
                </div>
                <p className="mt-3 text-center text-xs" style={{ color: "var(--bt-text-2)" }}>
                  {t("onboarding.field.programOptional")}
                </p>
              </form>
            )}

            {step === ONBOARDING_STEPS.COURSES && (
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
                            className={`bt-tap inline-flex w-9 items-center justify-center rounded-full border-2 transition-transform ${selected ? "scale-105 border-[var(--bt-text-1)]" : "border-transparent"}`}
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
                        <li key={course.id} className="min-h-11 rounded-xl px-3 py-2" style={{ backgroundColor: "var(--bt-subtle)" }}>
                          {editingCourseId === course.id ? (
                            <form className="flex items-center gap-2" onSubmit={event => { event.preventDefault(); saveCourseEdit(course); }}>
                              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: course.color }} />
                              <input
                                className="input min-w-0 flex-1 py-1.5"
                                value={editingCourseName}
                                onChange={event => { setEditingCourseName(event.target.value); setCourseError(""); }}
                                maxLength={80}
                                autoFocus
                                aria-label={t("onboarding.courses.editName")}
                              />
                              <button type="submit" className="bt-accent-link min-h-11 px-2 text-xs font-semibold" disabled={courseActionId === course.id}>
                                {t("common.save")}
                              </button>
                            </form>
                          ) : (
                            <div className="flex items-center gap-3">
                              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: course.color }} />
                              <span className="min-w-0 flex-1 truncate text-sm font-medium">{course.name}</span>
                              <button
                                type="button"
                                className="min-h-11 px-2 text-xs font-semibold"
                                style={{ color: "var(--bt-text-2)" }}
                                onClick={() => { setEditingCourseId(course.id); setEditingCourseName(course.name); setCourseError(""); }}
                              >
                                {t("common.edit")}
                              </button>
                              <button
                                type="button"
                                className="min-h-11 px-2 text-xs font-semibold"
                                style={{ color: "var(--bt-danger)" }}
                                onClick={() => removeCourse(course)}
                                disabled={courseActionId === course.id}
                              >
                                {t("common.remove")}
                              </button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {courseError && <p id="course-error" className="bt-form-error mt-4 text-sm" role="alert">{courseError}</p>}

                <div className="mt-6 flex gap-3">
                  <button type="button" className="btn-ghost flex-1" onClick={() => goToStep(ONBOARDING_STEPS.STUDIES)}>
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
