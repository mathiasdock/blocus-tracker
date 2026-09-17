import StudyHeatmap from "../StudyHeatmap";
import StreakEmblem from "../StreakEmblem";
import { useI18n } from "../../contexts/I18nContext";

// « Est-ce que je suis régulier ? » — tout ce qui répond à cette question, au
// même endroit : jours étudiés, série et son record, la continuité sur l'année.
//
// Phase 2 — la série n'est plus répétée à égalité. Le héros la donne déjà en
// une ligne (« Série en cours 14 j ») ; cette section l'affichait une seconde
// fois en chiffre géant, doublé d'un emblème de 132 px qui disait le même
// nombre. Ici elle redevient un fait parmi d'autres, et ce qui la complète
// passe devant :
//   • les jours étudiés sur trente jours. Une série retombe à zéro au premier
//     jour manqué ; « 23 jours sur 30 » dit qu'on est régulier malgré ce trou.
//   • le record, qui donne son échelle à la série en cours.
//   • l'évolution de la semaine, quand elle est nette.
// L'emblème reste l'objet de la série, à la taille d'une icône, et garde son
// état dormant à zéro : on ne célèbre pas une série qui n'existe pas.
//
// Sur grand écran, les faits se rangent à gauche de la grille qu'ils résument :
// l'année entière tient alors d'un seul regard, sans défilement horizontal.
export default function ConsistencyCard({
  sessions,
  streak,
  bestStreak,
  activeDays,
  periodDays,
  periodLabel,
  trend = null,
  className = "",
}) {
  const { t } = useI18n();
  // Part d'un tout : jours étudiés sur jours de la fenêtre. Le rail EST la
  // fenêtre, donc le rail rempli est ici le bon idiome.
  const activeShare = periodDays > 0 ? Math.min(1, activeDays / periodDays) : 0;

  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      <h2 className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t("stats.consistencyTitle")}</h2>

      <div className="mt-3 min-[1400px]:grid min-[1400px]:grid-cols-[200px_minmax(0,1fr)] min-[1400px]:gap-6">
        <div>
          <dl className="grid grid-cols-2 gap-3 min-[1400px]:grid-cols-1 min-[1400px]:gap-4">
            <div className="min-w-0">
              <dt className="text-xs" style={{ color: "var(--bt-text-2)" }}>{t("stats.activeDaysLabel")}</dt>
              <dd className="mt-0.5">
                <span className="font-num text-xl font-bold tabular-nums leading-tight" style={{ color: "var(--bt-text-1)" }}>
                  {t("stats.activeDaysValue").replace("{n}", String(activeDays)).replace("{total}", String(periodDays))}
                </span>
                <span className="mt-0.5 block text-[11px]" style={{ color: "var(--bt-text-3)" }}>{periodLabel}</span>
                <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--bt-subtle)" }} aria-hidden="true">
                  <span className="bt-stats-quantity block h-full rounded-full"
                    style={{ inlineSize: activeShare > 0 ? `max(2px, ${activeShare * 100}%)` : 0, backgroundColor: "var(--bt-accent)" }} />
                </span>
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs" style={{ color: "var(--bt-text-2)" }}>{t("stats.streakLabel")}</dt>
              <dd className="mt-0.5">
                <span className="flex items-center gap-1.5">
                  <StreakEmblem days={streak} size={26} className="shrink-0" />
                  <span className="font-num text-xl font-bold tabular-nums leading-tight" style={{ color: "var(--bt-text-1)" }}>
                    {streak} {t("stats.dayUnit")}
                  </span>
                </span>
                <span className="mt-0.5 block text-[11px] tabular-nums" style={{ color: "var(--bt-text-3)" }}>
                  {t("stats.streakRecord").replace("{n}", String(bestStreak)).replace("{unit}", t("stats.dayUnit"))}
                </span>
              </dd>
            </div>
          </dl>
          {trend && (
            <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
              {t("stats.insightMoreRegular").replace("{n}", String(trend.now)).replace("{prev}", String(trend.prev))}
            </p>
          )}
        </div>

        {/* La grille garde ses 53 semaines : c'est sa raison d'être. Elle ne
            suit donc pas la fenêtre de trente jours ci-contre. */}
        <div className="mt-4 border-t pt-4 min-[1400px]:mt-0 min-[1400px]:border-l min-[1400px]:border-t-0 min-[1400px]:pl-6 min-[1400px]:pt-0"
          style={{ borderColor: "var(--bt-border)" }}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--bt-text-3)" }}>
            {t("heatmap.title")}
          </p>
          <StudyHeatmap sessions={sessions} />
        </div>
      </div>
    </section>
  );
}
