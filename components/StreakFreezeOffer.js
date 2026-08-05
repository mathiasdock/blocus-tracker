// Proposition de gel de série — le moment « ta série est en danger ».
//
// Avant, le gel se consommait TOUT SEUL et l'utilisateur découvrait après coup
// qu'il en avait perdu un (simple toast). C'est un choix, pas un automatisme :
// on le lui pose donc explicitement, une seule fois par trou, avec le coût
// affiché (stock avant → après) et une sortie claire.
//
// Couleur : bleu glace, déjà utilisé par la pastille de stock existante. C'est
// une exception SÉMANTIQUE assumée au vert de la marque (la glace s'oppose au
// feu de la série), au même titre que l'ambre de la flamme.

import { useEffect, useRef } from "react";
import { useI18n } from "../contexts/I18nContext";
import Flame from "./Flame";

// Le bleu glace vit dans `globals.css` (famille --bt-ice) : il bascule avec le
// theme et chaque usage a son ton. L'ancien #38BDF8 code en dur servait a la
// fois d'icone, de texte et d'aplat ; en texte sur fond clair il ne faisait que
// 2,11:1. Ici : --bt-ice pour les icones (3:1 suffit), --bt-ice-text des qu'il
// s'agit de mots (4,5:1), --bt-ice-fill/-on-fill pour le bouton plein.
const ICE_ICON = "var(--bt-ice)";
const ICE_SOFT = "var(--bt-ice-bg)";
const ICE_LINE = "var(--bt-ice-line)";

function IconSnowflake({ size = 22, color = ICE_ICON }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <path d="M12 2v20M4 6l16 12M20 6L4 18M12 2l-2.6 2.6M12 2l2.6 2.6M12 22l-2.6-2.6M12 22l2.6-2.6" />
    </svg>
  );
}

export default function StreakFreezeOffer({ open, streak, days, stock, busy, onAccept, onDecline }) {
  const { t } = useI18n();
  const acceptRef = useRef(null);

  // Échappatoire clavier + focus sur l'action principale à l'ouverture.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !busy) onDecline(); };
    document.addEventListener("keydown", onKey);
    const id = setTimeout(() => acceptRef.current?.focus(), 60);
    return () => { document.removeEventListener("keydown", onKey); clearTimeout(id); };
  }, [open, busy, onDecline]);

  if (!open) return null;

  const count = days?.length || 0;
  const after = Math.max(0, (stock || 0) - count);

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4"
      role="dialog" aria-modal="true" aria-labelledby="bt-freeze-title">
      <div className="absolute inset-0 bt-freeze-scrim" onClick={() => { if (!busy) onDecline(); }} />

      <div className="bt-freeze-panel relative w-full max-w-sm rounded-3xl p-6 text-center"
        style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)", boxShadow: "0 24px 70px var(--bt-shadow-raised)" }}>

        {/* La flamme en péril, prise dans la glace */}
        <div className="relative mx-auto mb-4 flex items-center justify-center" style={{ width: 96, height: 96 }}>
          <span aria-hidden="true" className="bt-freeze-halo absolute inset-0 rounded-full" style={{ backgroundColor: ICE_SOFT }} />
          <Flame size={46} style={{ color: "var(--bt-flame)", position: "relative" }} />
          <span aria-hidden="true" className="bt-freeze-flake absolute" style={{ top: -2, right: 6 }}><IconSnowflake size={26} /></span>
          <span aria-hidden="true" className="bt-freeze-flake absolute" style={{ bottom: 2, left: 2, animationDelay: "0.9s" }}><IconSnowflake size={16} /></span>
        </div>

        <p className="text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--bt-ice-text)" }}>
          {t("streak.offerEyebrow")}
        </p>
        <h2 id="bt-freeze-title" className="text-xl font-bold leading-snug" style={{ color: "var(--bt-text-1)" }}>
          {t("streak.offerTitle").replace("{n}", String(streak))}
        </h2>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
          {(count > 1 ? t("streak.offerBodyMany") : t("streak.offerBodyOne")).replace("{n}", String(count))}
        </p>

        {/* Le coût, affiché avant de décider */}
        <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl py-2.5 px-3"
          style={{ backgroundColor: ICE_SOFT, border: `1px solid ${ICE_LINE}` }}>
          <IconSnowflake size={16} />
          <span className="text-xs font-semibold" style={{ color: "var(--bt-text-2)" }}>
            {(count > 1 ? t("streak.offerCostMany") : t("streak.offerCost"))
              .replace("{used}", String(count)).replace("{left}", String(after))}
          </span>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button ref={acceptRef} onClick={onAccept} disabled={busy}
            className="btn w-full text-sm font-bold"
            style={{ backgroundColor: "var(--bt-ice-fill)", color: "var(--bt-ice-on-fill)", opacity: busy ? 0.6 : 1, cursor: busy ? "wait" : "pointer" }}>
            {busy ? t("common.loading") : (count > 1 ? t("streak.offerAcceptMany") : t("streak.offerAccept"))}
          </button>
          <button onClick={onDecline} disabled={busy} className="btn-ghost w-full text-sm">
            {t("streak.offerDecline")}
          </button>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed" style={{ color: "var(--bt-text-3)" }}>
          {t("streak.offerFootnote")}
        </p>
      </div>
    </div>
  );
}
