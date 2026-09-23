import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import AuthShell, { AuthHeading } from "../components/auth/AuthShell";
import { Field, FieldGroup, FieldSplit, FormNote, messageId } from "../components/auth/Field";
import SpaceSheet from "../components/auth/SpaceSheet";
import CourseComposer from "../components/auth/CourseComposer";
import useCourseSetup from "../components/auth/useCourseSetup";
import UniPicker from "../components/UniPicker";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { clearClientCache } from "../lib/clientCache";
import { supabase } from "../lib/supabaseClient";
import { STUDY_YEARS } from "../lib/studyYears";
import { STUDY_FIELDS } from "../lib/studySpaces.mjs";
import {
  ONBOARDING_VERSION,
  ONBOARDING_STEPS,
  deriveOnboardingState,
  setupStageFor,
} from "../lib/onboarding.mjs";

function TaskSkeleton({ label }) {
  return (
    <div className="bt-auth-skeleton" aria-busy="true" aria-label={label}>
      <span className="bt-skeleton" style={{ width: "46%", height: 30 }} />
      <span className="bt-skeleton" style={{ width: "88%", height: 14, marginTop: 12 }} />
      <span className="bt-skeleton bt-auth-skeleton-group" />
      <span className="bt-skeleton" style={{ width: "100%", height: 48, marginTop: 20, borderRadius: 14 }} />
    </div>
  );
}

export default function Onboarding() {
  const { user, loading, refreshProfile, completePendingSignup } = useAuth();
  const { t, lang } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState(ONBOARDING_STEPS.UNIVERSITY);
  const [ready, setReady] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadError, setLoadError] = useState("");

  const [pseudo, setPseudo] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [identityError, setIdentityError] = useState("");
  const [savingIdentity, setSavingIdentity] = useState(false);

  const [university, setUniversity] = useState("");
  const [broadField, setBroadField] = useState("");
  const [studyYear, setStudyYear] = useState("");
  const [studyYearCustom, setStudyYearCustom] = useState("");
  const [studyField, setStudyField] = useState("");
  const [studiesTouched, setStudiesTouched] = useState(false);
  const [studiesError, setStudiesError] = useState("");
  const [savingStudies, setSavingStudies] = useState(false);

  const courseSetup = useCourseSetup({ userId: user?.id, t });
  const resetCourses = courseSetup.reset;
  const [courseDraft, setCourseDraft] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState("");

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
        resetCourses(currentCourses);
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
  }, [user, loading, router, reloadKey, t, completePendingSignup, resetCourses]);

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

    setSavingIdentity(true);
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
      setSavingIdentity(false);
    }
  }

  const actualYear = studyYear === "Autre" ? (studyYearCustom.trim() || "Autre") : studyYear;
  const studiesErrors = {
    university: !university.trim() ? t("signup.errUniversity") : "",
    field: !broadField ? t("setup.errField") : "",
    year: !actualYear ? t("setup.errYear") : "",
  };
  const studiesShown = field => (studiesTouched ? studiesErrors[field] : "");

  // Institution and studies are one question on screen and one write: the
  // server still requires all three answers before Courses, exactly as before.
  async function saveStudies(event) {
    event.preventDefault();
    setStudiesTouched(true);
    setStudiesError("");
    const firstInvalid = ["university", "field", "year"].find(field => studiesErrors[field]);
    if (firstInvalid) {
      document.getElementById(`onboarding-${firstInvalid}`)?.focus();
      return;
    }

    setSavingStudies(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({
          university: university.trim(),
          broad_field: broadField,
          study_year: actualYear,
          study_field: studyField.trim() || null,
        })
        .eq("id", user.id)
        .select("id")
        .single();
      if (error || data?.id !== user.id) throw error || new Error("profile_update_failed");

      await refreshProfile();
      goToStep(ONBOARDING_STEPS.COURSES);
    } catch (_) {
      setStudiesError(t("onboarding.saveError"));
    } finally {
      setSavingStudies(false);
    }
  }

  async function finish() {
    if (finishing) return;
    setFinishError("");
    setFinishing(true);

    // A name still in the entry counts as the student's intent.
    if (courseDraft.trim()) {
      const { added } = courseSetup.add([courseDraft]);
      if (added) setCourseDraft("");
      else {
        setFinishing(false);
        return;
      }
    }

    const list = await courseSetup.flush();
    if (list.some(course => course.status === "failed")) {
      setFinishing(false);
      return;
    }
    if (!list.some(course => !course.status)) {
      courseSetup.setNotice({ tone: "error", text: t("onboarding.courses.needOne") });
      setFinishing(false);
      document.getElementById("onboarding-course")?.focus();
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
      setFinishError(t("onboarding.finishError"));
      setFinishing(false);
    }
  }

  if (!loading && !user) return null;

  const pending = loading || !ready;
  const stage = setupStageFor(step);
  const coursesBusy = courseSetup.courses.some(course => course.status === "saving") || Boolean(courseSetup.busyId);
  const sheet = (
    <SpaceSheet
      loading={pending}
      firstName={firstName}
      lastName={lastName}
      pseudo={pseudo}
      university={university}
      broadField={broadField}
      year={studyYear === "Autre" ? studyYearCustom : studyYear}
      program={studyField}
      courses={courseSetup.courses}
      stage={stage}
    />
  );

  let content;
  if (pending) {
    content = <TaskSkeleton label={t("loading.preparing")} />;
  } else if (loadError) {
    content = (
      <>
        <AuthHeading title={t("onboarding.loadErrorTitle")} lead={loadError} />
        <button type="button" className="bt-auth-primary" onClick={() => setReloadKey(key => key + 1)}>
          {t("onboarding.retry")}
        </button>
      </>
    );
  } else if (step === ONBOARDING_STEPS.YOU) {
    content = (
      <>
        <AuthHeading title={t("onboarding.repair.title")} lead={t("onboarding.repair.subtitle")} />
        <form onSubmit={saveIdentity} noValidate>
          <FieldGroup>
            <FieldSplit>
              <Field id="onboarding-first-name" label={t("profile.firstName")}>
                <input id="onboarding-first-name" className="bt-field-input" value={firstName} onChange={event => { setFirstName(event.target.value); setIdentityError(""); }} maxLength={80} autoComplete="given-name" autoCapitalize="words" autoFocus />
              </Field>
              <Field id="onboarding-last-name" label={t("profile.lastName")}>
                <input id="onboarding-last-name" className="bt-field-input" value={lastName} onChange={event => { setLastName(event.target.value); setIdentityError(""); }} placeholder={t("setup.optional")} maxLength={80} autoComplete="family-name" autoCapitalize="words" />
              </Field>
            </FieldSplit>
            <Field id="onboarding-pseudo" label={t("signup.pseudo")}>
              <input id="onboarding-pseudo" className="bt-field-input" value={pseudo} onChange={event => { setPseudo(event.target.value); setIdentityError(""); }} placeholder={t("setup.pseudoPlaceholder")} maxLength={30} autoComplete="username" autoCapitalize="none" spellCheck="false" />
            </Field>
            <Field id="onboarding-email" label={t("signup.email")} hint={t("onboarding.repair.emailHelp")}>
              <input id="onboarding-email" className="bt-field-input" value={user.email || ""} readOnly autoComplete="email" aria-describedby={messageId("onboarding-email")} />
            </Field>
          </FieldGroup>
          <FormNote tone="error">{identityError}</FormNote>
          <button className="bt-auth-primary" disabled={savingIdentity} aria-busy={savingIdentity}>
            {savingIdentity ? t("onboarding.saving") : t("onboarding.continue")}
          </button>
        </form>
      </>
    );
  } else if (stage === 1) {
    content = (
      <>
        <AuthHeading title={t("setup.studiesTitle")} lead={t("setup.studiesLead")} />
        <form onSubmit={saveStudies} noValidate>
          <FieldGroup>
            <Field id="onboarding-university" label={t("signup.university")} error={studiesShown("university")} className="bt-field-uni">
              <UniPicker
                id="onboarding-university"
                value={university}
                onChange={value => { setUniversity(value); setStudiesError(""); }}
                placeholder={t("signup.uniSearch")}
                error={Boolean(studiesShown("university"))}
                ariaDescribedBy={studiesShown("university") ? messageId("onboarding-university") : undefined}
              />
            </Field>
          </FieldGroup>
          <FieldGroup>
            <Field id="onboarding-field" label={t("setup.fieldLabel")} error={studiesShown("field")}>
              <select
                id="onboarding-field"
                className="bt-field-input bt-field-select"
                value={broadField}
                onChange={event => { setBroadField(event.target.value); setStudiesError(""); }}
                aria-invalid={Boolean(studiesShown("field"))}
                aria-describedby={studiesShown("field") ? messageId("onboarding-field") : undefined}
              >
                <option value="">{t("setup.fieldChoose")}</option>
                {STUDY_FIELDS.map(field => <option key={field.id} value={field.id}>{lang === "fr" ? field.fr : field.en}</option>)}
              </select>
            </Field>
            <Field id="onboarding-year" label={t("setup.yearLabel")} error={studiesShown("year")}>
              <select
                id="onboarding-year"
                className="bt-field-input bt-field-select"
                value={studyYear}
                onChange={event => { setStudyYear(event.target.value); setStudyYearCustom(""); setStudiesError(""); }}
                aria-invalid={Boolean(studiesShown("year"))}
                aria-describedby={studiesShown("year") ? messageId("onboarding-year") : undefined}
              >
                <option value="">{t("setup.yearChoose")}</option>
                {STUDY_YEARS.map(year => <option key={year.value} value={year.value}>{t(year.key)}</option>)}
              </select>
            </Field>
            {studyYear === "Autre" && (
              <Field id="onboarding-custom-year" label={t("onboarding.year.customLabel")}>
                <input
                  id="onboarding-custom-year"
                  className="bt-field-input"
                  placeholder={t("onboarding.year.customPlaceholder")}
                  value={studyYearCustom}
                  onChange={event => setStudyYearCustom(event.target.value)}
                  maxLength={80}
                  autoFocus
                />
              </Field>
            )}
            <Field id="onboarding-program" label={t("setup.programLabel")}>
              <input
                id="onboarding-program"
                className="bt-field-input"
                value={studyField}
                onChange={event => setStudyField(event.target.value)}
                placeholder={t("setup.programPlaceholder")}
                maxLength={100}
                autoComplete="organization-title"
              />
            </Field>
          </FieldGroup>
          <FormNote tone="error">{studiesError}</FormNote>
          <button className="bt-auth-primary" disabled={savingStudies} aria-busy={savingStudies}>
            {savingStudies ? t("onboarding.saving") : t("onboarding.continue")}
          </button>
        </form>
      </>
    );
  } else {
    content = (
      <>
        <AuthHeading title={t("setup.coursesTitle")} lead={t("setup.coursesLead")} />
        <CourseComposer setup={courseSetup} draft={courseDraft} onDraftChange={setCourseDraft} disabled={finishing} />
        <FormNote tone="error">{finishError}</FormNote>
        <button
          type="button"
          className="bt-auth-primary"
          onClick={finish}
          disabled={finishing || (courseSetup.courses.length === 0 && !courseDraft.trim())}
          aria-busy={finishing || coursesBusy}
        >
          {finishing && <span className="bt-button-spinner" aria-hidden="true" />}
          {finishing ? t("onboarding.saving") : t("onboarding.done.cta")}
        </button>
        <p className="bt-auth-footnote">{t("onboarding.courses.editLater")}</p>
      </>
    );
  }

  return (
    <AuthShell
      stage={stage}
      aside={sheet}
      contentKey={pending ? "loading" : loadError ? "error" : `stage-${stage}-${step}`}
      onBack={!pending && !loadError && step === ONBOARDING_STEPS.COURSES && !finishing ? () => goToStep(ONBOARDING_STEPS.STUDIES) : undefined}
      backLabel={t("setup.stageStudies")}
    >
      {content}
    </AuthShell>
  );
}
