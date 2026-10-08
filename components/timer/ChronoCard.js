import { useState } from "react";
import Glyph from "../Glyph";
import FilterMenu from "../FilterMenu";
import StudyBlocks, { RestTrack } from "../StudyBlocks";
import TimerDigits from "./TimerDigits";
import { useI18n } from "../../contexts/I18nContext";
import { formatMinutesShort } from "../../lib/format";
import { POMO_BREAK_OPTIONS, POMO_WORK_OPTIONS } from "../../lib/pomodoro.mjs";
import { timerExamUrgency } from "../../lib/timerExamContext.mjs";

// La carte du Chrono — sortie telle quelle de pages/dashboard.js (2026-10-07)
// pour pouvoir s'afficher ailleurs que sur le Dashboard. Elle dessine l'état de
// `chrono` (components/timer/useChrono.js) ; ce qui appartient à la page lui
// arrive par ses props : la liste des cours et l'ajout d'un cours, l'échéance du
// cours choisi, l'ouverture de Focus, ce que font Démarrer et Terminer, et des
// emplacements (`challenge`, `coach`) que le Dashboard remplit avec le défi du
// jour et la mascotte. Elle n'importe rien du Dashboard, de Supabase, du mode
// Découverte ni de la mise en page de l'app.
// `coursePicker={false}` retire le choix du cours (/pomodoro en Pomodoro, où
// il n'est pas nécessaire) ; sans `onAddCourse`, le menu ne propose pas d'en
// ajouter (une page qui ne sait pas créer de cours). `savedLabel` remplace
// « Session enregistrée ! » (/pomodoro : la session reste sur l'appareil).
export default function ChronoCard({
  chrono,
  className = "",
  courses = [],
  activeCourses = [],
  coursePicker = true,
  onPickCourse,
  onAddCourse,
  courseExam = null,
  examDays = null,
  onOpenFocus,
  onStart,
  onFinish,
  saveStatus = "idle",
  savedLabel = null,
  noteEnabled = false,
  hint = null,
  momentShown = false,
  blocksAnchorRef,
  challenge = null,
  coach = null,
}) {
  const { t } = useI18n();
  const {
    courseId, note, setNote, running, elapsed,
    pomodoro, pomoPhase, pomoCount, pomoWorkMin, pomoBreakMin, setPomoBreakMin,
    isPaused, onBreak, pauseSince, pomoTargetSecs, blockGoalSecs, blockUnitSecs,
    blocksAside, blocksAria, liveMessage, focusTidePct,
    sessionGoalMin, sessionGoalChoices, pickSessionGoal, pickMode, pickWorkMin, skipBreak, leavePomodoro,
    pauseWithFeedback,
  } = chrono;
  const [showCourseMenu, setShowCourseMenu] = useState(false);
  // La note ne s'affiche qu'a la demande : un champ toujours ouvert occupait
  // une ligne avant chaque session pour une saisie rare.
  const [noteOpen, setNoteOpen] = useState(false);
  const courseName = (id) => courses.find((c) => c.id === id)?.name || "—";

  return (
    <>
      {/* Backdrop pour fermer le menu cours */}
      {showCourseMenu && (
        <div className="fixed inset-0 z-10" onClick={() => setShowCourseMenu(false)} />
      )}
        {/* ── La carte entière change d'état en pause ──────────────────
            Le lavis vert du travail s'éteint ET la carte prend la teinte
            d'attention : fond, bordure et halo. C'est volontairement fort.
            Ce n'est pas une sémantique d'erreur (voir DESIGN.md § The
            Paused-Timer Exception) : c'est le rappel qu'une session est
            ouverte et que le temps n'est plus compté. Les étudiants mettent
            en pause, se laissent distraire, et oublient de relancer — un
            traitement discret leur coûtait des heures de travail non
            enregistrées. */}
        <section className={["bt-dashboard-timer", className, "card relative min-w-0 overflow-hidden"].filter(Boolean).join(" ")}
          style={{
            // La carte isole ses calques (globals.css) : menu des cours ouvert,
            // elle doit passer devant le voile de fermeture (z-10), sinon
            // chaque choix tombait sur le voile et refermait le menu.
            zIndex: showCourseMenu ? 11 : undefined,
            backgroundColor: isPaused ? "var(--bt-pause-bg)" : "var(--bt-surface)",
            backgroundImage: isPaused ? "none" : "radial-gradient(90% 75% at 50% 100%, var(--bt-timer-wash), transparent 72%), linear-gradient(180deg, var(--bt-surface), var(--bt-timer-base))",
            borderColor:     isPaused ? "var(--bt-pause-border)" : "var(--bt-border)",
            boxShadow:       isPaused ? "0 4px 32px var(--bt-pause-shadow)" : "0 4px 32px var(--bt-shadow)",
          }}>

          {/* Halo de progression — le fond respire et s'intensifie avec la
              session (opacité seule : GPU, aucun re-layout) */}
          <div aria-hidden className="absolute inset-x-0 bottom-0 pointer-events-none"
            style={{
              height: "58%",
              background: "radial-gradient(ellipse at 50% 100%, rgba(var(--bt-brand-rgb), 0.10), transparent 70%)",
              opacity: (running || elapsed > 0) && !isPaused ? 0.35 + focusTidePct * 0.65 : 0,
              transition: "opacity 1.5s ease",
            }} />

          {/* ── Barre de contexte : cours actif · modes · plein écran ──
              z-30 et non z-20 : le défi du jour, juste en dessous, est aussi
              en z-20 et vient APRÈS dans le DOM — il recouvrait donc le menu
              des cours ouvert. */}
          <div className="relative z-30 grid grid-cols-[minmax(0,1fr)_auto] gap-2 px-4 pt-4 sm:px-6 sm:pt-5">
            <div className="flex min-w-0 items-center gap-2">
              {coursePicker && (
              <div className="relative min-w-0 flex-1">
                {activeCourses.length === 0 ? (onAddCourse && (
                  <button type="button" onClick={() => onAddCourse?.()} className="bt-dashboard-control flex min-h-11 w-full items-center justify-center rounded-xl border border-dashed px-3 text-sm font-semibold" style={{ borderColor: "var(--bt-border)", color: "var(--bt-accent-text)" }}>
                    {t("courseEditor.addTitle")}
                  </button>
                )) : (
                  <button
                    type="button"
                    onClick={() => !running && setShowCourseMenu((value) => !value)}
                    disabled={running}
                    className="bt-dashboard-control flex min-h-11 max-w-full flex-col items-stretch justify-center gap-0.5 rounded-xl px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      width: "100%",
                      backgroundColor: "var(--bt-subtle)",
                      border: `1px solid ${showCourseMenu ? "var(--bt-accent)" : "var(--bt-border)"}`,
                      boxShadow: showCourseMenu ? "0 0 0 3px rgba(var(--bt-brand-rgb), 0.12)" : "none",
                      color: courseId ? "var(--bt-text-1)" : "var(--bt-text-3)",
                    }}
                    aria-haspopup="listbox"
                    aria-expanded={showCourseMenu}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {courseId && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: courses.find((item) => item.id === courseId)?.color }} aria-hidden="true" />}
                      <span className="min-w-0 flex-1 truncate text-left">{courseId ? courseName(courseId) : t("dash.selectCourse")}</span>
                      {!running && (
                        <Glyph size={14} className={`shrink-0 transition-transform duration-200 motion-reduce:transition-none ${showCourseMenu ? "rotate-180" : ""}`}>
                          <path d="m6 9 6 6 6-6" />
                        </Glyph>
                      )}
                    </span>
                    {courseExam && <span className="bt-timer-exam-context" data-urgency={timerExamUrgency(examDays)}>
                      <Glyph size={12} aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 9h18"/></Glyph>
                      <span className="sr-only">{t("plan.examTag")} · </span>
                      <span className="font-num tabular-nums">{examDays === 0 ? t("exam.today") : examDays < 0 ? t("exam.passed") : t("exam.daysAway").replace("{n}", String(examDays))}</span>
                    </span>}
                  </button>
                )}

                {showCourseMenu && !running && (
                  <div className="bt-dashboard-menu absolute left-0 top-full z-30 mt-1.5 w-72 max-w-[calc(100vw-3.5rem)] overflow-hidden rounded-2xl" style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-hairline)", boxShadow: "0 14px 38px var(--bt-shadow)" }}>
                    <div className="max-h-64 overflow-y-auto py-1" role="listbox" aria-label={t("dash.selectCourse")}>
                      {activeCourses.map((course) => (
                        <button key={course.id} type="button" role="option" aria-selected={courseId === course.id} onClick={() => { onPickCourse?.(course.id); setShowCourseMenu(false); }} className="bt-dashboard-menu-item flex min-h-11 w-full items-center gap-3 px-4 text-left">
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: course.color }} aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>{course.name}</span>
                          {courseId === course.id && (
                            <Glyph size={15} strokeWidth={2.5} style={{ color: "var(--bt-accent)" }}>
                              <path d="m20 6-11 11-5-5" />
                            </Glyph>
                          )}
                        </button>
                      ))}
                    </div>
                    {onAddCourse && (
                    <div className="border-t p-1" style={{ borderColor: "var(--bt-border)" }}>
                      <button
                        type="button"
                        onClick={() => { setShowCourseMenu(false); onAddCourse(); }}
                        className="bt-dashboard-menu-item flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-bold"
                        style={{ color: "var(--bt-accent-text)" }}
                      >
                        <Glyph size={16}>
                          <path d="M12 5v14M5 12h14" />
                        </Glyph>
                        {t("courseEditor.addTitle")}
                      </button>
                    </div>
                    )}
                  </div>
                )}
              </div>
              )}

            </div>

            {/* Rayon aligne sur le selecteur de cours et le bouton Focus qui
                l'encadrent : en pilule, ce rail etait la seule forme ronde de
                la rangee. Et les deux options se partagent la largeur — placees
                dans une colonne `1fr`, elles restaient collees a gauche en
                laissant un tiers de rail vide. */}
            <button type="button" onClick={() => onOpenFocus?.()} className="bt-dashboard-control flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold" style={{ backgroundColor: "var(--bt-accent-bg)", border: "1px solid var(--bt-accent-border)", color: "var(--bt-accent-text)" }}>
              <Glyph size={16}>
                <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
                <circle cx="12" cy="12" r="2.5" />
              </Glyph>
              <span>{t("dash.focusShort")}</span>
            </button>
          </div>

          {/* Emplacement sous le cours et avant le bouton Démarrer (le
              Dashboard y place le Défi du jour). */}
          {challenge}

          {/* ── Héros : chiffres + onde de session + ligne vivante ── */}
          <div className="px-4 pb-3 pt-8 text-center sm:px-6 sm:pt-10">
            {pomodoro && (
              <div role="status" className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em]"
                style={{ color: pomoPhase === "work" ? "var(--bt-accent-text)" : "var(--bt-text-2)" }}>
                {pomoPhase === "work" ? t("dash.work") : t("dash.pause")}
                {pomoCount > 0 && <span className="font-medium ml-2 opacity-60">· {t("dash.cycle")} {pomoCount}</span>}
              </div>
            )}
            {/* La pastille d'état, franche et qui respire. Elle porte sa durée :
                « En pause · 04:12 » répond d'un coup à « depuis quand est-ce
                que je ne compte plus ? », ce qui est précisément la question
                d'un retour de distraction.
                L'annonce vocale est portée par un compagnon invisible au texte
                FIXE. Mettre `role="status"` sur la pastille elle-même aurait
                relu « En pause · 04:13 » à chaque seconde — un lecteur d'écran
                serait devenu inutilisable. La durée reste lisible à la demande,
                elle n'est simplement pas dans une région vivante. */}
            {isPaused && !pomodoro && (
              <div className="mb-3 flex justify-center">
                <span className="sr-only" role="status">{t("dash.pausedStatus")}</span>
                <span className="bt-pause-pulse inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em]"
                  style={{ color: "#FFFFFF", backgroundColor: "var(--bt-pause-strong)", border: "1px solid var(--bt-pause-strong)" }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                  <span className="font-num tabular-nums">{t("dash.pausedFor").replace("{t}", pauseSince)}</span>
                </span>
              </div>
            )}

            {/* Les chiffres passent à la teinte d'attention : c'est l'élément le
                plus grand de l'écran, donc le plus sûr à reconnaître de loin. */}
            <TimerDigits
              seconds={pomodoro ? Math.max(0, pomoTargetSecs - elapsed) : elapsed}
              color={isPaused && !pomodoro ? "var(--bt-pause)" : "var(--bt-text-1)"} />

            {(running || elapsed > 0) && (
            <div ref={blocksAnchorRef} className="mx-auto mt-5 w-full max-w-[440px] sm:mt-6">
              {/* Sur téléphone, la bulle d'un jalon se pose sur ces légendes :
                  elles s'effacent sans quitter leur place pendant que le coach
                  parle (globals.css), au lieu de dépasser à moitié de la bulle. */}
              <div data-coach-under="studyBlocks" className="mb-2 flex items-center justify-between gap-3 text-xs" style={{ color: "var(--bt-text-3)" }}>
                <span className="flex min-w-0 items-center gap-2">
                  {/* Sous 380 px, « Blocs de la session » se reduisait a
                      « Blo… » : la pastille d'unite dit deja de quoi parle la
                      rangee. « Pause », lui, reste — c'est le seul libelle de
                      la piste de repos. */}
                  <span className={onBreak ? "truncate" : "hidden truncate xs:inline"}>
                    {onBreak ? t("dash.pause") : t("dash.sessionBlocks")}
                  </span>
                  {/* L'unité est écrite parce qu'elle CHANGE : quinze minutes
                      sur une session courte, une heure sur une journée de
                      blocus. Compresser sans le dire rendrait la piste
                      ambiguë. */}
                  {!onBreak && (
                  <span className="bt-timer-unit-context shrink-0 text-[11px] font-semibold tabular-nums" style={{ color: "var(--bt-text-2)" }}>
                    {t("dash.blockUnitLabel").replace("{u}", formatMinutesShort(blockUnitSecs))}
                  </span>
                  )}
                </span>
                {blocksAside && (
                  <span className="font-num shrink-0 font-semibold tabular-nums">{blocksAside}</span>
                )}
              </div>
              {onBreak ? (
                <RestTrack
                  remainingSecs={Math.max(0, pomoTargetSecs - elapsed)}
                  totalSecs={pomoTargetSecs}
                  label={t("dash.breakAria").replace("{t}", formatMinutesShort(Math.max(0, pomoTargetSecs - elapsed)))}
                />
              ) : (
                <StudyBlocks
                  earnedSecs={elapsed}
                  plannedSecs={blockGoalSecs}
                  running={running}
                  paused={isPaused}
                  maxUnits={12}
                  label={blocksAria}
                />
              )}
            </div>
            )}

            {/* La ligne ordinaire reste textuelle. Un vrai jalon apparaît
                hors de la grille, ancré à la piste qui l'a produit ; la ligne
                s'efface alors sans quitter sa place, pour que rien ne bouge à
                l'apparition ni à la fermeture du coach. */}
            {(liveMessage || hint) && (
              <div className="mt-4 flex items-center justify-center"
                style={momentShown ? { visibility: "hidden" } : undefined} aria-hidden={momentShown ? true : undefined}>
                <p key={liveMessage || hint} className={`text-sm ${isPaused ? "font-medium" : "bt-msg-swap"}`}
                  style={{ color: isPaused ? "var(--bt-pause-text)" : "var(--bt-text-3)" }}>
                  {liveMessage || hint}
                </p>
              </div>
            )}
          </div>

          {/* ── Reglages de session — compacts, entre le chrono et l'action ──
               Avant : six pastilles d'objectif + une bascule Libre/Pomodoro
               dans le bandeau + un champ note toujours ouvert, soit neuf
               controles a franchir avant « Demarrer ». Meme fonctions, meme
               valeurs, mais reduites a trois libelles qui disent deja leur
               etat. Rien n'est retire : tout est a un tap. */}
          {!running && elapsed === 0 && (
            <div className="mt-3 px-4 sm:px-6">
              <div className="mx-auto flex max-w-md flex-wrap items-center justify-center gap-2">
                <FilterMenu
                  value={pomodoro ? "pomodoro" : "free"}
                  options={[{ value: "free", label: t("dash.free") }, { value: "pomodoro", label: "Pomodoro" }]}
                  onChange={pickMode}
                  ariaLabel={t("dash.modeLabel")}
                  align="left"
                />
                {!pomodoro && (
                  <FilterMenu
                    value={sessionGoalMin == null ? "none" : String(sessionGoalMin)}
                    options={sessionGoalChoices.map(([m, label]) => ({
                      value: m == null ? "none" : String(m),
                      label: m == null ? t("dash.noGoal") : label,
                    }))}
                    onChange={(v) => pickSessionGoal(v === "none" ? null : Number(v))}
                    ariaLabel={t("dash.sessionGoalLabel")}
                    align="left"
                  />
                )}
                {pomodoro && (
                  <>
                    <FilterMenu
                      value={String(pomoWorkMin)}
                      options={POMO_WORK_OPTIONS.map((m) => ({ value: String(m), label: `${m} min` }))}
                      onChange={(v) => pickWorkMin(Number(v))}
                      ariaLabel={t("dash.workDuration")}
                      align="left"
                    />
                    <FilterMenu
                      value={String(pomoBreakMin)}
                      options={POMO_BREAK_OPTIONS.map((m) => ({ value: String(m), label: `${m} min` }))}
                      onChange={(v) => setPomoBreakMin(Number(v))}
                      ariaLabel={t("dash.breakDuration")}
                      align="left"
                    />
                  </>
                )}
                {noteEnabled && (!pomodoro || pomoPhase === "work") && !noteOpen && !note && (
                  <button type="button" onClick={() => setNoteOpen(true)}
                    className="bt-filter-btn inline-flex min-h-8 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold">
                    <Glyph size={12}>
                      <path d="M12 5v14M5 12h14" />
                    </Glyph>
                    {t("dash.noteLabel")}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Note — champ discret, souligné au focus seulement ── */}
          {noteEnabled && (!pomodoro || pomoPhase === "work") && (noteOpen || note || running || elapsed > 0) && (
            <div className="mt-3 px-4 sm:px-6">
              <label htmlFor="dashboard-session-note" className="sr-only">{t("dash.noteLabel")}</label>
              <input
                id="dashboard-session-note"
                autoFocus={noteOpen && !note}
                className="mx-auto block min-h-11 w-full max-w-xs bg-transparent py-2 text-center text-sm outline-none"
                style={{ color: "var(--bt-text-1)", borderBottom: "1px solid transparent", transition: "border-color 0.2s" }}
                onFocus={e => { e.currentTarget.style.borderBottomColor = "var(--bt-border)"; }}
                onBlur={e => { e.currentTarget.style.borderBottomColor = "transparent"; }}
                placeholder={t("dash.notePlaceholder")}
                value={note}
                onChange={(e) => setNote(e.target.value)} />
            </div>
          )}

          {/* ── Actions ── */}
          <div className="px-4 pb-4 pt-4 sm:px-6 sm:pb-5 sm:pt-5">
            {pomoPhase === "break" && pomodoro ? (
              <div className="max-w-md mx-auto">
                <button className="btn-ghost w-full py-3 text-sm"
                  onClick={skipBreak}>
                  {t("dash.skipBreak")} →
                </button>
              </div>
            ) : (
              <div className="flex flex-col xs:flex-row items-stretch justify-center gap-2.5 max-w-md mx-auto">
                {!running ? (
                  <button
                    className="bt-dashboard-control btn-hero btn-raised flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-extrabold"
                    style={{
                      opacity: (!courseId && !pomodoro) ? 0.45 : 1,
                    }}
                    onClick={() => onStart?.()}
                    disabled={!courseId && !pomodoro}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    {elapsed > 0 ? t("dash.resume") : t("dash.start")}
                  </button>
                ) : (
                  <button
                    className="bt-dashboard-control flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-bold"
                    style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-1)", border: "1px solid var(--bt-hairline)" }}
                    onClick={pauseWithFeedback}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                    </svg>
                    {t("dash.pause")}
                  </button>
                )}
                {(elapsed >= 1 || saveStatus !== "idle") && (
                  <button
                    className="bt-dashboard-control flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-bold"
                    style={{
                      backgroundColor: saveStatus === "success" ? "var(--bt-success-bg)"
                        : saveStatus === "error" ? "var(--bt-danger-solid)"
                        : "var(--bt-text-1)",
                      color: saveStatus === "success" ? "var(--bt-success)" : saveStatus === "error" ? "#fff" : "var(--bt-surface)",
                      opacity: (elapsed < 1 && saveStatus === "idle") || saveStatus === "saving" ? 0.45 : 1,
                    }}
                    onClick={() => { leavePomodoro(); onFinish?.(); }}
                    disabled={elapsed < 1 || saveStatus === "saving"}>
                    {saveStatus === "saving" ? (
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : saveStatus === "success" ? (
                      <Glyph size={13}>
                        <polyline points="20 6 9 17 4 12"/>
                      </Glyph>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                      </svg>
                    )}
                    {saveStatus === "saving"  ? t("common.saving")
                      : saveStatus === "success" ? (savedLabel || t("dash.saveSuccess"))
                      : saveStatus === "error"   ? t("dash.saveError")
                      : t("dash.finish")}
                  </button>
                )}
              </div>
            )}
            <p className="mt-3 hidden text-center text-[11px] sm:block" style={{ color: "var(--bt-text-4)" }}>{t("dash.subtitle")}</p>
          </div>
          {coach}
        </section>
    </>
  );
}
