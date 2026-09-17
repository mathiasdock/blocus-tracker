import { useI18n } from "../../contexts/I18nContext";
import { formatStudyTime } from "../../lib/format";

// « Comment je me situe » — position du jour, puis deux moyennes.
//
// Phase 2 : le percentile avait sa propre carte d'encre verte, aussi sombre et
// aussi grande que le héros — « Top 25 % » occupait autant de place que le
// temps étudié du jour. C'est pourtant une variation de la même question que
// cette carte : où je me situe, de façon anonyme. Il y entre, en une ligne.
// Le classement nominatif reste à côté, pour ce qu'il est : de la motivation
// entre personnes, pas une mesure.
//
// Les écarts s'énoncent en clair (« 22 min de moins que la moyenne ») et en
// encre NEUTRE dans les deux sens. Étudier plus longtemps que la moyenne n'est
// pas étudier mieux, et une moyenne de cohorte n'est pas une durée recommandée :
// l'ancien vert réservé à l'écart « favorable » disait le contraire.
//
// GÉOMÉTRIE : une COMPARAISON DE QUANTITÉS, pas une progression. Les trois
// barres partagent un bord gauche et une échelle — la plus grande des trois
// valeurs — et reposent sur la surface, sans rail à remplir derrière elles.
// Le rail rempli était l'idiome d'une barre de progression : on y lisait
// « x % d'un objectif » là où il n'y a aucun objectif. La légende du bas
// nomme l'échelle, puisqu'elle n'est pas devinable.
//
// ZÉRO VAUT ZÉRO : l'ancien remplissage minimum de 14 % donnait une barre
// franche à quelqu'un qui n'avait rien étudié. Les valeurs sont maintenant
// écrites À CÔTÉ de la barre et non dedans : le chiffre n'a plus besoin
// qu'on lui réserve de la longueur, donc la longueur peut redevenir exacte.
function DeltaLine({ mine, other, label, formatDelta }) {
  const { t } = useI18n();
  if (other == null || other <= 0) return null;
  const diff = mine - other;
  const abs = Math.abs(diff);
  // En dessous du seuil, l'écart n'est pas un signal mais du bruit.
  if (abs / other < 0.05) {
    return (
      <span className="text-[11px]" style={{ color: "var(--bt-text-3)" }}>
        {t("stats.cmpOnPar").replace("{who}", label)}
      </span>
    );
  }
  const key = diff > 0 ? "stats.cmpAbove" : "stats.cmpBelow";
  return (
    <span className="text-[11px]" style={{ color: "var(--bt-text-2)" }}>
      {t(key).replace("{delta}", formatDelta(abs)).replace("{who}", label)}
    </span>
  );
}

export default function CompareCard({ comparison, position = null, className = "" }) {
  const { t } = useI18n();
  const hasAverages = Boolean(comparison?.me && comparison?.app);
  if (!hasAverages && !position) return null;

  const metrics = !hasAverages ? [] : [
    {
      key: "avgDaily",
      label: t("stats.cmpAvgDaily"),
      me: comparison.me.avg_daily_min,
      uni: comparison.uni?.avg_daily_min,
      app: comparison.app.avg_daily_min,
      fmt: (v) => formatStudyTime(v * 60),
      fmtDelta: (v) => formatStudyTime(v * 60),
    },
    {
      key: "activeDays",
      label: t("stats.cmpActiveDays"),
      me: comparison.me.active_days,
      uni: comparison.uni?.active_days,
      app: comparison.app.active_days,
      fmt: (v) => `${Math.round(v)} ${t("stats.dayUnit")}`,
      fmtDelta: (v) => `${Math.max(1, Math.round(v))} ${t("stats.dayUnit")}`,
    },
  ];

  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      <h3 className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t("stats.compareTitle")}</h3>

      {/* Position du jour. La cohorte n'est PAS « tous les étudiants » : la
          RPC ne compte que ceux qui ont une session aujourd'hui, et le
          libellé le dit. Masquée sous huit étudiants (voir pages/stats.js). */}
      {position && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--bt-text-3)" }}>
            {t("stats.lbToday")}
          </p>
          <p className="mt-1 text-sm leading-snug" style={{ color: "var(--bt-text-2)" }}>
            <span className="font-num font-bold tabular-nums" style={{ color: "var(--bt-text-1)" }}>
              {t("stats.rankTop").replace("{pct}", String(position.percentile))}
            </span>
            {" · "}
            <span className="tabular-nums">
              {t("stats.rankPositionToday")
                .replace("{rank}", String(position.rank))
                .replace("{total}", String(position.cohort))}
            </span>
          </p>
        </div>
      )}

      {hasAverages && (
      <div className={position ? "mt-4 border-t pt-4" : "mt-3"} style={{ borderColor: "var(--bt-border)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--bt-text-3)" }}>
        {t("stats.cmpSub")}
      </p>
      <div className="mt-3 space-y-5">
        {metrics.map((m) => {
          const max = Math.max(m.me, m.uni || 0, m.app || 0) || 1;
          const bars = [
            // La couleur porte ici un sens précis : « c'est toi ». Les
            // références restent en encre neutre — une cohorte n'est pas un
            // vert plus pâle, ce n'est pas une version moins réussie de soi.
            { key: "me", label: t("stats.cmpYou"), val: m.me, color: "var(--bt-accent-text)", strong: true },
            ...(m.uni != null ? [{ key: "uni", label: t("stats.cmpUni"), val: m.uni, color: "var(--bt-text-2)" }] : []),
            { key: "app", label: t("stats.cmpApp"), val: m.app, color: "var(--bt-text-2)" },
          ];
          return (
            <div key={m.key}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-xs font-semibold" style={{ color: "var(--bt-text-2)" }}>{m.label}</span>
                <DeltaLine mine={m.me} other={m.app} label={t("stats.cmpAppLong")} formatDelta={m.fmtDelta} />
              </div>
              <div className="space-y-2">
                {bars.map((b) => (
                  <div key={b.key} className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-[11px]"
                      style={{ color: b.strong ? "var(--bt-text-1)" : "var(--bt-text-2)", fontWeight: b.strong ? 600 : 400 }}>
                      {b.label}
                    </span>
                    {/* Aucun rail derrière : la barre EST la quantité. Une
                        valeur nulle ne dessine rien du tout ; une valeur
                        minuscule garde deux pixels pour rester visible. */}
                    <span className="flex h-2.5 min-w-0 flex-1 items-center">
                      <span className="bt-stats-quantity block h-full rounded-sm"
                        style={{
                          inlineSize: b.val > 0 ? `max(2px, ${(b.val / max) * 100}%)` : 0,
                          backgroundColor: b.color,
                        }} />
                    </span>
                    <span className="w-14 shrink-0 text-right font-num text-[11px] font-bold tabular-nums"
                      style={{ color: b.strong ? "var(--bt-text-1)" : "var(--bt-text-2)" }}>
                      {m.fmt(b.val)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Ce que l'échelle veut dire, et de QUI on parle. « Toute l'app » se
          lisait comme « tous les étudiants inscrits » : la requête ne compte
          que ceux qui ont étudié au moins une fois sur la fenêtre. */}
      <p className="mt-4 text-[11px] leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
        {t("stats.cmpScale")}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
        {t("stats.cmpCohort")}
      </p>
      </div>
      )}
    </section>
  );
}
