import Link from "next/link";
import Mascot from "./Mascot";
import BadgeIcon from "./BadgeIcon";
import Glyph from "./Glyph";
import { BADGES } from "../lib/badges";
import { BADGE_GROUPS } from "../lib/badgeGroups";
import { rarityOf } from "../lib/badgeArt";
import styles from "./ProfileAchievementCards.module.css";

// Two personal objects: a level card with its resident shiba, and an earned
// collection. The mascot belongs to the artwork, never the event/message feed.
const TIERS = { legendary: 4, epic: 3, rare: 2, common: 1, discovery: 0 };
const FAMILY = Object.fromEntries(BADGE_GROUPS.flatMap(group => group.ids.map(id => [id, group.id])));

function collectionPreview(earned) {
  const ranked = [...earned].sort((a, b) => TIERS[rarityOf(b.id)] - TIERS[rarityOf(a.id)]);
  const families = new Set();
  const distinct = ranked.filter(badge => {
    const family = FAMILY[badge.id] || badge.id;
    if (families.has(family)) return false;
    families.add(family);
    return true;
  });
  return [...distinct, ...ranked.filter(badge => !distinct.includes(badge))].slice(0, 5);
}

function Arrow() {
  return <Glyph size={16} className={styles.arrow}><path d="M7 17 17 7M7 7h10v10" /></Glyph>;
}

function MascotStage() {
  return <svg className={styles.mascotStage} viewBox="0 0 160 160" fill="none" aria-hidden="true">
    <ellipse cx="83" cy="82" rx="65" ry="64" className={styles.stageOrbit} />
    <path d="M28 145v5c0 7 25 12 55 12s55-5 55-12v-5" className={styles.stageEdge} />
    <ellipse cx="83" cy="145" rx="55" ry="11" className={styles.stageTop} />
    <path d="m22 34 2.5 7.5L32 44l-7.5 2.5L22 54l-2.5-7.5L12 44l7.5-2.5Z" className={styles.stageSpark} />
    <path d="m143 61 1.8 5.2L150 68l-5.2 1.8L143 75l-1.8-5.2L136 68l5.2-1.8Z" className={styles.stageSparkSmall} />
    <circle cx="137" cy="26" r="2.5" className={styles.stageSparkSmall} />
    <circle cx="20" cy="105" r="2" className={styles.stageSparkSmall} />
  </svg>;
}

export default function ProfileAchievementCards({ levelInfo, earnedBadgeIds, t }) {
  const earned = BADGES.filter(badge => earnedBadgeIds.includes(badge.id));
  const preview = collectionPreview(earned);
  const { current, next, progressXP, rangeXP, progressPct } = levelInfo;
  const progress = Math.max(0, Math.min(100, progressPct || 0));
  const countLabel = t("stats.badgesEarned").replace("{n}", earned.length).replace("{total}", BADGES.length);

  return (
    <div className={styles.cards}>
      <Link href="/progression" className={`${styles.card} ${styles.level}`}>
        <span className={styles.heading}>{t("profile.tileProgress")}<Arrow /></span>
        <span className={styles.levelScene}>
          <span className={styles.levelNumber}>
            <span className={styles.levelLabel}>{t("xp.level")}</span>
            <span>{current.level}</span>
          </span>
          <span className={styles.mascot} aria-hidden="true">
            <MascotStage />
            <Mascot mood="proud" size={160} />
          </span>
        </span>
        <span className={styles.levelTitle}>{t(current.titleKey)}</span>
        <span className={styles.xp}>
          <span className={styles.xpLabels}>
            <span>{next ? `${progressXP} / ${rangeXP} XP` : t("xp.maxLevel")}</span>
            {next && <span className={styles.nextLevel}>
              <Glyph size={11}><path d="M5 21V3m0 1c5-4 9 4 14 0v9c-5 4-9-4-14 0" /></Glyph>
              {t("xp.level")} {next.level}
            </span>}
          </span>
          <span className={styles.track} role="progressbar" aria-label={t("xp.nextLevel")}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}
            aria-valuetext={next ? `${progressXP} / ${rangeXP} XP — ${t("xp.level")} ${next.level}` : t("xp.maxLevel")}>
            <span className={styles.fill} style={{ transform: `scaleX(${progress / 100})` }} />
            <span className={styles.trackTicks} aria-hidden="true"><i /><i /><i /></span>
          </span>
        </span>
      </Link>

      <Link href="/badges" className={`${styles.card} ${styles.collection}`}>
        <span className={styles.heading}>{t("profile.tileBadges")}<Arrow /></span>
        <span className={styles.badgeScene} data-count={preview.length} aria-hidden="true">
          {preview.length ? preview.map((badge, index) => (
            <span key={badge.id} className={styles.badgeObject} data-slot={index} title={t(badge.labelKey)}>
              <BadgeIcon id={badge.id} earned size={96} />
            </span>
          )) : <span className={styles.emptyObject}><BadgeIcon id="first_session" size={96} /></span>}
        </span>
        <span className="sr-only">{preview.map(badge => t(badge.labelKey)).join(", ")}</span>
        {!earned.length && <span className={styles.emptyLabel}>{t("profile.collectionEmpty")}</span>}
        <span className={styles.collectionFooter}>
          <span className={styles.count}>{countLabel}</span>
          <span className={styles.openCollection}>{t("profile.viewCollection")}</span>
        </span>
      </Link>
    </div>
  );
}
