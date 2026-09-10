import { useEffect, useRef, useState } from "react";
import Glyph from "./Glyph";
import MascotMoment from "./MascotMoment";
import { MissionRow, WeeklyRow } from "./MissionRows";
import { useI18n } from "../contexts/I18nContext";
import { weeklyRatio, weeklyRemaining } from "../lib/missionText";

// Les objectifs du jour, dans le rail du chrono.
//
// ── Deux densités, une seule carte ──────────────────────────
// La divulgation progressive est une stratégie de PETIT ÉCRAN. Sur desktop il
// y a de la place : replier la liste derrière un chevron y gaspille la colonne
// et ajoute un clic pour lire quatre lignes. Pire, la version repliée n'était
// plus une carte, c'était un fragment — un titre, quatre points gris, un
// niveau — qui ne disait rien à personne.
//
// Donc : la liste est TOUJOURS dépliée à partir de 1024 px, et repliable
// seulement en dessous. Le pliage se fait SUR PLACE, jamais dans une boîte
// modale : lire ses propres missions ne demande ni interruption ni protection
// du focus, et un voile noir sur toute l'app pour quatre cases à cocher est
// hors de proportion.
//
// Le choix desktop/mobile passe par des classes, pas par une media query
// JavaScript : rien à hydrater, rien à faire clignoter au premier rendu.

const EXPAND_KEY = "bt_goals_expanded";

function readExpanded() {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(EXPAND_KEY) === "1"; } catch { return false; }
}

// Résumé compact — mobile replié uniquement. Une pastille par objectif du jour,
// celle du défi porte un anneau : c'est le seul des quatre qui soit
// personnalisé, il ne doit pas se confondre avec les trois autres.
function Dots({ items }) {
  return (
    <span className="flex items-center gap-1.5" aria-hidden="true">
      {items.map((it, i) => (
        <span key={i} className="rounded-full"
          style={{
            width: it.lead ? 11 : 9,
            height: it.lead ? 11 : 9,
            backgroundColor: it.done ? "var(--bt-accent)" : "var(--bt-subtle)",
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
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { setExpanded(readExpanded()); }, []);

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    try { window.localStorage.setItem(EXPAND_KEY, next ? "1" : "0"); } catch {}
  }

  const all = challenge ? [challenge, ...missions] : missions;
  const doneCount = all.filter(m => m.done).length;

  // ── Ne fêter qu'une TRANSITION ────────────────────────────
  // Le premier rendu arrive avec une liste VIDE — les données n'ont pas encore
  // répondu. Semer la référence à ce moment-là faisait passer le premier
  // chargement réel pour un exploit : la mascotte félicitait à chaque ouverture
  // pour un défi acquis depuis lundi. On ne sème qu'à la première réponse qui
  // contient réellement quelque chose.
  const seenDone = useRef(null);
  const [justWon, setJustWon] = useState(null);
  useEffect(() => {
    if (!weekly.length) return;
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
  // Replié : visible seulement sous 1024 px. Déplié : visible partout.
  const listCls = expanded ? "mt-3" : "mt-3 hidden lg:block";

  return (
    <section className={`card min-w-0 p-4 sm:p-5 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold" style={{ color: "var(--bt-text-1)" }}>{t("xp.summaryTitle")}</h2>
        <div className="flex items-center gap-2">
          <span className="font-num inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-bold tabular-nums"
            style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }}>
            {doneCount}/{all.length}
          </span>
          {/* Le pli n'existe que là où la place manque. */}
          {/* La zone de tap fait 44 px — la règle tactile du système — mais la
              pastille visible en fait 32 : un rond de 44 px à côté d'une puce
              de compteur de 28 pèserait plus que le titre. La marge négative
              évite que la zone élargie ne pousse la rangée. */}
          <button type="button" onClick={toggle} aria-expanded={expanded}
            className="lg:hidden -my-1.5 -mr-1.5 flex h-11 w-11 items-center justify-center"
            aria-label={expanded ? t("xp.collapseGoals") : t("xp.expandGoals")}>
            <span className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-3)" }}>
              <Glyph size={16} className={`transition-transform duration-200 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}>
                <path d="m6 9 6 6 6-6" />
              </Glyph>
            </span>
          </button>
        </div>
      </div>

      {/* Replié sur mobile : les pastilles suffisent à dire où on en est. */}
      {!expanded && (
        <div className="mt-3 flex items-center justify-between gap-4 lg:hidden">
          <Dots items={all.map((m, i) => ({ done: m.done, lead: Boolean(challenge) && i === 0 }))} />
          {weekly.length > 0 && (
            <span className="flex items-center gap-2">
              <span className="text-[11px] font-semibold" style={{ color: "var(--bt-text-3)" }}>{t("xp.weeklyShort")}</span>
              <span className="flex items-center gap-1" aria-hidden="true">
                {weekly.map(w => (
                  <span key={w.id} className="h-1.5 w-6 overflow-hidden rounded-full" style={{ backgroundColor: "var(--bt-subtle)" }}>
                    <span className="block h-full origin-left rounded-full transition-transform duration-300 motion-reduce:transition-none"
                      style={{ transform: `scaleX(${weeklyRatio(w)})`, backgroundColor: "var(--bt-accent)" }} />
                  </span>
                ))}
              </span>
              {/* Deux barres sans chiffre ne disent pas combien il en reste. */}
              <span className="font-num text-[11px] font-bold tabular-nums" style={{ color: "var(--bt-text-3)" }}>
                {weekly.filter(w => w.done).length}/{weekly.length}
              </span>
            </span>
          )}
        </div>
      )}

      <div className={listCls}>
        <ul className="flex flex-col gap-1.5">
          {challenge && (
            // Le défi figure ici comme n'importe quel objectif du jour : c'est
            // la liste de la journée, elle doit être complète. Sa version
            // détaillée et actionnable vit contre le bouton Start.
            <MissionRow row={challenge} t={t} lead />
          )}
          {missions.map((m, i) => <MissionRow key={m.id || i} row={m} t={t} />)}
        </ul>

        {weekly.length > 0 && (
          <div className="mt-4 border-t pt-3.5" style={{ borderColor: "var(--bt-hairline)" }}>
            <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--bt-text-3)" }}>
              {t("xp.weeklyTitle")}
            </p>
            <ul className="flex flex-col gap-3">
              {weekly.map((w, i) => <WeeklyRow key={w.id || i} row={w} t={t} />)}
            </ul>
          </div>
        )}
      </div>

      {level && (
        <div className="mt-3.5 flex items-center gap-2.5 border-t pt-3" style={{ borderColor: "var(--bt-hairline)" }}>
          <span className="font-num shrink-0 rounded-lg px-1.5 py-0.5 text-[11px] font-extrabold tabular-nums"
            style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }}>
            {t("xp.level")} {level.level}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-semibold" style={{ color: "var(--bt-text-2)" }}>
            {t(level.titleKey)}
          </span>
          <span className="font-num shrink-0 text-[11px] tabular-nums" style={{ color: "var(--bt-text-3)" }}>
            {levelInfo.next ? `${levelInfo.progressXP}/${levelInfo.rangeXP}` : t("xp.maxLevel")}
          </span>
          <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full" style={{ backgroundColor: "var(--bt-subtle)" }}
            role="progressbar" aria-label={t("xp.cardTitle")}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={levelInfo.progressPct || 0}>
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
  );
}
