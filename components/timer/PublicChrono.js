import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import ChronoCard from "./ChronoCard";
import { useChrono } from "./useChrono";
import { useAuth } from "../../contexts/AuthContext";
import { useI18n } from "../../contexts/I18nContext";
import { chronoSessionOpen } from "../../lib/pomodoro.mjs";
import {
  GUEST_USER_ID, appendGuestSession, defaultGuestDashboardData, readGuestDashboardData,
} from "../../lib/guestStudySpace";

// Le plein écran Focus n'est chargé qu'à la demande : fond animé et sons
// d'ambiance n'ont rien à faire dans le premier chargement d'une page publique.
const loadFocus = () => import("./ChronoFocus");
const ChronoFocus = dynamic(loadFocus, { ssr: false });

// Le vrai Chrono sur une page publique (/pomodoro) — pas un second minuteur :
// les composants du Dashboard (components/timer) et le même moteur global.
//
// Visiteur sans compte : Pomodoro par défaut, Libre avec les deux cours
// d'exemple du mode Découverte, sessions terminées écrites dans le MÊME espace
// local que le Dashboard invité (lib/guestStudySpace) — /pomodoro puis
// /dashboard retrouve donc la même progression. Rien vers Supabase, rien dans
// la file hors ligne des comptes. Démarrer n'ouvre pas Focus : c'est un choix.
//
// Compte connecté : la page ne pilote pas son chrono. Une fois l'auth connue,
// l'outil laisse la place à un lien vers le Chrono de l'app.
//
// Rendu serveur (robots, premier affichage) : la carte au repos — Pomodoro,
// 25:00, Démarrer — sans rien lire du stockage local. Tant que l'auth n'a pas
// répondu et que le chrono n'est pas restauré, elle reste inerte : un compte
// connecté ne peut pas lancer par mégarde une session invitée.
export default function PublicChrono() {
  const { user, loading } = useAuth();
  if (user) return <AccountChronoLink />;
  return <GuestChrono authKnown={!loading} />;
}

function AccountChronoLink() {
  const { t } = useI18n();
  return (
    <section className="card p-6 sm:p-7" aria-labelledby="public-chrono-account-title">
      <h2 id="public-chrono-account-title" className="font-display text-xl sm:text-2xl" style={{ color: "var(--bt-text-1)" }}>
        {t("publicChrono.accountTitle")}
      </h2>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
        {t("publicChrono.accountText")}
      </p>
      <Link href="/dashboard" className="btn-primary mt-5 inline-flex min-h-11 items-center px-6 text-sm">
        {t("publicChrono.accountOpen")}
      </Link>
    </section>
  );
}

function GuestChrono({ authKnown }) {
  const { lang } = useI18n();
  const chrono = useChrono({
    ownerId: GUEST_USER_ID,
    enabled: authKnown,
    defaultMode: "pomodoro",
    onWorkComplete: (payload) => appendGuestSession(payload, lang),
  });
  const { courseId, setCourseId, running, elapsed, pomodoro, setPomodoro, pause, reset, modeReady, sessionPayload } = chrono;
  const interactive = authKnown && modeReady;

  // Les deux cours d'exemple de l'espace invité : ceux du Dashboard invité,
  // relus une fois l'auth connue (le serveur n'a pas de stockage local).
  const [courses, setCourses] = useState(() => defaultGuestDashboardData(lang).courses);
  useEffect(() => {
    if (authKnown) setCourses(readGuestDashboardData(lang).courses);
  }, [authKnown, lang]);
  const activeCourses = useMemo(() => courses.filter((course) => !course.archived_at), [courses]);

  // Libre demande un cours : au repos, le premier cours d'exemple si aucun
  // n'est choisi (la règle du Dashboard). Un Pomodoro n'en demande pas.
  useEffect(() => {
    if (!interactive || pomodoro || running || elapsed > 0 || !activeCourses.length) return;
    if (!activeCourses.some((course) => course.id === courseId)) setCourseId(activeCourses[0].id);
  }, [interactive, pomodoro, running, elapsed, activeCourses, courseId, setCourseId]);

  // « Terminer » : la session rejoint l'espace invité, comme sur le Dashboard.
  // Un Pomodoro terminé laisse la page prête pour le suivant (cycle neuf).
  const [saveStatus, setSaveStatus] = useState("idle");
  const saveStatusTimer = useRef(null);
  useEffect(() => () => clearTimeout(saveStatusTimer.current), []);
  function finish(wasPomodoro) {
    const seconds = elapsed;
    if (running) pause();
    if (seconds < 1) { reset(); return; }
    const payload = sessionPayload(seconds);
    reset();
    appendGuestSession(payload, lang);
    if (wasPomodoro) setPomodoro(true);
    setSaveStatus("success");
    clearTimeout(saveStatusTimer.current);
    saveStatusTimer.current = setTimeout(() => setSaveStatus("idle"), 2500);
  }

  const [focusOpen, setFocusOpen] = useState(false);

  // Avant restauration, l'état de repos par défaut de la page — celui du rendu
  // serveur. Une session ouverte, elle, s'affiche telle qu'elle est.
  const view = !modeReady && !chronoSessionOpen(chrono)
    ? { ...chrono, pomodoro: true, pomoPhase: "work", pomoCount: 0, onBreak: false, liveMessage: null }
    : chrono;

  return (
    <>
      <div inert={interactive ? undefined : ""}>
        <ChronoCard
          chrono={view}
          courses={courses}
          activeCourses={activeCourses}
          coursePicker={!view.pomodoro}
          onPickCourse={setCourseId}
          onOpenFocus={() => { if (interactive) setFocusOpen(true); }}
          onStart={() => {
            if (!interactive) return;
            chrono.startWithFeedback();
            // Le plein écran se prépare en arrière-plan, au cas où.
            loadFocus();
          }}
          onFinish={() => finish(view.pomodoro)}
          saveStatus={saveStatus}
          hint={view.hint}
        />
      </div>
      {focusOpen && (
        <ChronoFocus
          chrono={chrono}
          courses={courses}
          onClose={() => setFocusOpen(false)}
          onFinish={() => finish(pomodoro)}
          saveStatus={saveStatus}
          hint={chrono.hint}
        />
      )}
    </>
  );
}
