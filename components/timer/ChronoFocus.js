import { useEffect, useRef, useState } from "react";
import Glyph from "../Glyph";
import StudyBlocks, { RestTrack } from "../StudyBlocks";
import AmbientSoundControl from "../AmbientSoundControl";
import FocusShaderBackground from "../FocusShaderBackground";
import TimerDigits from "./TimerDigits";
import { useI18n } from "../../contexts/I18nContext";
import { formatMinutesShort } from "../../lib/format";

// Message contextuel selon l'heure — mode Focus uniquement, discret.
function focusGreeting(t) {
  const h = new Date().getHours();
  if (h >= 5 && h < 12)  return t("dash.focusGreetingMorning");
  if (h >= 12 && h < 18) return t("dash.focusGreetingAfternoon");
  if (h >= 18 && h < 23) return t("dash.focusGreetingEvening");
  return t("dash.focusGreetingNight");
}

// Le mode Focus du Chrono, en plein écran — sorti tel quel de
// pages/dashboard.js (2026-10-07). Monté seulement quand il est ouvert ; il
// porte ses propres réglages d'écran (défilement bloqué, fond racine, barre du
// bas masquée), Échap pour sortir, Espace pour pause/reprise et l'estompage des
// commandes. Ce qui appartient à la page arrive par ses props : fermer,
// Terminer, l'état d'enregistrement et la mascotte (`renderCoach`, ancrée aux
// blocs et au message d'accueil).
export default function ChronoFocus({
  chrono,
  courses = [],
  onClose,
  onFinish,
  saveStatus = "idle",
  hint = null,
  momentShown = false,
  renderCoach,
}) {
  const { t } = useI18n();
  const {
    courseId, running, elapsed, pomodoro, pomoPhase, pomoCount,
    isPaused, onBreak, pauseSince, pomoTargetSecs, blockGoalSecs, blocksAria, liveMessage,
    startWithFeedback, pauseWithFeedback, skipBreak, leavePomodoro,
  } = chrono;
  const focusMomentAnchor = useRef(null);
  const focusGreetingRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const courseName = (id) => courses.find((c) => c.id === id)?.name || "—";

  useEffect(() => {
    function handler(e) { if (e.key === "Escape") closeRef.current?.(); }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Fond racine vert + nav mobile masqué : le plein écran couvre la safe-area
    // du home indicator iPhone (sinon une bande blanche reste en bas). → globals.css
    document.documentElement.classList.add("bt-focus-active");
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.classList.remove("bt-focus-active");
      document.removeEventListener("keydown", handler);
    };
  }, []);

  // Contrôles du mode focus : s'estompent après 4,5 s d'inactivité (pattern
  // lecteur vidéo) — tout mouvement / toucher / touche les fait réapparaître.
  const [focusCtlVisible, setFocusCtlVisible] = useState(true);
  const focusCtlTimer = useRef(null);
  useEffect(() => {
    function poke() {
      setFocusCtlVisible(true);
      clearTimeout(focusCtlTimer.current);
      focusCtlTimer.current = setTimeout(() => setFocusCtlVisible(false), 4500);
    }
    poke();
    window.addEventListener("mousemove", poke);
    window.addEventListener("touchstart", poke);
    window.addEventListener("keydown", poke);
    return () => {
      clearTimeout(focusCtlTimer.current);
      window.removeEventListener("mousemove", poke);
      window.removeEventListener("touchstart", poke);
      window.removeEventListener("keydown", poke);
    };
  }, []);

  // Barre espace en mode focus : pause / reprise.
  useEffect(() => {
    function onKey(e) {
      if (e.code !== "Space" || e.repeat) return;
      if (/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName || "")) return;
      e.preventDefault();
      if (running) pauseWithFeedback();
      else if (courseId || pomodoro) startWithFeedback();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [running, courseId, pomodoro, pauseWithFeedback, startWithFeedback]);

  return (
        <div className="bt-focus-surface fixed inset-0 flex flex-col items-center justify-center transition-colors duration-300 overflow-hidden bt-grain"
          style={{
            background: (isPaused && !pomodoro) ? "#1A0605" : "var(--bt-ink)",
            zIndex: 100,
          }}>
          {/* Vagues WebGL de marque. Le composant fournit son propre fallback
              statique et coupe la boucle sous prefers-reduced-motion. En pause,
              le champ vire au rouge : en plein écran il n'y a pas de carte pour
              porter l'état, c'est l'environnement qui le porte. */}
          <FocusShaderBackground paused={isPaused && !pomodoro} />

          {/* Respiration rouge périphérique — le signal qui rattrape un regard
              parti ailleurs. Cycle de 2,4 s, courbe douce et centre transparent
              (voir globals.css) : aussi voyant que l'ancien battement à 1 Hz,
              sans son attaque stroboscopique. En mouvement réduit, le halo
              reste posé à pleine force au lieu de disparaître. */}
          {isPaused && !pomodoro && <div aria-hidden className="bt-pause-flash" />}

          {/* Ambiance sonore synthétisée (opt-in, 0 fichier / 0 egress) */}
          <AmbientSoundControl active visible={focusCtlVisible || !running} />

          <p ref={focusGreetingRef} className="text-xs mb-5 relative z-10" style={{ color: "var(--bt-ink-muted)" }}>
            {focusGreeting(t)}
          </p>

          {pomodoro && (
            <p role="status" className="text-xs font-semibold uppercase tracking-widest mb-3 relative z-10"
              style={{ color: pomoPhase === "work" ? "var(--bt-accent)" : "var(--bt-ink-muted)" }}>
              {pomoPhase === "work" ? t("dash.work") : t("dash.pause")}
              {pomoCount > 0 && <span className="font-normal ml-2 opacity-60">· {t("dash.cycle")} {pomoCount}</span>}
            </p>
          )}

          {/* Le cours garde son identité en plein écran : un marqueur de sa
              couleur, pas un habillage complet de l'écran. Sans lui, Focus
              perdait le seul repère visuel partagé avec le Chrono, le planning
              et les stats. Le cercle clair l'isole du champ mouvant. */}
          <p className="text-sm mb-2 relative z-10 flex items-center gap-2" style={{ color: "var(--bt-ink-muted)" }}>
            {courseId && courses.find((c) => c.id === courseId)?.color && (
              <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: courses.find((c) => c.id === courseId).color,
                  boxShadow: "0 0 0 1.5px rgba(255,255,255,0.32)",
                }} />
            )}
            <span>{courseId ? courseName(courseId) : t("dash.noCourse")}</span>
          </p>

          <div className="relative z-10 w-full text-center px-6">
            <TimerDigits
              seconds={pomodoro ? Math.max(0, pomoTargetSecs - elapsed) : elapsed}
              color={(isPaused && !pomodoro) ? "#FFEDEB" : "var(--bt-ink-text)"}
              size="clamp(4.5rem, 16vw, 8.5rem)"
              hoursSize="clamp(3.2rem, 11vw, 7rem)" />

            {/* Même échelle et même plafond d'unités que le Chrono : le
                plein écran ne compresse plus différemment. */}
            <div ref={focusMomentAnchor} className="mt-10 mx-auto w-full max-w-[600px]">
              {onBreak ? (
                <RestTrack
                  focus
                  remainingSecs={Math.max(0, pomoTargetSecs - elapsed)}
                  totalSecs={pomoTargetSecs}
                  label={t("dash.breakAria").replace("{t}", formatMinutesShort(Math.max(0, pomoTargetSecs - elapsed)))}
                />
              ) : (
                <StudyBlocks
                  focus
                  earnedSecs={elapsed}
                  plannedSecs={blockGoalSecs}
                  running={running}
                  paused={isPaused}
                  maxUnits={12}
                  label={blocksAria}
                />
              )}
            </div>

            {(liveMessage || hint) && (
              <div className="mt-5 flex items-center justify-center"
                style={momentShown ? { visibility: "hidden" } : undefined} aria-hidden={momentShown ? true : undefined}>
                <p key={liveMessage || hint} className={`text-sm ${isPaused ? "font-medium" : "bt-msg-swap"}`}
                  style={{ color: isPaused ? "#FFB0A8" : "var(--bt-ink-muted)" }}>
                  {liveMessage || hint}
                </p>
              </div>
            )}

            {/* En pause — pastille franche qui respire, avec sa durée. L'annonce
                vocale vit dans le compagnon invisible de la carte : une seule
                région vivante suffit, et elle ne doit pas relire la durée. */}
            {isPaused && !pomodoro && (
              <div className="bt-pause-pulse inline-flex items-center gap-1.5 mt-4 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest"
                style={{ color: "#FFFFFF", backgroundColor: "var(--bt-pause-strong)", letterSpacing: "0.12em" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                <span className="font-num tabular-nums">{t("dash.pausedFor").replace("{t}", pauseSince)}</span>
              </div>
            )}
          </div>
          {renderCoach?.({ anchorRef: focusMomentAnchor, frameRef: focusGreetingRef })}

          <div className="relative z-10 mt-8 flex w-full max-w-[560px] justify-center gap-3 px-4"
            style={{
              opacity: (focusCtlVisible || !running) ? 1 : 0,
              pointerEvents: (focusCtlVisible || !running) ? "auto" : "none",
              transition: "opacity 0.25s ease-out",
            }}>
            {pomoPhase === "break" && pomodoro ? (
              <button className="btn-ghost w-full border-white/20 px-6 py-3 text-white sm:w-auto sm:px-8"
                onClick={skipBreak}>
                {t("dash.skipBreak")}
              </button>
            ) : (
              <>
                {!running ? (
                  <button onClick={startWithFeedback} disabled={!courseId && !pomodoro}
                    className={`btn btn-hero min-w-0 flex-1 px-4 py-3 text-base bt-press sm:flex-none sm:px-10 ${isPaused ? "bt-pause-cta" : ""}`}>
                    {elapsed > 0 ? t("dash.resume") : t("dash.start")}
                  </button>
                ) : (
                  <button onClick={pauseWithFeedback}
                    className="min-w-0 flex-1 rounded-2xl px-4 py-3 text-base font-semibold transition-colors bt-press sm:flex-none sm:px-10"
                    style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "#fff" }}>
                    {t("dash.pause")}
                  </button>
                )}
                <button
                  onClick={() => { leavePomodoro(); onFinish?.(); onClose?.(); }}
                  disabled={elapsed < 1 || saveStatus === "saving"}
                  className="min-w-0 flex-1 rounded-2xl px-4 py-3 text-base font-semibold transition-colors bt-press sm:flex-none sm:px-10"
                  style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "#fff" }}>
                  {saveStatus === "saving" ? t("common.saving") : t("dash.finish")}
                </button>
              </>
            )}
          </div>

          <button onClick={() => onClose?.()}
            className="relative z-10 mt-6 flex items-center gap-2 text-sm font-medium rounded-2xl px-5 py-2.5"
            style={{
              color: "var(--bt-ink-text)",
              opacity: (focusCtlVisible || !running) ? 1 : 0,
              pointerEvents: (focusCtlVisible || !running) ? "auto" : "none",
              transition: "opacity 0.25s ease-out, color 0.2s ease-out",
            }}
            onMouseEnter={e => e.currentTarget.style.color = "#FFFFFF"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--bt-ink-text)"}>
            <Glyph size={14}>
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </Glyph>
            {t("dash.exitFocus")}
          </button>

          {/* Raccourci clavier — desktop uniquement */}
          <p className="hidden sm:block relative z-10 mt-2 text-[11px]"
            style={{
              color: "var(--bt-ink-text)",
              opacity: (focusCtlVisible || !running) ? 1 : 0,
              transition: "opacity 0.25s ease-out",
            }}>
            {t("dash.spaceHint")}
          </p>

        </div>
  );
}
