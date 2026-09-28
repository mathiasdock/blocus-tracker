import StudyBlocks from "../StudyBlocks";
import StreakEmblem from "../StreakEmblem";
import BadgeIcon from "../BadgeIcon";
import { useI18n } from "../../contexts/I18nContext";
import s from "./Landing.module.css";

// Les objets de progression de l'app, dessinés par leurs vrais composants
// (pas une capture) : blocs d'étude du jour, emblème de série, badges.
// Valeurs d'illustration, identiques en français et en anglais.
const TODAY_SECS = 92 * 60;
const GOAL_SECS = 120 * 60;
const STREAK_DAYS = 12;
const BADGES = ["streak_7", "hours_50", "early_bird"];

export default function ProgressObjects({ c }) {
  const { t } = useI18n();
  return (
    <div className={s.objects}>
      <div className={s.object}>
        <span className={s.objectLabel}>{c.today}</span>
        <span className={s.objectValue}>
          <strong className={s.objectNumber}>1h32</strong>
          <span className={s.objectUnit}>{c.goal}</span>
        </span>
        <div className={s.objectBlocks}>
          <StudyBlocks earnedSecs={TODAY_SECS} plannedSecs={GOAL_SECS} maxUnits={8} label={c.blocksLabel} />
        </div>
      </div>
      <div className={s.object}>
        <span className={s.objectLabel}>{c.streak}</span>
        <div className={s.streakRow}>
          <StreakEmblem days={STREAK_DAYS} size={40} />
          <span className={s.objectValue}>
            <strong className={s.objectNumber}>{STREAK_DAYS}</strong>
            <span className={s.objectUnit}>{c.streakUnit}</span>
          </span>
        </div>
      </div>
      <div className={s.object}>
        <span className={s.objectLabel}>{c.badges}</span>
        <div className={s.badgeRow}>
          {BADGES.map((id) => <BadgeIcon key={id} id={id} earned size={44} />)}
        </div>
        <span className={s.srOnly}>{BADGES.map((id) => t(`badge.${id}`)).join(", ")}</span>
      </div>
    </div>
  );
}
