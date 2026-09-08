import StudyHeatmap from "../StudyHeatmap";
import Flame from "../Flame";
import AnimatedNumber from "../AnimatedNumber";
import { useI18n } from "../../contexts/I18nContext";
import { formatMinutesShort } from "../../lib/format";

// « Est-ce que je suis régulier ? » — tout ce qui répond à cette question,
// au même endroit. La série vivait dans une tuile en haut, son record dans
// « Records » tout en bas, la heatmap seule au milieu : trois morceaux d'une
// même idée. Les séries appartiennent désormais à cette section et à elle
// seule ; « Performances » garde les records de VOLUME (plus longue session,
// plus grosse journée, meilleur mois…). Chaque chiffre a un seul domicile.
export default function ConsistencyCard({
  sessions,
  streak,
  bestStreak,
  activeDays,
  periodDays,
  periodLabel,
  className = "",
}) {
  const { t } = useI18n();
  const activePct = periodDays > 0 ? Math.min(100, Math.round((activeDays / periodDays) * 100)) : 0;

  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      <h2 className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t("stats.consistencyTitle")}</h2>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold"
          style={{ backgroundColor: "var(--bt-reward-bg)", border: "1px solid var(--bt-reward-border)", color: "var(--bt-reward-text)" }}>
          <Flame size={14} style={{ color: "#F59E0B" }} />
          <span className="font-num tabular-nums">
            <AnimatedNumber value={streak} suffix={` ${t("stats.dayUnit")}`} />
          </span>
        </span>
        <span className="text-xs tabular-nums" style={{ color: "var(--bt-text-3)" }}>
          {t("stats.streakRecord").replace("{n}", String(bestStreak)).replace("{unit}", t("stats.dayUnit"))}
        </span>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium" style={{ color: "var(--bt-text-2)" }}>
            {t("stats.activeDaysIn").replace("{n}", String(activeDays)).replace("{total}", String(periodDays))}
          </span>
          <span className="truncate text-[11px]" style={{ color: "var(--bt-text-4)" }}>{periodLabel}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--bt-subtle)" }}>
          <div className="h-full origin-left rounded-full transition-transform duration-300 motion-reduce:transition-none"
            style={{ transform: `scaleX(${activePct / 100})`, backgroundColor: "var(--bt-accent)" }} />
        </div>
      </div>

      {/* La heatmap garde ses 53 semaines : c'est sa raison d'être (voir la
          régularité sur l'année). Elle ne suit donc pas le filtre de période. */}
      <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--bt-border)" }}>
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--bt-text-3)" }}>
          {t("heatmap.title")}
        </p>
        <StudyHeatmap sessions={sessions} />
      </div>
    </section>
  );
}
