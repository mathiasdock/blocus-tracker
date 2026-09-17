import { useState } from "react";
import Glyph from "../Glyph";
import ArchivedCourses from "./ArchivedCourses";
import { StatRow } from "./StudyHabits";
import { useI18n } from "../../contexts/I18nContext";
import { formatStudyTime } from "../../lib/format";

// « Qu'ai-je déjà accompli ? » — HISTORIQUE.
//
// Les records de volume et les anciens cours racontent la même chose : ce qui
// a déjà été étudié. Ils sortent de « Analyse avancée », où ils côtoyaient les
// habitudes et les badges, pour une section qui ne parle que de passé.
//
// Les records disent des QUANTITÉS : « plus grande semaine », pas « meilleure
// semaine ». Une semaine de dix-huit heures n'est pas meilleure qu'une semaine
// de douze ; elle est plus grande.
//
// Les anciens cours restent repliés : on vient y chercher un cours précis, ou
// en supprimer un pour de bon. Ce n'est pas une information qu'on lit à chaque
// visite, et le bouton de dépliage porte leur nombre.
export default function StudyHistory({
  insights, allTimeSecs,
  archived = [], archivedBusyId, onRestoreCourse, onDeleteCourse,
  className = "",
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const hasRecords = Boolean(insights?.hasData);
  if (!hasRecords && archived.length === 0) return null;

  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      {hasRecords && (
        <>
          <h2 className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t("stats.recordsTitle")}</h2>
          <dl className="mt-2">
            <StatRow label={t("stats.perfLongest")} value={formatStudyTime(insights.longestSessionSecs)} />
            <StatRow label={t("stats.perfBestDay")} value={formatStudyTime(insights.bestDaySecs)} />
            <StatRow label={t("stats.recBestWeek")} value={formatStudyTime(insights.bestWeekSecs)} />
            <StatRow label={t("stats.recBestMonth")} value={formatStudyTime(insights.bestMonthSecs)} />
            <StatRow label={t("stats.recTotal")} value={formatStudyTime(allTimeSecs)} />
          </dl>
        </>
      )}

      {archived.length > 0 && (
        <div className={hasRecords ? "mt-3 border-t pt-2" : ""} style={{ borderColor: "var(--bt-border)" }}>
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
            className="bt-stats-disclosure flex min-h-11 w-full items-center gap-2 rounded-xl px-1 text-left">
            <span className="min-w-0 flex-1 text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>
              {t("stats.archivedTitle")}
            </span>
            <span className="shrink-0 font-num text-xs tabular-nums" style={{ color: "var(--bt-text-2)" }}>
              {archived.length}
            </span>
            <Glyph size={16} className="shrink-0"
              style={{ color: "var(--bt-text-3)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
              <polyline points="6 9 12 15 18 9" />
            </Glyph>
          </button>
          {open && (
            <div className="px-1 pb-1 pt-1">
              <ArchivedCourses bare rows={archived} busyId={archivedBusyId}
                onRestore={onRestoreCourse} onDelete={onDeleteCourse} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
