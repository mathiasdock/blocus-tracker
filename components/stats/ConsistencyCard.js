import StudyHeatmap from "../StudyHeatmap";
import StreakEmblem from "../StreakEmblem";
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
    // `overflow-visible` volontaire : l'emblème déborde la carte par la droite.
    // Le `<main>` de Layout est en `overflow-x-clip`, donc aucun risque de
    // barre de défilement horizontale sur téléphone.
    <section className={`card relative overflow-visible p-4 sm:p-5 ${className}`}>
      {/* Le moment visuel de la page. L'emblème est posé DERRIÈRE le texte et
          déborde du coin : c'est ce débordement qui le sort de la grille de
          cartes. Il ne capte pas les clics et reste hors de l'arbre
          d'accessibilité — le chiffre juste à côté porte l'information. */}
      <div className="pointer-events-none absolute -right-3 -top-5 select-none sm:-right-4"
        aria-hidden="true">
        <StreakEmblem days={streak} size={132} />
      </div>

      <h2 className="bt-section-title relative">{t("stats.consistencyTitle")}</h2>

      {/* La série passe de la pastille de 13 px au rang de titre : c'est le
          chiffre le plus chargé de sens de la page, il ne peut pas être son
          plus petit élément. */}
      <div className="relative mt-3">
        <p className="font-num text-[2.6rem] font-extrabold leading-none tracking-[-0.04em] tabular-nums"
          style={{ color: "var(--bt-text-1)" }}>
          <AnimatedNumber value={streak} />
        </p>
        <p className="mt-1 text-sm font-semibold" style={{ color: "var(--bt-text-2)" }}>
          {streak === 1 ? t("stats.streakDayOne") : t("stats.streakDays")}
        </p>
        <p className="mt-0.5 text-xs tabular-nums" style={{ color: "var(--bt-text-3)" }}>
          {t("stats.streakRecord").replace("{n}", String(bestStreak)).replace("{unit}", t("stats.dayUnit"))}
        </p>
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
