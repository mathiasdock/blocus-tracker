import { useI18n } from "../../contexts/I18nContext";
import { formatStudyTime } from "../../lib/format";
import styles from "./StudySummary.module.css";

// « Quelles habitudes puis-je en tirer ? » — COMPRENDRE.
//
// Ces motifs vivaient repliés dans « Analyse avancée », mélangés aux records,
// aux anciens cours et aux badges : quatre intentions derrière un seul bouton.
// Ils décrivent pourtant la façon d'étudier de l'étudiant, ce qui fait partie du
// récit principal de la page — ils passent donc AVANT la comparaison sociale.
//
// Tout ce qui est écrit ici se dit en une phrase littéralement vraie : une
// session porte une heure de début et une durée, pas une préférence ni un
// rendement (voir lib/statsInsights.mjs).

function weekdayName(isoIndex, lang) {
  if (isoIndex == null) return "—";
  // 0 = lundi (convention ISO de statsInsights) → 4 janv. 2021 était un lundi.
  const base = new Date(2021, 0, 4 + isoIndex);
  const name = base.toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { weekday: "long" });
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// `minutes` peut valoir null : quand les heures de début sont trop dispersées,
// aucune « heure moyenne » n'a de sens et statsInsights refuse d'en inventer une.
function formatClock(minutes, lang) {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.round(minutes % 60);
  return lang === "en"
    ? `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`
    : `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`;
}

export default function StudyHabits({ insights, className = "" }) {
  const { t, lang } = useI18n();
  if (!insights?.hasData) return null;

  const slots = [
    { key: "morning", label: t("stats.slotMorning") },
    { key: "afternoon", label: t("stats.slotAfternoon") },
    { key: "evening", label: t("stats.slotEvening") },
    { key: "night", label: t("stats.slotNight") },
  ];
  const slotTotal = Object.values(insights.timeOfDay).reduce((a, b) => a + b, 0);
  const dominantPeriod = slotTotal > 0 ? slots.find(slot => slot.key === insights.dominantSlot) : null;
  const facts = [
    ["stats.habitTopDay", weekdayName(insights.topWeekday, lang)],
    ["stats.habitTopHour", insights.topStudyHour == null ? "—"
      : t("stats.hourRange").replace("{h}", String(insights.topStudyHour)).replace("{h2}", String((insights.topStudyHour + 1) % 24))],
    ["stats.habitAvgSession", formatStudyTime(insights.avgSessionSecs)],
    ["stats.habitAvgStart", formatClock(insights.avgStartMinutes, lang)],
  ];

  return (
    <section className={`card p-4 sm:p-5 ${styles.summary} ${className}`}>
      <h2 className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t("stats.habitsTitle")}</h2>
      <p className={styles.habitsLead}>
        {t("stats.habitsWhen")}{" "}
        <strong className={styles.dominantPeriod}>{dominantPeriod?.label || "—"}</strong>
      </p>
      {/* PART D'UN TOUT, en une seule teinte. Les quatre couleurs d'avant
          (ambre, vert, indigo, violet) faisaient de quatre moments d'UNE même
          journée quatre catégories étrangères — et le vert de l'après-midi
          ressemblait à l'accent de l'app, mettant ce créneau en avant sans
          raison. L'encre et la graisse soulignent ici le vrai dominant. */}
      <ul className={styles.slots}>
        {slots.map((s) => {
          const share = slotTotal > 0 ? insights.timeOfDay[s.key] / slotTotal : 0;
          const dominant = insights.dominantSlot === s.key && share > 0;
          return (
            <li key={s.key} className={styles.slot} data-dominant={dominant}>
              <span className={styles.slotLabel}>
                {s.label}
              </span>
              <span className={styles.slotTrack} aria-hidden="true">
                <span className={styles.slotFill}
                  style={{ inlineSize: share > 0 ? `max(2px, ${share * 100}%)` : 0 }} />
              </span>
              <span className={`font-num ${styles.slotShare}`}>
                {insights.timeOfDayPct[s.key]}%
              </span>
            </li>
          );
        })}
      </ul>
      <dl className={styles.habitsFacts}>
        {facts.map(([label, value]) => <div key={label} className={styles.habitFact}>
          <dt className={styles.factLabel}>{t(label)}</dt>
          <dd className={`font-num ${styles.factValue}`}>{value}</dd>
        </div>)}
      </dl>
    </section>
  );
}
