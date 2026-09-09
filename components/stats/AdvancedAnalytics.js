import { useEffect, useState } from "react";
import BadgeIcon from "../BadgeIcon";
import { useI18n } from "../../contexts/I18nContext";
import { formatMinutesShort } from "../../lib/format";

// Niveau 2 — ce qu'on consulte de temps en temps, pas tous les jours.
//
// Trois groupes nets (habitudes / performances / badges) et, surtout, plus
// aucun chiffre déjà présent au-dessus : la série, son record, le total, le
// meilleur mois et le meilleur jour étaient repris ici à l'identique, ce qui
// donnait l'impression que la page se répétait sans fin.

function weekdayName(isoIndex, lang) {
  if (isoIndex == null) return "—";
  // 0 = lundi (convention ISO de statsInsights) → 4 janv. 2021 était un lundi.
  const base = new Date(2021, 0, 4 + isoIndex);
  const name = base.toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { weekday: "long" });
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function formatClock(minutes, lang) {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.round(minutes % 60);
  return lang === "en"
    ? `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`
    : `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`;
}

// Ligne libellé → valeur. Sans icône : elles étaient décoratives (une horloge
// devant « heure moyenne » n'ajoute rien) et faisaient ressembler la section à
// un tableau de bord générique.
function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="min-w-0 truncate text-xs" style={{ color: "var(--bt-text-2)" }}>{label}</span>
      <span className="shrink-0 font-num text-sm font-semibold tabular-nums" style={{ color: "var(--bt-text-1)" }}>{value}</span>
    </div>
  );
}

// Un badge = l'emblème partagé (components/BadgeIcon) + son libellé. La page
// Statistiques avait sa propre version : carré mint plat, icône en trait fin,
// verrouillé rendu par un simple gris. Elle se lisait comme un champ désactivé
// et ne distinguait ni la difficulté ni l'acquis. Le profil affiche déjà de
// vrais emblèmes à trois paliers de rareté : c'est le même langage ici.
function Badge({ id, earned, label }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <BadgeIcon id={id} earned={earned} size={54} />
      <span className="text-[11px] leading-tight"
        style={{ color: earned ? "var(--bt-text-1)" : "var(--bt-text-4)", fontWeight: earned ? 600 : 400 }}>
        {label}
      </span>
      {!earned && <span className="sr-only">{t("stats.badgeLocked")}</span>}
    </div>
  );
}

export default function AdvancedAnalytics({ insights, allTimeSecs, className = "" }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);

  // Persistée : qui l'ouvre une fois la retrouve ouverte.
  useEffect(() => {
    try { if (localStorage.getItem("bt_stats_advanced") === "1") setOpen(true); } catch {}
  }, []);
  function toggle() {
    setOpen((v) => {
      const next = !v;
      try { localStorage.setItem("bt_stats_advanced", next ? "1" : "0"); } catch {}
      return next;
    });
  }

  if (!insights?.hasData) return null;

  const slots = [
    { key: "morning",   label: t("stats.slotMorning"),   color: "#F59E0B" },
    { key: "afternoon", label: t("stats.slotAfternoon"), color: "#14B885" },
    { key: "evening",   label: t("stats.slotEvening"),   color: "#6366F1" },
    { key: "night",     label: t("stats.slotNight"),     color: "#8B5CF6" },
  ];

  const badges = [
    { id: "firstHour",     label: t("stats.badgeFirstHour") },
    { id: "streak7",       label: t("stats.badgeStreak7") },
    { id: "session3h",     label: t("stats.badgeSession3h") },
    { id: "marathonDay",   label: t("stats.badgeMarathon") },
    { id: "hours50",       label: t("stats.badgeHours50") },
    { id: "hours100",      label: t("stats.badgeHours100") },
    { id: "afterMidnight", label: t("stats.badgeNight") },
    { id: "earlyBird",     label: t("stats.badgeEarly") },
    { id: "goal10",        label: t("stats.badgeGoal10") },
  ];
  const earned = badges.filter((b) => insights.badges[b.id]).length;

  return (
    <div className={className}>
      <button onClick={toggle} aria-expanded={open}
        className="bt-stats-disclosure card flex w-full items-center gap-3 p-4 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t("stats.advancedTitle")}</span>
          <span className="block truncate text-xs" style={{ color: "var(--bt-text-3)" }}>{t("stats.advancedSub")}</span>
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          style={{ color: "var(--bt-text-3)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.25s", flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* ── Habitudes ── */}
            <section className="card p-4 sm:p-5">
              <h3 className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t("stats.habitsTitle")}</h3>
              <p className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--bt-text-3)" }}>
                {t("stats.habitsWhen")}
              </p>
              <div className="space-y-2">
                {slots.map((s) => {
                  const p = insights.timeOfDayPct[s.key];
                  return (
                    <div key={s.key} className="flex items-center gap-2.5">
                      <span className="w-16 shrink-0 text-xs" style={{ color: "var(--bt-text-2)" }}>{s.label}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: "var(--bt-subtle)" }}>
                        <div className="h-full origin-left rounded-full transition-transform duration-300 motion-reduce:transition-none"
                          style={{ transform: `scaleX(${p / 100})`, backgroundColor: s.color }} />
                      </div>
                      <span className="w-9 shrink-0 text-right font-num text-xs font-semibold tabular-nums" style={{ color: "var(--bt-text-1)" }}>{p}%</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 border-t pt-1.5" style={{ borderColor: "var(--bt-border)" }}>
                <Row label={t("stats.habitPreferredDay")} value={weekdayName(insights.bestWeekday, lang)} />
                <Row label={t("stats.habitAvgSession")} value={formatMinutesShort(insights.avgSessionSecs)} />
                <Row label={t("stats.habitAvgStart")} value={formatClock(insights.avgStartMinutes, lang)} />
                <Row label={t("stats.perfProductiveHour")}
                  value={insights.mostProductiveHour == null ? "—"
                    : t("stats.hourRange").replace("{h}", String(insights.mostProductiveHour)).replace("{h2}", String((insights.mostProductiveHour + 1) % 24))} />
              </div>
            </section>

            {/* ── Performances & records ── */}
            <section className="card p-4 sm:p-5">
              <h3 className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t("stats.perfTitle")}</h3>
              <div className="mt-3">
                <Row label={t("stats.perfLongest")} value={formatMinutesShort(insights.longestSessionSecs)} />
                <Row label={t("stats.perfBestDay")} value={formatMinutesShort(insights.bestDaySecs)} />
                <Row label={t("stats.recBestWeek")} value={formatMinutesShort(insights.bestWeekSecs)} />
                <Row label={t("stats.recBestMonth")} value={formatMinutesShort(insights.bestMonthSecs)} />
                {/* Records de VOLUME uniquement. Le record de série vit dans
                    « Régularité », à côté de la série en cours — le reprendre
                    ici affichait deux fois le même chiffre sur une page dont
                    c'était justement le défaut. */}
                <Row label={t("stats.recTotal")} value={formatMinutesShort(allTimeSecs)} />
              </div>
            </section>
          </div>

          {/* ── Badges ── */}
          <section className="card p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t("stats.badgesTitle")}</h3>
              <span className="shrink-0 rounded-full px-2 py-0.5 font-num text-xs tabular-nums"
                style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-text)" }}>
                {t("stats.badgesEarned").replace("{n}", String(earned)).replace("{total}", String(badges.length))}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-5">
              {badges.map((b) => (
                <Badge key={b.id} id={b.id} earned={!!insights.badges[b.id]} label={b.label} />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
