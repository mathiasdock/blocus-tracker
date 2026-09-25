import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useI18n } from "../contexts/I18nContext";
import { localISO, formatStudyTime } from "../lib/format";

const LEVELS = [
  "var(--bt-border)",
  "rgba(20, 184, 133, 0.20)",
  "rgba(20, 184, 133, 0.45)",
  "rgba(20, 184, 133, 0.70)",
  "rgba(20, 184, 133, 1.00)",
];

// Les paliers se lisent sur les SECONDES. Avant, chaque session était arrondie
// à la minute AVANT d'être additionnée : deux sessions de 40 s donnaient ici
// « 2 min » pendant que le total de la page, qui somme les secondes, affichait
// « 1 min ». Pire, une seule session de 20 s devenait 0 minute, donc une case
// vide — une journée réellement étudiée disparaissait de la grille alors
// qu'elle comptait dans la série. Toute durée strictement positive a
// maintenant sa case.
function getLevel(seconds) {
  if (!(seconds > 0)) return 0;
  if (seconds < 1800) return 1;   // moins de 30 min
  if (seconds < 3600) return 2;   // moins d'une heure
  if (seconds < 7200) return 3;   // moins de deux heures
  return 4;
}

// Légende : ce que veut dire une teinte. Le dernier palier est « 2 h et plus »
// — toutes les grosses journées s'y ressemblent, et c'est écrit : une case plus
// foncée n'a pas forcément duré plus longtemps qu'une autre case foncée. La
// durée exacte reste dans la ligne de détail.
const LEGEND = [
  { level: 0, key: "heatmap.levelNone" },
  { level: 1, key: "heatmap.levelUnder30" },
  { level: 2, key: "heatmap.level30to60" },
  { level: 3, key: "heatmap.level1to2" },
  { level: 4, key: "heatmap.level2plus" },
];

const MONTH_LABELS = {
  fr: ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

const NUM_WEEKS = 53;
const CELL = 12;
const GAP  = 3;

function shiftISO(iso, days) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return localISO(d);
}

// Grille d'activité sur 53 semaines.
//
// La valeur exacte d'une case n'était atteignable qu'au SURVOL : au doigt elle
// n'existait pas, au clavier la grille était inatteignable, et un lecteur
// d'écran ne voyait que 371 carrés sans nom. Trois-cent-soixante-onze tabulations
// seraient pires que le problème : la grille est donc UN seul arrêt de
// tabulation, et les flèches déplacent le jour actif (← → d'une semaine,
// ↑ ↓ d'un jour). La case active porte son libellé complet, et la ligne de
// détail sous la grille écrit la même chose pour tout le monde — souris,
// doigt ou clavier.
export default function StudyHeatmap({ days = [] }) {
  const { t, lang } = useI18n();
  const [activeIso, setActiveIso] = useState(null);
  const [hoverIso, setHoverIso] = useState(null);
  const scrollRef = useRef(null);
  const gridRef = useRef(null);
  const keyboardRef = useRef(false);

  // Auto-scroll right so the current week (rightmost) is visible on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, []);

  // Une case = un jour de session_days (lib/studyDays.mjs) : une session qui
  // passe minuit colore ses deux jours, chacun pour sa part, et le jour d'une
  // session ne bouge plus quand l'appareil change de fuseau. Les cases, elles,
  // restent datées dans le calendrier local de l'appareil.
  const daySecs = useMemo(() => {
    const out = {};
    days.forEach((row) => {
      out[row.local_date] = (out[row.local_date] || 0) + (Number(row.seconds) || 0);
    });
    return out;
  }, [days]);

  const { weeks, todayIso, firstIso } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayOfWeek = (today.getDay() + 6) % 7; // Mon=0, Sun=6
    const out = [];
    for (let w = NUM_WEEKS - 1; w >= 0; w--) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(today);
        date.setDate(today.getDate() - dayOfWeek - w * 7 + d);
        const iso = localISO(date);
        week.push({ iso, isFuture: date > today });
      }
      out.push(week);
    }
    return { weeks: out, todayIso: localISO(today), firstIso: out[0][0].iso };
  }, []);

  const months = MONTH_LABELS[lang] || MONTH_LABELS.fr;
  const monthLabelMap = useMemo(() => {
    const set = new Set();
    let prevMonth = -1;
    weeks.forEach((week, wi) => {
      const m = new Date(week[0].iso + "T12:00:00").getMonth();
      if (m !== prevMonth) { set.add(wi); prevMonth = m; }
    });
    return set;
  }, [weeks]);

  // Le jour qui porte l'arrêt de tabulation : celui qu'on a choisi, sinon
  // aujourd'hui. On entre donc toujours dans la grille par la date la plus
  // utile, pas par un lundi d'il y a un an.
  const tabIso = activeIso || todayIso;

  const dayLabel = useCallback((iso) => {
    const date = new Date(iso + "T12:00:00").toLocaleDateString(
      lang === "en" ? "en-GB" : "fr-FR",
      { weekday: "long", day: "numeric", month: "long" }
    );
    const secs = daySecs[iso] || 0;
    return `${date} — ${secs > 0 ? formatStudyTime(secs) : t("heatmap.noStudy")}`;
  }, [daySecs, lang, t]);

  useEffect(() => {
    if (!keyboardRef.current || !activeIso || !gridRef.current) return;
    keyboardRef.current = false;
    gridRef.current.querySelector(`[data-iso="${activeIso}"]`)?.focus();
  }, [activeIso]);

  function onKeyDown(e) {
    // ← → changent de SEMAINE (une colonne), ↑ ↓ changent de JOUR : c'est la
    // géométrie de la grille, pas l'ordre du calendrier.
    const step = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }[e.key];
    if (step === undefined && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    let next;
    if (e.key === "Home") next = firstIso;
    else if (e.key === "End") next = todayIso;
    else next = shiftISO(tabIso, step);
    if (next < firstIso || next > todayIso) return;
    keyboardRef.current = true;
    setActiveIso(next);
  }

  const shownIso = hoverIso || activeIso;
  const shownSecs = shownIso ? (daySecs[shownIso] || 0) : 0;

  return (
    <div>
      <div
        ref={scrollRef}
        style={{
          overflowX: "auto",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
        }}
        className="[&::-webkit-scrollbar]:hidden"
      >
        <div style={{ width: "fit-content", paddingBottom: 2 }}>

          {/* Month labels row */}
          <div style={{ display: "flex", gap: GAP, marginBottom: 4, height: 14 }} aria-hidden="true">
            {weeks.map((week, wi) => {
              const showLabel = monthLabelMap.has(wi);
              const m = new Date(week[0].iso + "T12:00:00").getMonth();
              return (
                <div key={wi} style={{ width: CELL, flexShrink: 0, position: "relative" }}>
                  {showLabel && (
                    <span style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      fontSize: 9,
                      fontWeight: 600,
                      color: "var(--bt-text-3)",
                      whiteSpace: "nowrap",
                      letterSpacing: "0.02em",
                    }}>
                      {months[m]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Cells grid */}
          <div ref={gridRef} role="group" aria-label={t("heatmap.title")}
            onKeyDown={onKeyDown} onMouseLeave={() => setHoverIso(null)}
            style={{ display: "flex", gap: GAP }}>
            {weeks.map((week, wi) => (
              <div key={wi} style={{ display: "flex", flexDirection: "column", gap: GAP }}>
                {week.map((day, di) => {
                  const base = {
                    width: CELL, height: CELL, borderRadius: 2, flexShrink: 0,
                    padding: 0, border: 0,
                  };
                  if (day.isFuture) {
                    return <span key={di} aria-hidden="true" style={{ ...base, display: "block", backgroundColor: "transparent" }} />;
                  }
                  const secs = daySecs[day.iso] || 0;
                  const isActive = day.iso === activeIso;
                  return (
                    <button
                      key={di}
                      type="button"
                      data-iso={day.iso}
                      tabIndex={day.iso === tabIso ? 0 : -1}
                      aria-label={dayLabel(day.iso)}
                      aria-pressed={isActive}
                      onClick={() => setActiveIso(day.iso === activeIso ? null : day.iso)}
                      onMouseEnter={() => setHoverIso(day.iso)}
                      onFocus={() => setHoverIso(day.iso)}
                      onBlur={() => setHoverIso(null)}
                      className="bt-heatmap-cell"
                      style={{
                        ...base,
                        backgroundColor: LEVELS[getLevel(secs)],
                        boxShadow: isActive ? "0 0 0 1.5px var(--bt-text-1)" : undefined,
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <ul className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1" aria-label={t("heatmap.legendLabel")}>
        {LEGEND.map(({ level, key }) => (
          <li key={level} className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--bt-text-2)" }}>
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: LEVELS[level] }} aria-hidden="true" />
            {t(key)}
          </li>
        ))}
      </ul>

      {/* La valeur exacte, disponible sans survol : au doigt par un appui, au
          clavier par les flèches, à la souris par le survol. Elle occupe une
          hauteur constante pour que la grille ne saute pas. */}
      <p className="mt-2 min-h-[1.25rem] text-[11px] leading-5 first-letter:uppercase"
        style={{ color: "var(--bt-text-2)" }}>
        {shownIso
          ? `${new Date(shownIso + "T12:00:00").toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { weekday: "long", day: "numeric", month: "long" })} · ${shownSecs > 0 ? formatStudyTime(shownSecs) : t("heatmap.noStudy")}`
          : t("heatmap.hint")}
      </p>
    </div>
  );
}
