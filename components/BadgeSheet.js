import Glyph from "./Glyph";
import BadgeIcon from "./BadgeIcon";
import { HUES, dominantHue, rarityOf, rgba } from "../lib/badgeArt";

const RARITY_LABEL_KEYS = {
  discovery: "badge.rarityDiscovery",
  common: "badge.rarityCommon",
  rare: "badge.rarityRare",
  epic: "badge.rarityEpic",
  legendary: "badge.rarityLegendary",
};

// Étiquette de rareté. Elle emprunte la teinte dominante de l'objet plutôt
// qu'une couleur à elle : deux systèmes de couleur dans une fiche de 300 px,
// c'est un de trop. Le palier le plus bas reste affiché — masquer le bas de
// l'échelle laisserait croire à un bug sur la moitié de la collection.
export function RarityChip({ id, t }) {
  const rarity = rarityOf(id);
  const hue = HUES[dominantHue(id)].mid;
  const neutral = rarity === "discovery";
  const label = RARITY_LABEL_KEYS[rarity] ? t(RARITY_LABEL_KEYS[rarity]) : t("badge.rarityDiscovery");
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
      style={{
        backgroundColor: neutral ? "var(--bt-subtle)" : rgba(hue, 0.14),
        color: neutral ? "var(--bt-text-3)" : undefined,
        boxShadow: `inset 0 0 0 1px ${neutral ? "var(--bt-border)" : rgba(hue, 0.32)}`,
      }}>
      <span aria-hidden="true" className="block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: neutral ? "var(--bt-text-4)" : hue }} />
      <span style={neutral ? undefined : { color: "var(--bt-text-1)" }}>{label}</span>
    </span>
  );
}

// Fiche d'un badge. Un seul objet à regarder de près : c'est le cas où une
// surface par-dessus se justifie, contrairement à une liste qu'on vient
// simplement lire.
export default function BadgeSheet({ badge, earned, t, onClose }) {
  if (!badge) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" style={{ backgroundColor: "rgba(0,0,0,0.48)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div className="fixed z-50 bottom-0 inset-x-0 sm:inset-0 sm:flex sm:items-center sm:justify-center" onClick={onClose}>
        <div className="rounded-t-[28px] sm:rounded-[24px] sm:max-w-xs w-full sm:mx-4"
          style={{ backgroundColor: "var(--bt-surface)", maxHeight: "90vh", overflowY: "auto", boxShadow: "var(--bt-elev-3)" }}
          onClick={e => e.stopPropagation()}>
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--bt-border)" }} />
          </div>
          <div className="p-6 pt-4 sm:pt-6 text-center">
            {/* Pas de cadre autour : l'objet EST le badge. L'enfermer dans un
                carré teinté ramènerait la tuile qu'on a justement enlevée. */}
            <div className={`mb-4 inline-flex ${earned ? "badge-shine" : ""}`}>
              <BadgeIcon id={badge.id} earned={earned} size={96} />
            </div>
            <h3 className="text-lg font-bold" style={{ color: "var(--bt-text-1)" }}>{t(badge.labelKey)}</h3>
            <div className="mt-2 mb-4 flex flex-wrap items-center justify-center gap-2">
              {earned ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full"
                  style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)", border: "1px solid var(--bt-accent-border)" }}>
                  <Glyph size={12}><polyline points="20 6 9 17 4 12" /></Glyph>
                  {t("badge.earnedStatus")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full"
                  style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-3)", border: "1px solid var(--bt-hairline)" }}>
                  <Glyph size={11}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></Glyph>
                  {t("badge.locked")}
                </span>
              )}
              <RarityChip id={badge.id} t={t} />
              {badge.xp > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full"
                  style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }}>
                  {t("badge.xpReward")} : +{badge.xp} XP
                </span>
              )}
            </div>
            {!earned && (
              <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--bt-text-4)" }}>
                {t("badge.howToEarn")}
              </p>
            )}
            <p className="text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>{t(badge.descKey)}</p>
            <button onClick={onClose} className="btn-ghost w-full mt-5 text-sm">{t("common.close")}</button>
          </div>
        </div>
      </div>
    </>
  );
}
