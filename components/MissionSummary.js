import { useEffect, useRef, useState } from "react";
import Glyph from "./Glyph";
import DetailSheet from "./DetailSheet";
import MascotMoment from "./MascotMoment";
import { MissionRow, ChallengeRow, WeeklyRow } from "./MissionRows";
import { useI18n } from "../contexts/I18nContext";
import { weeklyRatio, weeklyRemaining } from "../lib/missionText";

// La bande d'objectifs du chrono.
//
// Avant : une carte de 774 px — plus haute que l'écran — posée à côté du
// chronomètre. Elle redisait ce que la page disait déjà : « 8h30 cette
// semaine » y figurait deux fois, à trois cents pixels d'écart, et trois
// systèmes différents répondaient à « combien j'ai travaillé aujourd'hui ».
//
// Une surface principale ne porte que ce qui change la PROCHAINE ACTION. Le
// défi du jour la change — il est remonté contre le bouton Start. Le reste ne
// la change pas : il devient un objet qu'on regarde, pas qu'on lit. Quatre
// pastilles pour la journée, trois segments pour la semaine, une ligne de
// niveau. Le détail complet est à un tap, dans la feuille.
//
// C'est le geste des anneaux d'activité : un objet dense et lisible d'un coup
// d'œil, le déroulé sur demande.

function Dots({ items }) {
  return (
    <span className="flex items-center gap-1.5" aria-hidden="true">
      {items.map((it, i) => (
        <span key={i}
          className="rounded-full transition-colors"
          style={{
            width: it.lead ? 11 : 9,
            height: it.lead ? 11 : 9,
            backgroundColor: it.done ? "var(--bt-accent)" : "var(--bt-subtle)",
            // Le défi porte un anneau : c'est le seul des quatre qui soit
            // personnalisé, il ne doit pas se confondre avec les trois autres.
            boxShadow: it.lead
              ? `0 0 0 2px var(--bt-surface), 0 0 0 3.5px var(--bt-accent-${it.done ? "dark" : "border"})`
              : "none",
          }} />
      ))}
    </span>
  );
}

export default function MissionSummary({
  missions = [], challenge = null, weekly = [], levelInfo = null, streak = 0, className = "",
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const all = challenge ? [challenge, ...missions] : missions;
  const doneCount = all.filter(m => m.done).length;
  const weeklyDone = weekly.filter(w => w.done).length;

  // ── Ne fêter qu'une TRANSITION ────────────────────────────
  // Une mission déjà remplie au premier rendu n'est pas un exploit qu'on vient
  // d'accomplir : c'est un état. Sans ce garde-fou, la mascotte félicitait à
  // chaque ouverture pour un défi hebdomadaire acquis depuis lundi.
  const seenDone = useRef(null);
  const [justWon, setJustWon] = useState(null);
  useEffect(() => {
    const ids = new Set(weekly.filter(w => w.done).map(w => w.id));
    if (seenDone.current === null) { seenDone.current = ids; return; }
    const fresh = [...ids].find(id => !seenDone.current.has(id));
    seenDone.current = ids;
    if (fresh) setJustWon(fresh);
  }, [weekly]);

  const nearly = weekly.find(w => !w.done && weeklyRatio(w) >= 0.7);
  const moment =
    justWon
      ? { key: `weekly-done-${justWon}`, mood: "celebrating", message: t("mascot.weeklyDone") }
      : (all.length >= 4 && doneCount === all.length)
        ? { key: "perfect-day", mood: "celebrating", message: t("mascot.perfectDay") }
        : nearly
          ? { key: `weekly-close-${nearly.id}`, mood: "focused",
              message: t("mascot.weeklyClose").replace("{left}", weeklyRemaining(t, nearly)) }
          : null;

  const level = levelInfo?.current || null;

  return (
    <>
      <section className={`card min-w-0 p-4 sm:p-5 ${className}`}>
        <button type="button" onClick={() => setOpen(true)}
          className="flex w-full items-center justify-between gap-3 text-left">
          <span className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t("xp.summaryTitle")}</span>
          <span className="flex items-center gap-1.5">
            <span className="font-num inline-flex min-h-6 items-center rounded-full px-2 text-xs font-bold tabular-nums"
              style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }}>
              {doneCount}/{all.length}
            </span>
            <Glyph size={16} style={{ color: "var(--bt-text-4)" }}><polyline points="9 18 15 12 9 6" /></Glyph>
          </span>
        </button>

        <div className="mt-2.5 flex items-center justify-between gap-4">
          <Dots items={all.map((m, i) => ({ done: m.done, lead: challenge && i === 0 }))} />
          {weekly.length > 0 && (
            <span className="flex items-center gap-2">
              <span className="text-[11px] font-semibold" style={{ color: "var(--bt-text-3)" }}>
                {t("xp.weeklyShort")}
              </span>
              <span className="flex items-center gap-1" aria-hidden="true">
                {weekly.map(w => (
                  <span key={w.id} className="h-1.5 w-6 overflow-hidden rounded-full"
                    style={{ backgroundColor: "var(--bt-subtle)" }}>
                    <span className="block h-full origin-left rounded-full transition-transform duration-300 motion-reduce:transition-none"
                      style={{ transform: `scaleX(${weeklyRatio(w)})`, backgroundColor: "var(--bt-accent)" }} />
                  </span>
                ))}
              </span>
              <span className="font-num text-[11px] font-bold tabular-nums" style={{ color: "var(--bt-text-3)" }}>
                {weeklyDone}/{weekly.length}
              </span>
            </span>
          )}
        </div>

        {level && (
          <div className="mt-3 flex items-center gap-2.5 border-t pt-2.5" style={{ borderColor: "var(--bt-hairline)" }}>
            <span className="font-num shrink-0 rounded-lg px-1.5 py-0.5 text-[11px] font-extrabold tabular-nums"
              style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }}>
              {t("xp.level")} {level.level}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-semibold" style={{ color: "var(--bt-text-2)" }}>
              {t(level.titleKey)}
            </span>
            <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full" style={{ backgroundColor: "var(--bt-subtle)" }}
              role="progressbar" aria-label={t("xp.cardTitle")}
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={levelInfo.progressPct}>
              <span className="block h-full origin-left rounded-full transition-transform duration-300 motion-reduce:transition-none"
                style={{ transform: `scaleX(${(levelInfo.progressPct || 0) / 100})`, backgroundColor: "var(--bt-accent)" }} />
            </span>
          </div>
        )}

        {moment && (
          <MascotMoment
            eventKey={moment.key}
            message={moment.message}
            mood={moment.mood}
            frequency="daily"
            presentation="bubble"
            streak={streak}
            className="mt-3"
          />
        )}
      </section>

      <DetailSheet open={open} title={t("xp.sheetTitle")} closeLabel={t("coach.close")} onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-4 px-5">
          {challenge && <ChallengeRow challenge={challenge} t={t} />}

          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--bt-text-3)" }}>
              {t("xp.missions")}
            </p>
            <ul className="flex flex-col gap-1.5">
              {missions.map((m, i) => <MissionRow key={m.id || i} row={m} t={t} />)}
            </ul>
          </div>

          {weekly.length > 0 && (
            <div className="border-t pt-4" style={{ borderColor: "var(--bt-hairline)" }}>
              <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--bt-text-3)" }}>
                {t("xp.weeklyTitle")}
              </p>
              <ul className="flex flex-col gap-3">
                {weekly.map((w, i) => <WeeklyRow key={w.id || i} row={w} t={t} />)}
              </ul>
            </div>
          )}

          {levelInfo?.next && (
            <p className="font-num border-t pt-3 text-center text-xs tabular-nums"
              style={{ borderColor: "var(--bt-hairline)", color: "var(--bt-text-3)" }}>
              {levelInfo.progressXP} / {levelInfo.rangeXP} {t("xp.xpLabel")} · {t("xp.nextLevel")} : {t(levelInfo.next.titleKey)}
            </p>
          )}
        </div>
      </DetailSheet>
    </>
  );
}
