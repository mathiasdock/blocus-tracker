import Link from "next/link";
import BadgeIcon from "../BadgeIcon";
import Glyph from "../Glyph";
import { useI18n } from "../../contexts/I18nContext";
import { BADGES } from "../../lib/badges";

// Badges — un résumé de la VRAIE collection, et le chemin vers elle.
//
// La page affichait neuf badges calculés sur place (« Première heure »,
// « Lève-tôt »…), dessinés avec le même objet que la collection officielle mais
// obtenus par une autre règle, sans XP, sans trace en base et absents du profil.
// Un même objet pouvait donc être « débloqué » ici et verrouillé là. Un badge
// n'a qu'une identité et qu'une règle d'obtention : `lib/badges.js`, attribué
// par le serveur (`sync_my_badges`) et conservé dans `user_badges`. Cette carte
// LIT ces lignes et ne décide de rien ; la collection vit sur /badges.
const RECENT = 4;

export default function BadgeSummary({ earned, className = "" }) {
  const { t } = useI18n();
  // null = lecture impossible : on se tait plutôt que d'afficher « 0 sur 22 »,
  // qui ressemblerait à une collection perdue.
  if (!Array.isArray(earned)) return null;

  const byId = Object.fromEntries(BADGES.map((b) => [b.id, b]));
  const known = earned.filter((row) => byId[row.badge_id]);
  const count = new Set(known.map((row) => row.badge_id)).size;
  const recent = [...known]
    .sort((a, b) => String(b.earned_at || "").localeCompare(String(a.earned_at || "")))
    .filter((row, i, list) => list.findIndex((r) => r.badge_id === row.badge_id) === i)
    .slice(0, RECENT)
    .map((row) => byId[row.badge_id]);

  return (
    // Sur grand écran, une seule rangée : les objets à droite de leur titre.
    // Étirés en grille sur toute la largeur, quatre badges se retrouvaient à
    // 280 px les uns des autres — beaucoup de surface pour quatre objets.
    <section className={`card p-4 sm:flex sm:items-center sm:gap-6 sm:p-5 ${className}`}>
      <div className="flex min-w-0 items-center justify-between gap-3 sm:block sm:shrink-0">
        <div className="min-w-0">
          <h2 className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t("stats.badgesTitle")}</h2>
          <p className="mt-0.5 text-xs tabular-nums" style={{ color: "var(--bt-text-2)" }}>
            {t("stats.badgesEarned").replace("{n}", String(count)).replace("{total}", String(BADGES.length))}
          </p>
        </div>
        <Link href="/badges"
          className="bt-tap-44 inline-flex shrink-0 items-center gap-1 rounded-lg text-xs font-semibold sm:mt-2"
          style={{ color: "var(--bt-accent-text)" }}>
          {t("stats.badgesSeeCollection")}
          <Glyph size={14}><polyline points="9 18 15 12 9 6" /></Glyph>
        </Link>
      </div>

      {recent.length > 0 && (
        <div className="mt-4 min-w-0 sm:mt-0 sm:flex-1 sm:border-l sm:pl-6" style={{ borderColor: "var(--bt-border)" }}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--bt-text-3)" }}>
            {t("stats.badgesRecent")}
          </p>
          {/* Trois objets sous 380 px : à quatre colonnes de 64 px, « Planificateur »
              se coupait en plein mot. Le nom d'un badge fait partie de l'objet. */}
          <ul className="grid grid-cols-3 gap-2 xs:grid-cols-4 sm:flex sm:flex-wrap sm:gap-x-6 sm:gap-y-3">
            {recent.map((badge, index) => (
              <li key={badge.id}
                className={`${index === 3 ? "hidden xs:flex" : "flex"} min-w-0 flex-col items-center gap-1.5 text-center sm:w-20`}>
                <BadgeIcon id={badge.id} earned size={44} />
                <span className="w-full text-[11px] leading-tight" style={{ color: "var(--bt-text-1)" }}>
                  {t(badge.labelKey)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
