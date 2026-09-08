import AnimatedNumber from "../AnimatedNumber";
import Flame from "../Flame";
import { useI18n } from "../../contexts/I18nContext";
import { formatMinutesShort } from "../../lib/format";

// Héros des statistiques — « combien j'ai étudié » en une seule surface.
//
// Remplace trois cartes voisines (Aujourd'hui, Cette semaine, Série) qui
// portaient trois chiffres liés avec le même poids visuel : l'œil n'avait pas
// de point d'entrée. Même langage que « Aujourd'hui » du Chrono (surface ink),
// pour que la même information se reconnaisse d'une page à l'autre.
export default function StatsHero({
  todaySecs,
  goalSecs,
  weekSecs,
  streak,
  className = "",
}) {
  const { t } = useI18n();
  const goalPct = goalSecs > 0 ? Math.min(100, Math.round((todaySecs / goalSecs) * 100)) : 0;
  const remaining = Math.max(0, goalSecs - todaySecs);

  return (
    <section className={`card-ink bt-grain p-5 ${className}`}>
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--bt-ink-muted)" }}>
            {t("stats.heroTitle")}
          </h2>
          {streak > 0 && (
            <span className="inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold"
              style={{ backgroundColor: "rgba(251,191,36,0.14)", border: "1px solid rgba(251,191,36,0.28)", color: "#FFF7D6" }}>
              <Flame size={12} style={{ color: "#FBBF24" }} />
              <span className="font-num tabular-nums"><AnimatedNumber value={streak} /></span>
            </span>
          )}
        </div>

        <p className="mt-3 text-xs" style={{ color: "var(--bt-ink-muted)" }}>{t("stats.compactToday")}</p>
        <div className="mt-1 flex items-end justify-between gap-4">
          <p className="font-num text-[2.35rem] font-extrabold leading-none tracking-[-0.035em] tabular-nums sm:text-[2.75rem]"
            style={{ color: "var(--bt-ink-text)" }}>
            <AnimatedNumber value={todaySecs} format={formatMinutesShort} />
          </p>
          <p className="pb-1 text-right text-xs font-semibold tabular-nums" style={{ color: "var(--bt-ink-muted)" }}>
            {t("dash.goal")} · {formatMinutesShort(goalSecs)}
          </p>
        </div>

        <div className="mt-2.5 h-2 overflow-hidden rounded-full"
          role="progressbar" aria-label={t("dash.goal")}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={goalPct}
          style={{ backgroundColor: "rgba(255,255,255,0.14)" }}>
          <div className="h-full origin-left rounded-full transition-transform duration-300 motion-reduce:transition-none"
            style={{ transform: `scaleX(${goalPct / 100})`, backgroundImage: "linear-gradient(90deg, #14B885, #2BD9A4)" }} />
        </div>
        <p className="mt-1.5 text-xs" style={{ color: "var(--bt-ink-muted)" }}>
          {goalPct >= 100
            ? t("stats.heroGoalReached")
            : t("stats.heroRemaining").replace("{time}", formatMinutesShort(remaining))}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3" style={{ borderColor: "var(--bt-ink-border)" }}>
          <div>
            <p className="text-xs" style={{ color: "var(--bt-ink-muted)" }}>{t("stats.compactWeek")}</p>
            <p className="mt-0.5 font-num text-base font-bold tabular-nums" style={{ color: "var(--bt-ink-text)" }}>
              <AnimatedNumber value={weekSecs} format={formatMinutesShort} />
            </p>
          </div>
          <div>
            <p className="text-xs" style={{ color: "var(--bt-ink-muted)" }}>{t("stats.streakLabel")}</p>
            {/* Pas de record ici : il vit dans « Régularité », avec la série
                courante et la heatmap. Le répéter dès le héros, c'était déjà
                deux fois le même chiffre avant même de faire défiler. */}
            <p className="mt-0.5 font-num text-base font-bold tabular-nums" style={{ color: "var(--bt-ink-text)" }}>
              <AnimatedNumber value={streak} suffix={` ${t("stats.dayUnit")}`} />
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
