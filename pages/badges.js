import { useCallback, useEffect, useState } from "react";
import Layout from "../components/Layout";
import PageHeader from "../components/PageHeader";
import BadgeIcon from "../components/BadgeIcon";
import BadgeSheet, { rarityLabel } from "../components/BadgeSheet";
import AnimatedNumber from "../components/AnimatedNumber";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { BADGES } from "../lib/badges";
import { groupBadges } from "../lib/badgeGroups";
import { fetchCanonicalBadges } from "../lib/badgeTruth.mjs";
import styles from "../components/BadgeVisuals.module.css";

const BADGE_IDS = BADGES.map((badge) => badge.id);

// La collection, sur sa propre page.
//
// Elle vivait dans une carte du profil, sous la carte de progression : deux
// pavés dépliés l'un sur l'autre avant d'atteindre le moindre réglage. Ici
// elle a la place de s'organiser — par thème, avec un compteur par thème, ce
// qui répond à « qu'est-ce que je néglige ? » plutôt qu'au seul « combien il
// m'en manque ? ».

export function BadgeGroup({ group, earnedIds, onPick, t }) {
  const earned = group.items.filter(b => earnedIds.includes(b.id)).length;
  const complete = earned === group.items.length;
  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t(group.labelKey)}</h2>
        <span className={styles.count} data-complete={complete}>
          {earned}/{group.items.length}
        </span>
      </div>
      {/* Grille et non enveloppe libre : à largeur variable, une rangée
          orpheline de deux badges cassait la lecture en vitrine. */}
      <div className={styles.collection}>
        {group.items.map(b => (
          <button key={b.id} type="button" onClick={() => onPick(b)}
            aria-label={`${t(b.labelKey)} — ${rarityLabel(b.id, t)} — ${t(earnedIds.includes(b.id) ? "badge.earnedLabel" : "badge.locked")}`}
            aria-haspopup="dialog" data-earned={earnedIds.includes(b.id)}
            className={`bt-badge-pick bt-press ${styles.pick}`}>
            <BadgeIcon id={b.id} earned={earnedIds.includes(b.id)} size={72} />
            <span className={styles.pickName}>{t(b.labelKey)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function BadgesPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [earnedIds, setEarnedIds] = useState([]);
  const [earnedAt, setEarnedAt] = useState({});
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    // Les badges appartiennent au serveur depuis la v28. Le profil lit la même
    // liste par la même fonction (lib/badgeTruth) : les deux écrans ne peuvent
    // plus annoncer deux totaux différents. Un échec de lecture garde ce qu'on
    // avait plutôt que d'afficher une collection vide.
    try {
      const result = await fetchCanonicalBadges(supabase, user.id, BADGE_IDS);
      if (result) {
        setEarnedIds(result.ids);
        setEarnedAt(result.earnedAt);
      }
    } catch (error) {
      console.warn("Badge load failed:", error);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const groups = groupBadges(BADGES);
  const pct = BADGES.length ? Math.round((earnedIds.length / BADGES.length) * 100) : 0;

  return (
    <Layout>
      <div className="bt-stagger mx-auto w-full" style={{ maxWidth: 900 }}>
        <PageHeader
          backHref="/profile"
          title={t("badgePage.title")}
          visuallyHiddenTitle
          right={
            <span className="font-num shrink-0 text-sm font-bold tabular-nums" style={{ color: "var(--bt-text-1)" }}>
              <AnimatedNumber value={earnedIds.length} />/{BADGES.length}
            </span>
          }
        />

        <div className="mb-6 h-1 w-full overflow-hidden rounded-full" role="progressbar"
          aria-label={t("badgePage.title")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
          style={{ backgroundColor: "var(--bt-subtle)" }}>
          <div className="h-full origin-left rounded-full transition-transform duration-500 motion-reduce:transition-none"
            style={{ transform: `scaleX(${pct / 100})`, backgroundColor: "var(--bt-progress-fill)" }} />
        </div>

        {/* Deux colonnes dès qu'il y a la largeur : les thèmes sont courts, les
            empiler sur un écran large laisserait une colonne de vide à droite. */}
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-2 lg:items-start">
          {groups.map(g => (
            <BadgeGroup key={g.id} group={g} earnedIds={earnedIds} onPick={setSelected} t={t} />
          ))}
        </div>
      </div>

      <BadgeSheet
        badge={selected}
        earned={selected ? earnedIds.includes(selected.id) : false}
        earnedAt={selected ? earnedAt[selected.id] : null}
        t={t}
        onClose={() => setSelected(null)}
      />
    </Layout>
  );
}
