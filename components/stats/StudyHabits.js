import { useI18n } from "../../contexts/I18nContext";
import { formatStudyTime } from "../../lib/format";

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

export function StatRow({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="min-w-0 text-xs" style={{ color: "var(--bt-text-2)" }}>{label}</dt>
      <dd className="shrink-0 font-num text-sm font-semibold tabular-nums" style={{ color: "var(--bt-text-1)" }}>{value}</dd>
    </div>
  );
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

  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      <h2 className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t("stats.habitsTitle")}</h2>
      <p className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--bt-text-3)" }}>
        {t("stats.habitsWhen")}
      </p>
      {/* PART D'UN TOUT, en une seule teinte. Les quatre couleurs d'avant
          (ambre, vert, indigo, violet) faisaient de quatre moments d'UNE même
          journée quatre catégories étrangères — et le vert de l'après-midi
          ressemblait à l'accent de l'app, mettant ce créneau en avant sans
          raison. Le créneau dominant se distingue par son libellé. */}
      <ul className="space-y-2">
        {slots.map((s) => {
          const share = slotTotal > 0 ? insights.timeOfDay[s.key] / slotTotal : 0;
          const dominant = insights.dominantSlot === s.key && share > 0;
          return (
            <li key={s.key} className="flex items-center gap-2.5">
              <span className="w-20 shrink-0 text-xs"
                style={{ color: dominant ? "var(--bt-text-1)" : "var(--bt-text-2)", fontWeight: dominant ? 700 : 400 }}>
                {s.label}
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: "var(--bt-subtle)" }} aria-hidden="true">
                <span className="bt-stats-quantity block h-full rounded-full"
                  style={{ inlineSize: share > 0 ? `max(2px, ${share * 100}%)` : 0, backgroundColor: "var(--bt-accent)" }} />
              </span>
              <span className="w-9 shrink-0 text-right font-num text-xs font-semibold tabular-nums" style={{ color: "var(--bt-text-1)" }}>
                {insights.timeOfDayPct[s.key]}%
              </span>
            </li>
          );
        })}
      </ul>
      <dl className="mt-3 border-t pt-1.5" style={{ borderColor: "var(--bt-border)" }}>
        <StatRow label={t("stats.habitTopDay")} value={weekdayName(insights.topWeekday, lang)} />
        <StatRow label={t("stats.habitTopHour")}
          value={insights.topStudyHour == null ? "—"
            : t("stats.hourRange").replace("{h}", String(insights.topStudyHour)).replace("{h2}", String((insights.topStudyHour + 1) % 24))} />
        <StatRow label={t("stats.habitAvgSession")} value={formatStudyTime(insights.avgSessionSecs)} />
        <StatRow label={t("stats.habitAvgStart")} value={formatClock(insights.avgStartMinutes, lang)} />
      </dl>
    </section>
  );
}
