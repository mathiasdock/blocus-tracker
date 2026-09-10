import { useCallback, useEffect, useState } from "react";
import Layout from "../components/Layout";
import PageHeader from "../components/PageHeader";
import BadgeIcon from "../components/BadgeIcon";
import BadgeSheet from "../components/BadgeSheet";
import AnimatedNumber from "../components/AnimatedNumber";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { BADGES } from "../lib/badges";
import { groupBadges } from "../lib/badgeGroups";

// La collection, sur sa propre page.
//
// Elle vivait dans une carte du profil, sous la carte de progression : deux
// pavés dépliés l'un sur l'autre avant d'atteindre le moindre réglage. Ici
// elle a la place de s'organiser — par thème, avec un compteur par thème, ce
// qui répond à « qu'est-ce que je néglige ? » plutôt qu'au seul « combien il
// m'en manque ? ».

function Group({ group, earnedIds, onPick, t }) {
  const earned = group.items.filter(b => earnedIds.includes(b.id)).length;
  const complete = earned === group.items.length;
  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t(group.labelKey)}</h2>
        <span className="font-num shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums"
          style={{
            backgroundColor: complete ? "var(--bt-accent-bg)" : "var(--bt-subtle)",
            color: complete ? "var(--bt-accent-dark)" : "var(--bt-text-3)",
          }}>
          {earned}/{group.items.length}
        </span>
      </div>
      {/* Grille et non enveloppe libre : à largeur variable, une rangée
          orpheline de deux badges cassait la lecture en vitrine. */}
      <div className="grid gap-x-2 gap-y-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))" }}>
        {group.items.map(b => (
          <button key={b.id} type="button" onClick={() => onPick(b)}
            title={t(b.labelKey)} aria-label={t(b.labelKey)}
            className="bt-press flex justify-center"
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", transition: "transform 0.14s cubic-bezier(0.22,1,0.36,1)" }}
            onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.12)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}>
            <BadgeIcon id={b.id} earned={earnedIds.includes(b.id)} size={56} />
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
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    // Les badges appartiennent au serveur depuis la v28 : `sync_my_badges`
    // attribue ceux qui viennent d'être mérités et renvoie la liste, la table
    // porte l'historique. Leur union suffit — inutile de rejouer ici le calcul
    // client, qui demanderait de relire sessions, objectifs, amis et
    // publications pour un résultat que la base connaît déjà.
    const [syncRes, rowsRes] = await Promise.all([
      supabase.rpc("sync_my_badges").catch(() => ({ data: null })),
      supabase.from("user_badges").select("badge_id").eq("user_id", user.id),
    ]);
    const synced = Array.isArray(syncRes?.data) ? syncRes.data : [];
    const stored = (rowsRes?.data || []).map(r => r.badge_id);
    setEarnedIds([...new Set([...synced, ...stored])]);
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
          subtitle={t("badgePage.subtitle")}
          right={
            <span className="font-num shrink-0 rounded-full px-3 py-1.5 text-sm font-bold tabular-nums"
              style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }}>
              <AnimatedNumber value={earnedIds.length} />/{BADGES.length}
            </span>
          }
        />

        <div className="mb-6 h-2 w-full overflow-hidden rounded-full" role="progressbar"
          aria-label={t("badgePage.title")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
          style={{ backgroundColor: "var(--bt-subtle)" }}>
          <div className="h-full origin-left rounded-full transition-transform duration-500 motion-reduce:transition-none"
            style={{ transform: `scaleX(${pct / 100})`, backgroundColor: "var(--bt-accent)" }} />
        </div>

        {/* Deux colonnes dès qu'il y a la largeur : les thèmes sont courts, les
            empiler sur un écran large laisserait une colonne de vide à droite. */}
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-2 lg:items-start">
          {groups.map(g => (
            <Group key={g.id} group={g} earnedIds={earnedIds} onPick={setSelected} t={t} />
          ))}
        </div>
      </div>

      <BadgeSheet
        badge={selected}
        earned={selected ? earnedIds.includes(selected.id) : false}
        t={t}
        onClose={() => setSelected(null)}
      />
    </Layout>
  );
}
