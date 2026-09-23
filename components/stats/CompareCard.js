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
      <span className="text-xs" style={{ color: "var(--bt-text-2)" }}>
        {t("stats.cmpOnPar").replace("{who}", label)}
      </span>
    );
  }
  const key = diff > 0 ? "stats.cmpAbove" : "stats.cmpBelow";
  return (
    <span className="text-xs" style={{ color: "var(--bt-text-2)" }}>
      {t(key).replace("{delta}", formatDelta(abs)).replace("{who}", label)}
    </span>
  );
}

// ── Refonte 2026-09-23 ───────────────────────────────────────
// Six barres empilées se lisaient mal : on cherchait « moi » au milieu des
// références. Chaque mesure devient un CHIFFRE (le mien, en grand), une
// phrase (l'écart en clair) et UNE ligne d'échelle où l'app et la fac sont
// des repères, et moi un point vert. Même promesse qu'avant : une échelle
// partagée qui part de zéro, aucune couleur « favorable », pas de rail à
// remplir — une position sur une ligne n'est pas une progression.
function Strip({ me, uni, app, fmt, t }) {
  const max = Math.max(me, uni || 0, app || 0) * 1.12 || 1;
  const at = (v) => `${Math.min(100, (v / max) * 100)}%`;
  const refs = [
    ...(uni != null ? [{ key: "uni", label: t("stats.cmpUni"), val: uni }] : []),
    { key: "app", label: t("stats.cmpApp"), val: app },
  ].sort((a, b) => a.val - b.val);
  // Deux repères trop proches : le second libellé descend d'une ligne.
  const close = refs.length === 2 && Math.abs(refs[1].val - refs[0].val) / max < 0.22;
  return (
    <div className="relative mt-3 h-[58px]" aria-hidden="true">
      <span className="absolute inset-x-0 top-[14px] h-px" style={{ backgroundColor: "var(--bt-border)" }} />
      {refs.map((r, i) => (
        <span key={r.key} className="absolute top-[8px] flex -translate-x-1/2 flex-col items-center" style={{ left: at(r.val) }}>
          <span className="block h-[13px] w-[2px] rounded-full" style={{ backgroundColor: "var(--bt-text-3)" }} />
          <span className="whitespace-nowrap text-[11px] tabular-nums" style={{ color: "var(--bt-text-2)", marginTop: close && i === 1 ? 18 : 4 }}>
            {r.label} · {fmt(r.val)}
          </span>
        </span>
      ))}
      <span className="absolute top-[7px] block h-[15px] w-[15px] -translate-x-1/2 rounded-full"
        style={{ left: at(me), backgroundColor: "var(--bt-accent)", boxShadow: "0 0 0 3px var(--bt-surface), 0 0 0 4px var(--bt-accent-border)" }} />
    </div>
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
      big: formatStudyTime(comparison.me.avg_daily_min * 60),
      unit: t("stats.cmpPerDay"),
      me: comparison.me.avg_daily_min,
      uni: comparison.uni?.avg_daily_min,
      app: comparison.app.avg_daily_min,
      fmt: (v) => formatStudyTime(v * 60),
      fmtDelta: (v) => formatStudyTime(v * 60),
    },
    {
      key: "activeDays",
      label: t("stats.cmpActiveDays"),
      big: `${Math.round(comparison.me.active_days)} ${t("stats.dayUnit")}`,
      unit: t("stats.cmpOfDays"),
      me: comparison.me.active_days,
      uni: comparison.uni?.active_days,
      app: comparison.app.active_days,
      fmt: (v) => `${Math.round(v)} ${t("stats.dayUnit")}`,
      fmtDelta: (v) => `${Math.max(1, Math.round(v))} ${t("stats.dayUnit")}`,
    },
  ];

  return (
    <section className={`card flex flex-col p-4 sm:p-5 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t("stats.compareTitle")}</h3>
          {hasAverages && <p className="mt-0.5 text-xs" style={{ color: "var(--bt-text-3)" }}>{t("stats.cmpSub")}</p>}
        </div>
        {/* Position du jour : la cohorte ne compte que ceux qui ont étudié
            aujourd'hui, et le libellé le dit. Masquée sous huit étudiants. */}
        {position && (
          <span className="font-num inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-bold tabular-nums"
            style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-text)" }}>
            {t("stats.lbToday")} · {t("stats.rankTop").replace("{pct}", String(position.percentile))}
          </span>
        )}
      </div>
      {position && (
        <p className="mt-2 text-xs tabular-nums" style={{ color: "var(--bt-text-2)" }}>
          {t("stats.rankPositionToday").replace("{rank}", String(position.rank)).replace("{total}", String(position.cohort))}
        </p>
      )}

      {hasAverages && (
        <div className="mt-2 flex-1 divide-y divide-[color:var(--bt-border)]">
          {metrics.map((m) => (
            <div key={m.key} className="py-4 last:pb-1">
              <p className="text-xs font-semibold" style={{ color: "var(--bt-text-2)" }}>{m.label}</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
                <span className="font-num text-2xl font-extrabold tabular-nums" style={{ color: "var(--bt-text-1)" }}>{m.big}</span>
                <span className="text-xs" style={{ color: "var(--bt-text-3)" }}>{m.unit}</span>
              </p>
              <p className="mt-0.5"><DeltaLine mine={m.me} other={m.app} label={t("stats.cmpAppLong")} formatDelta={m.fmtDelta} /></p>
              <Strip me={m.me} uni={m.uni} app={m.app} fmt={m.fmt} t={t} />
              <p className="sr-only">
                {`${t("stats.cmpYou")} ${m.fmt(m.me)}, ${m.uni != null ? `${t("stats.cmpUni")} ${m.fmt(m.uni)}, ` : ""}${t("stats.cmpApp")} ${m.fmt(m.app)}`}
              </p>
            </div>
          ))}
        </div>
      )}

      {hasAverages && (
        <p className="mt-3 text-[11px] leading-relaxed" style={{ color: "var(--bt-text-3)" }}>{t("stats.cmpCohortShort")}</p>
      )}
    </section>
  );
}
