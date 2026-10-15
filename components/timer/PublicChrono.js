import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import ChronoCard from "./ChronoCard";
import { useChrono } from "./useChrono";
import { useAuth } from "../../contexts/AuthContext";
import { useI18n } from "../../contexts/I18nContext";
import { formatMinutesShort } from "../../lib/format";
import { chronoSessionOpen } from "../../lib/pomodoro.mjs";
import { publicHref } from "../../lib/publicRoutes.mjs";
import {
  GUEST_USER_ID, appendGuestSession, defaultGuestDashboardData, readGuestDashboardData,
} from "../../lib/guestStudySpace";
import {
  qualifiesForSignupInvite, rememberSignupInvite, signupInviteAtRest, signupInviteQuiet,
} from "../../lib/pomodoroSignupInvite.mjs";

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
// Après une vraie session (10 min au moins, relue dans l'espace local), une
// invitation sous la carte propose un compte — au repos seulement, rappelée
// au plus tôt 7 jours après (30 si fermée), jamais en fenêtre
// (lib/pomodoroSignupInvite.mjs).
// Elle dit que la session reste sur l'appareil : rien n'est transféré.
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
  const { t, lang } = useI18n();
  // La session qui a mérité l'invitation (sa durée), le temps de ce repos.
  const [invite, setInvite] = useState(null);
  const chrono = useChrono({
    ownerId: GUEST_USER_ID,
    enabled: authKnown,
    defaultMode: "pomodoro",
    onWorkComplete: (payload) => {
      appendGuestSession(payload, lang);
      offerInvite(payload);
    },
  });
  const { courseId, setCourseId, running, elapsed, onBreak, pomodoro, setPomodoro, pause, reset, modeReady, sessionPayload } = chrono;
  const interactive = authKnown && modeReady;

  // Une session terminée ne mérite l'invitation que si elle est vraiment
  // gardée : relue dans l'espace local (un stockage plein ou refusé n'a rien
  // écrit, et la phrase « elle reste sur cet appareil » serait fausse).
  function offerInvite(payload) {
    if (!qualifiesForSignupInvite(payload.duration_seconds)) return;
    const kept = (readGuestDashboardData(lang).sessions || []).some((session) => session?.id === payload.id);
    if (!kept || signupInviteQuiet(localStorage)) return;
    setInvite({ seconds: payload.duration_seconds });
  }
  // Une nouvelle session de travail l'efface. Le repos Pomodoro qui suit un
  // bloc ne compte pas : l'invitation attend la fin du repos.
  const workOpen = !onBreak && (running || elapsed > 0);
  useEffect(() => {
    if (workOpen) setInvite(null);
  }, [workOpen]);

  // Les deux cours d'exemple de l'espace invité : ceux du Dashboard invité,
  // relus une fois l'auth connue (le serveur n'a pas de stockage local).
  const [courses, setCourses] = useState(() => defaultGuestDashboardData(lang).courses);
  useEffect(() => {
    if (authKnown) setCourses(readGuestDashboardData(lang).courses);
  }, [authKnown, lang]);
  const activeCourses = useMemo(() => courses.filter((course) => !course.archived_at), [courses]);

  // Libre demande un cours : au repos, le premier cours d'exemple si aucun
  // n'est choisi (la règle du Dashboard). Un Pomodoro n'en demande pas, et ici
  // le cours n'est pas affiché : au repos, il n'en porte aucun, pour qu'aucun
  // bloc ne soit enregistré sous une matière choisie ailleurs (le Dashboard en
  // propose une) ou en Libre.
  useEffect(() => {
    if (!interactive || running || elapsed > 0) return;
    if (pomodoro) {
      if (courseId) setCourseId("");
      return;
    }
    if (!activeCourses.length) return;
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
    offerInvite(payload);
    if (wasPomodoro) setPomodoro(true);
    setSaveStatus("success");
    clearTimeout(saveStatusTimer.current);
    saveStatusTimer.current = setTimeout(() => setSaveStatus("idle"), 2500);
  }

  const [focusOpen, setFocusOpen] = useState(false);

  // Au repos seulement : jamais pendant le travail, une pause, le repos
  // Pomodoro ni en Focus. Démarrer reste disponible au-dessus, sans étape.
  const inviteShown = Boolean(interactive && invite)
    && signupInviteAtRest({ running, elapsed, onBreak, focusOpen });
  const cardRef = useRef(null);
  function dismissInvite() {
    rememberSignupInvite(localStorage, "dismissed");
    setInvite(null);
    // L'invitation disparaît : le focus va à ce qui reste à faire, Démarrer.
    cardRef.current?.querySelector(".btn-hero")?.focus();
  }

  // Avant restauration, l'état de repos par défaut de la page — celui du rendu
  // serveur. Une session ouverte, elle, s'affiche telle qu'elle est.
  const view = !modeReady && !chronoSessionOpen(chrono)
    ? { ...chrono, pomodoro: true, pomoPhase: "work", pomoCount: 0, onBreak: false, liveMessage: null }
    : chrono;

  return (
    <>
      <div ref={cardRef} inert={interactive ? undefined : ""}>
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
          savedLabel={t("publicChrono.savedOnDevice")}
          hint={view.hint}
        />
      </div>
      {inviteShown && <SignupInvite seconds={invite.seconds} onDismiss={dismissInvite} />}
      {focusOpen && (
        <ChronoFocus
          chrono={chrono}
          courses={courses}
          onClose={() => setFocusOpen(false)}
          onFinish={() => finish(pomodoro)}
          saveStatus={saveStatus}
          noCourseLabel={t("publicChrono.pomodoroSession")}
          hint={chrono.hint}
        />
      )}
    </>
  );
}

// L'invitation après une vraie session : une surface discrète, celle des
// encadrés « Inclus » de la page, pas une seconde carte du Chrono.
function SignupInvite({ seconds, onDismiss }) {
  const { t, lang } = useI18n();
  const ref = useRef(null);
  // « Vue » quand la moitié au moins est à l'écran : montée sous la ligne de
  // flottaison d'un petit téléphone, personne ne l'a lue — elle pourra revenir
  // après la session suivante.
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      rememberSignupInvite(localStorage, "seen");
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5)) return;
      rememberSignupInvite(localStorage, "seen");
      observer.disconnect();
    }, { threshold: 0.5 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Ni le titre ni la carte ne bougent quand elle apparaît (grille du héros,
  // SeoLandingPage) ; seul ce qui suit descend de sa hauteur, d'où un
  // téléphone plus serré. Elle se déroule plutôt que de surgir ; mouvement
  // réduit : affichée d'emblée.
  const [unfolded, setUnfolded] = useState(false);
  useEffect(() => {
    if (typeof requestAnimationFrame !== "function") { setUnfolded(true); return undefined; }
    const frame = requestAnimationFrame(() => setUnfolded(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none"
      style={{ gridTemplateRows: unfolded ? "1fr" : "0fr", opacity: unfolded ? 1 : 0 }}>
      <div className="min-h-0 overflow-hidden">
        <section ref={ref} aria-labelledby="public-chrono-invite-title" className="mt-3 rounded-2xl p-4 sm:mt-4 sm:p-5"
          style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-hairline)" }}>
          <h2 id="public-chrono-invite-title" className="text-base leading-snug" style={{ color: "var(--bt-text-1)" }}>
            {t("publicChrono.inviteTitle").replace("{t}", formatMinutesShort(seconds))}
          </h2>
          <p className="mt-1 text-sm leading-snug sm:mt-1.5 sm:leading-relaxed" style={{ color: "var(--bt-text-2)" }}>{t("publicChrono.inviteDevice")}</p>
          <p className="mt-1 text-sm leading-snug sm:mt-1.5 sm:leading-relaxed" style={{ color: "var(--bt-text-2)" }}>{t("publicChrono.inviteValue")}</p>
          <div className="mt-3 flex flex-col gap-2 sm:mt-4 sm:flex-row">
            {/* Depuis /en/pomodoro, l'inscription commence en anglais
                (lib/publicRoutes.mjs) ; depuis /pomodoro, inchangé. */}
            <Link href={publicHref("/signup", lang)} className="btn-primary min-h-11 px-5" onClick={() => rememberSignupInvite(localStorage, "signup")}>
              {t("publicChrono.inviteSignup")}
            </Link>
            <button type="button" className="btn-ghost min-h-11 px-5" onClick={onDismiss}>
              {t("publicChrono.inviteContinue")}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
