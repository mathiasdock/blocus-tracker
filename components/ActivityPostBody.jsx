import { useI18n } from "../contexts/I18nContext";
import { validActivity } from "../lib/autoShare";
import { BADGES } from "../lib/badges";
import BadgeIcon from "./BadgeIcon";
import Glyph from "./Glyph";

const labels = {
  en: { level_up: "Level up", badge_unlocked: "Badge unlocked", streak: "Study streak", goal_completed: "Objective completed", session_completed: "Study session", days: "days in a row", min: "min", session: "Focused study" },
  fr: { level_up: "Niveau supérieur", badge_unlocked: "Badge débloqué", streak: "Série d’étude", goal_completed: "Objectif terminé", session_completed: "Session d’étude", days: "jours consécutifs", min: "min", session: "Temps de concentration" },
};

/** Only versioned event data is interpreted. Legacy captions stay untouched. */
export default function ActivityPostBody({ activity, caption }) {
  const { t, lang } = useI18n();
  const copy = labels[lang] || labels.en;
  const type = activity?.type;
  const badge = type === "badge_unlocked" && BADGES.find(b => b.id === activity.badgeId);
  if (!validActivity(type, activity) || (type === "badge_unlocked" && !badge)) {
    return <p className="px-4 pt-3 text-[17px] leading-snug">{caption || t("feed.activityFallback")}</p>;
  }
  const compact = type === "session_completed" || type === "goal_completed";
  const courseColor = /^#[0-9a-f]{6}$/i.test(activity.courseColor || "") ? activity.courseColor : "var(--bt-accent)";
  return (
    <div className="bt-activity-body">
      <div className={"bt-activity-event bt-activity-" + type + (compact ? " is-compact" : "")}>
        {type === "level_up" && <>
          <div className="bt-activity-level" aria-label={String(activity.level)}><span>{activity.level}</span></div>
          <div className="bt-activity-copy"><h3>{copy.level_up}</h3><p>{activity.titleKey ? t(activity.titleKey) : ""}</p></div>
          <Glyph size={30} className="bt-activity-rise" aria-hidden="true"><path d="m5 16 7-7 7 7M5 9l7-7 7 7" /></Glyph>
        </>}
        {type === "badge_unlocked" && <>
          <div className="bt-activity-badge" aria-hidden="true"><BadgeIcon id={badge.id} earned size={112} animate={false} /></div>
          <div className="bt-activity-copy"><h3>{t(badge.labelKey)}</h3><p>{copy.badge_unlocked}</p><span>{t(badge.descKey)}</span></div>
        </>}
        {type === "streak" && <>
          <div className="bt-activity-streak-mark" aria-hidden="true">
            <Glyph size={104}><path d="M13 2c1 6-5 7-2 11 1-1 2-3 2-4 5 4 7 7 5 11-3 5-12 3-12-3 0-5 5-7 7-15Z" /></Glyph>
            <strong>{activity.days}</strong>
          </div>
          <div className="bt-activity-copy"><h3>{copy.streak}</h3><p>{activity.days} {copy.days}</p></div>
        </>}
        {type === "session_completed" && <>
          <div className="bt-activity-duration"><strong>{Math.floor(activity.seconds / 60)}</strong><span>{copy.min}</span></div>
          <div className="bt-activity-copy"><h3>{typeof activity.courseName === "string" && activity.courseName ? <><i style={{ background: courseColor }} />{activity.courseName}</> : copy.session}</h3><p>{copy.session_completed}</p></div>
        </>}
        {type === "goal_completed" && <>
          <div className="bt-activity-check" aria-hidden="true"><Glyph size={26}><path d="m5 12 4 4L19 6" /></Glyph></div>
          <div className="bt-activity-copy"><h3>{activity.title}</h3><p>{copy.goal_completed}</p></div>
        </>}
      </div>
      {caption && <p className="bt-activity-caption">{caption}</p>}
    </div>
  );
}
