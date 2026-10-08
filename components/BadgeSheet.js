import { useRef } from "react";
import Glyph from "./Glyph";
import BadgeIcon from "./BadgeIcon";
import InboxSheet from "./InboxSheet";
import { rarityOf } from "../lib/badgeArt";
import { badgeDescKey } from "../lib/badgeRules.mjs";
import styles from "./BadgeVisuals.module.css";

const RARITY_LABEL_KEYS = {
  discovery: "badge.rarityDiscovery", common: "badge.rarityCommon",
  rare: "badge.rarityRare", epic: "badge.rarityEpic", legendary: "badge.rarityLegendary",
};

export function rarityLabel(id, t) {
  return t(RARITY_LABEL_KEYS[rarityOf(id)] || RARITY_LABEL_KEYS.common);
}

// Canonical condition and reward stay untouched, including pre-v84 awards.
// The shared native dialog supplies keyboard containment and focus restoration.
export default function BadgeSheet({ badge, earned, earnedAt = null, t, onClose }) {
  const last = useRef(null);
  if (badge) last.current = { badge, earned, earnedAt };
  const content = badge ? { badge, earned, earnedAt } : last.current;
  return <InboxSheet open={Boolean(badge)} title={content ? t(content.badge.labelKey) : t("badgePage.title")}
    closeLabel={t("common.close")} onClose={onClose} className={styles.sheet}>
    {content && <BadgeDetail {...content} t={t} />}
  </InboxSheet>;
}

function BadgeDetail({ badge, earned, earnedAt, t }) {
  return <div className={styles.detail}>
    <div className={styles.stage}><BadgeIcon id={badge.id} earned={earned} size={128} /></div>
    <h3 className={styles.name}>{t(badge.labelKey)}</h3>
    <div className={styles.metadata}>
      <span className={styles.status} data-earned={earned}>
        <Glyph size={14}>{earned ? <polyline points="20 6 9 17 4 12" /> : <>
          <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </>}</Glyph>
        {t(earned ? "badge.earnedLabel" : "badge.locked")}
      </span>
      <span className={styles.rarity}>{rarityLabel(badge.id, t)}</span>
    </div>
    <div className={styles.condition}>
      {!earned && <p className={styles.conditionLabel}>{t("badge.howToEarn")}</p>}
      <p>{t(badgeDescKey(badge, { earned, earnedAt }))}</p>
    </div>
    {badge.xp > 0 && <div className={styles.reward}>
      <span>{t("badge.xpReward")}</span><span className={styles.rewardValue}>{`+${badge.xp} XP`}</span>
    </div>}
  </div>;
}
