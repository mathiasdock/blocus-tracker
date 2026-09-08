import { useI18n } from "../../contexts/I18nContext";
import { formatMinutesShort } from "../../lib/format";

// « Comment je me situe » — deux métriques, pas dix.
//
// Les écarts s'énoncent en clair (« 22 min de moins que la moyenne de l'app »)
// et non plus par une pastille rouge « ↓ 52 % ». Le rouge et la flèche vers le
// bas lisaient comme une faute alors qu'il s'agit d'une moyenne : informer,
// pas sanctionner. L'écart favorable reste souligné en vert, parce que là
// c'est une bonne nouvelle qu'on a le droit de célébrer.
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
    <span className="text-[11px]" style={{ color: diff > 0 ? "var(--bt-accent-text)" : "var(--bt-text-3)" }}>
      {t(key).replace("{delta}", formatDelta(abs)).replace("{who}", label)}
    </span>
  );
}

export default function CompareCard({ comparison, className = "" }) {
  const { t } = useI18n();
  if (!comparison?.me || !comparison?.app) return null;

  const metrics = [
    {
      key: "avgDaily",
      label: t("stats.cmpAvgDaily"),
      me: comparison.me.avg_daily_min,
      uni: comparison.uni?.avg_daily_min,
      app: comparison.app.avg_daily_min,
      fmt: (v) => formatMinutesShort(v * 60),
      fmtDelta: (v) => formatMinutesShort(v * 60),
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
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t("stats.compareTitle")}</h2>
        <span className="shrink-0 text-[11px]" style={{ color: "var(--bt-text-3)" }}>{t("stats.cmpSub")}</span>
      </div>

      <div className="mt-4 space-y-5">
        {metrics.map((m) => {
          const max = Math.max(m.me, m.uni || 0, m.app || 0) || 1;
          const bars = [
            { key: "me", label: t("stats.cmpYou"), val: m.me, color: "var(--bt-accent)", strong: true },
            ...(m.uni != null ? [{ key: "uni", label: t("stats.cmpUni"), val: m.uni, color: "rgba(20,184,133,0.55)" }] : []),
            { key: "app", label: t("stats.cmpApp"), val: m.app, color: "rgba(20,184,133,0.28)" },
          ];
          return (
            <div key={m.key}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-xs font-semibold" style={{ color: "var(--bt-text-2)" }}>{m.label}</span>
                <DeltaLine mine={m.me} other={m.app} label={t("stats.cmpApp")} formatDelta={m.fmtDelta} />
              </div>
              <div className="space-y-1.5">
                {bars.map((b) => (
                  <div key={b.key} className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-[11px]"
                      style={{ color: b.strong ? "var(--bt-text-1)" : "var(--bt-text-3)", fontWeight: b.strong ? 600 : 400 }}>
                      {b.label}
                    </span>
                    <div className="h-5 flex-1 overflow-hidden rounded-md" style={{ backgroundColor: "var(--bt-subtle)" }}>
                      <div className="flex h-full items-center justify-end rounded-md pr-1.5 transition-all duration-300"
                        style={{ width: `${Math.max(14, Math.round((b.val / max) * 100))}%`, backgroundColor: b.color }}>
                        <span className="font-num text-[10px] font-bold tabular-nums"
                          style={{ color: b.strong ? "var(--bt-on-accent)" : "var(--bt-text-1)" }}>
                          {m.fmt(b.val)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[10px]" style={{ color: "var(--bt-text-4)" }}>{t("stats.cmpPrivacy")}</p>
    </section>
  );
}
