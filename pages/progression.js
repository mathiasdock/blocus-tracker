import { useCallback, useEffect, useState } from "react";
import Layout from "../components/Layout";
import PageHeader from "../components/PageHeader";
import AnimatedNumber from "../components/AnimatedNumber";
import Glyph from "../components/Glyph";
import { MissionRow, WeeklyRow } from "../components/MissionRows";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { loadUserLevelMap } from "../lib/userLevels";
import { LEVELS } from "../lib/xp";

// Tout ce qui concerne l'XP, sur sa propre page.
//
// La carte de progression occupait le haut du profil avec le niveau, la barre,
// les missions du jour et celles de la semaine — un pavé qu'il fallait franchir
// avant d'arriver au moindre réglage. Déplacée ici, elle peut enfin porter ce
// qu'elle ne pouvait pas : d'où vient l'XP, et ce qu'il reste à parcourir.

const SOURCES = [
  { key: "study", labelKey: "prog.srcStudy" },
  { key: "badges", labelKey: "prog.srcBadges" },
  { key: "missions", labelKey: "prog.srcMissions" },
  { key: "referrals", labelKey: "prog.srcReferrals" },
  { key: "streak", labelKey: "prog.srcStreak" },
  { key: "objectives", labelKey: "prog.srcObjectives" },
  { key: "exams", labelKey: "prog.srcExams" },
];

function SourceRow({ label, value, total }) {
  const share = total > 0 ? value / total : 0;
  return (
    <li className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[13px]" style={{ color: "var(--bt-ink-muted)" }}>{label}</span>
        <span className="font-num shrink-0 text-[13px] font-bold tabular-nums" style={{ color: "var(--bt-ink-text)" }}>
          {value.toLocaleString()}
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.14)" }} aria-hidden="true">
        <div className="h-full origin-left rounded-full transition-transform duration-500 motion-reduce:transition-none"
          style={{ transform: `scaleX(${share})`, background: "linear-gradient(90deg, #0EA571, #22E4A4)" }} />
      </div>
    </li>
  );
}

function LadderRow({ level, current, reached, t }) {
  return (
    <li className="flex items-center gap-3 py-1.5">
      <span className="font-num flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold tabular-nums"
        style={{
          backgroundColor: current ? "var(--bt-accent)" : reached ? "var(--bt-accent-bg)" : "var(--bt-subtle)",
          color: current ? "var(--bt-on-accent)" : reached ? "var(--bt-accent-dark)" : "var(--bt-text-4)",
        }}>
        {level.level}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm"
        style={{ color: current ? "var(--bt-text-1)" : reached ? "var(--bt-text-2)" : "var(--bt-text-3)",
                 fontWeight: current ? 700 : 400 }}>
        {t(level.titleKey)}
      </span>
      {current ? (
        <span className="shrink-0 text-[11px] font-bold" style={{ color: "var(--bt-accent-dark)" }}>
          {t("prog.ladderCurrent")}
        </span>
      ) : (
        <span className="font-num shrink-0 text-xs tabular-nums"
          style={{ color: reached ? "var(--bt-text-4)" : "var(--bt-text-3)" }}>
          {level.xp.toLocaleString()}
        </span>
      )}
    </li>
  );
}

export default function ProgressionPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [levelInfo, setLevelInfo] = useState(null);
  const [missions, setMissions] = useState([]);
  const [weekly, setWeekly] = useState([]);

  const load = useCallback(async () => {
    if (!user) return;
    const [levels, missionsRes, weeklyRes] = await Promise.all([
      loadUserLevelMap(supabase, [user.id], { selfUserId: user.id }).catch(() => null),
      supabase.rpc("get_my_daily_missions").then(r => r).catch(() => ({ data: null })),
      supabase.rpc("get_my_weekly_missions").then(r => r).catch(() => ({ data: null })),
    ]);
    if (levels?.[user.id]) setLevelInfo(levels[user.id]);
    if (Array.isArray(missionsRes?.data)) {
      setMissions(missionsRes.data.map(m => ({
        id: m.mission_id, key: m.label_key, xp: m.xp, done: m.done,
        kind: m.kind || "daily", params: m.params || {},
      })));
    }
    if (Array.isArray(weeklyRes?.data)) {
      setWeekly(weeklyRes.data.map(w => ({
        id: w.mission_id, key: w.label_key, target: Number(w.target || 0),
        progress: Number(w.progress || 0), xp: Number(w.xp || 0), done: Boolean(w.done),
      })));
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const current = levelInfo?.current || LEVELS[0];
  const next = levelInfo?.next || null;
  const totalXP = levelInfo?.totalXP || 0;
  const breakdown = levelInfo?.breakdown || null;
  const challenge = missions.find(m => m.kind === "challenge") || null;
  const daily = missions.filter(m => m.kind !== "challenge");
  const sources = !breakdown || totalXP <= 0 ? [] : SOURCES
    .map(src => ({ ...src, value: Number(breakdown[src.key] || 0) }))
    .filter(src => src.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <Layout>
      <div className="bt-stagger mx-auto w-full" style={{ maxWidth: 900 }}>
        <PageHeader backHref="/profile" title={t("prog.title")} subtitle={t("prog.subtitle")} />

        {/* Le niveau sur surface de marque : c'est un moment de progression
            acquise, exactement ce à quoi l'encre verte est réservée. */}
        <section className="card-ink bt-grain relative overflow-hidden p-5 sm:p-6">
          <div className="relative z-10">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-[20px]"
                style={{ background: "linear-gradient(165deg, #14B885, #0E8F68 115%)", boxShadow: "0 4px 20px rgba(20,184,133,0.45)" }}>
                <span className="text-[10px] font-semibold leading-none" style={{ color: "rgba(255,255,255,0.72)" }}>{t("xp.level")}</span>
                <AnimatedNumber value={current.level} style={{ fontSize: 30, fontWeight: 700, color: "#fff", lineHeight: 1.1 }} />
              </div>
              <div className="min-w-0">
                <p className="font-display text-2xl font-bold leading-tight tracking-[-0.015em]" style={{ color: "var(--bt-ink-text)" }}>
                  {t(current.titleKey)}
                </p>
                <p className="font-num mt-1 text-sm tabular-nums" style={{ color: "var(--bt-ink-muted)" }}>
                  <AnimatedNumber value={totalXP} suffix={` ${t("xp.xpLabel")}`} />
                </p>
              </div>
            </div>

            <div className="mt-5">
              <div className="font-num mb-2 flex justify-between text-xs tabular-nums" style={{ color: "var(--bt-ink-muted)" }}>
                <span>{next ? `${levelInfo.progressXP} / ${levelInfo.rangeXP} ${t("xp.xpLabel")}` : t("xp.maxLevel")}</span>
                {next && <span>{t("xp.nextLevel")} : {t(next.titleKey)}</span>}
              </div>
              <div className="h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.14)" }}>
                <div className="h-full origin-left rounded-full transition-transform duration-500 motion-reduce:transition-none"
                  style={{ transform: `scaleX(${(levelInfo?.progressPct || 0) / 100})`, background: "linear-gradient(90deg, #0EA571, #22E4A4)" }} />
              </div>
            </div>

            {/* Le detail des sources COMPOSE le nombre affiche juste au-dessus.
                En carte separee, il devenait la troisieme boite blanche
                identique d'une page qui en avait deja deux, et la proximite
                disait le contraire de la verite. Ici on lit le total, puis
                d'ou il vient — sans changer de surface. */}
            {sources.length > 0 && (
              <div className="mt-6 border-t pt-5" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
                <p className="mb-3.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--bt-ink-muted)" }}>
                  {t("prog.sources")}
                </p>
                <ul className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
                  {sources.map(src => (
                    <SourceRow key={src.key} label={t(src.labelKey)} value={src.value} total={totalXP} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        {/* Deux listes, cote a cote et de meme rang : ce qui est en jeu
            aujourd'hui, et ce qui reste a parcourir. `min-w-0` sur les colonnes
            parce qu'un enfant de grille refuse par defaut de descendre sous sa
            largeur minimale — un libelle un peu long elargit alors la piste au
            lieu de se tronquer, et la carte deborde. `lg:items-stretch` pour
            qu'elles se terminent ensemble au lieu de laisser un bas dechire. */}
        <div className="mt-4 grid gap-4 sm:gap-5 lg:grid-cols-2 lg:items-stretch">

          <div className="flex min-w-0 flex-col">
            <section className="card flex min-h-0 flex-1 flex-col p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t("xp.missions")}</h2>
              <ul className="flex flex-col gap-1.5">
                {challenge && <MissionRow row={challenge} t={t} lead />}
                {daily.map((m, i) => <MissionRow key={m.id || i} row={m} t={t} />)}
              </ul>
              {weekly.length > 0 && (
                <div className="mt-4 border-t pt-3.5" style={{ borderColor: "var(--bt-hairline)" }}>
                  <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--bt-text-3)" }}>
                    {t("xp.weeklyTitle")}
                  </p>
                  <ul className="flex flex-col gap-3">
                    {weekly.map((w, i) => <WeeklyRow key={w.id || i} row={w} t={t} />)}
                  </ul>
                </div>
              )}
            </section>

          </div>

          {/* Les trente paliers. La liste defile DANS sa carte a toutes les
              tailles : sur telephone pour ne pas ajouter mille pixels a la
              page, sur desktop pour que la colonne se termine a la meme
              hauteur que les missions plutot que de pendre en dessous. */}
          <section className="card flex min-w-0 min-h-0 flex-col p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <Glyph size={16} style={{ color: "var(--bt-text-3)" }}>
                <path d="M4 20h4V10H4zM10 20h4V4h-4zM16 20h4v-7h-4z" />
              </Glyph>
              <h2 className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t("prog.ladder")}</h2>
            </div>
            {/* `pr-2` degage le seuil de la gouttiere de defilement : colle au
                bord, le nombre passait sous la barre et se lisait tronque. */}
            <ul className="bt-scroll-y max-h-[26rem] min-h-0 flex-1 overflow-y-auto pr-2 lg:max-h-none lg:basis-0">
              {LEVELS.map(l => (
                <LadderRow key={l.level} level={l} t={t}
                  current={l.level === current.level}
                  reached={totalXP >= l.xp} />
              ))}
            </ul>
          </section>
        </div>
      </div>
    </Layout>
  );
}
