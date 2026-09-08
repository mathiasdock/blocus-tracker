import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import Layout from "../components/Layout";
import { PageContentSkeleton, useSkeletonHatch } from "../components/PageSkeleton";
import UserProfileModal from "../components/UserProfileModal";
import Leaderboard from "../components/Leaderboard";
import MascotCoach from "../components/MascotCoach";
import AnimatedNumber from "../components/AnimatedNumber";
import SegmentedGlide from "../components/SegmentedGlide";
import StatsHero from "../components/stats/StatsHero";
import StudyByCourse from "../components/stats/StudyByCourse";
import ConsistencyCard from "../components/stats/ConsistencyCard";
import CompareCard from "../components/stats/CompareCard";
import AdvancedAnalytics from "../components/stats/AdvancedAnalytics";
import { runStreakFreezeUpkeep } from "../lib/streakFreezes";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { formatMinutesShort, getWeekDates, localISO, computeStreak, computeBestStreak } from "../lib/format";
import { computeInsights } from "../lib/statsInsights";
import { pickInsight } from "../lib/statsInsightLine";
import { fetchBlocus, toRanges } from "../lib/blocus";
import {
  resolvePeriod, buildTimeSeries, courseBreakdown, activeDaysIn,
} from "../lib/statsPeriod";

// Recharts ne sert qu'ici et pèse lourd : chargé à la demande, comme avant.
const StudyTimeChart = dynamic(() => import("../components/stats/StudyTimeChart"), { ssr: false });

const DAILY_GOAL_SECS = 7200; // 2 h — même objectif que le Chrono
const PERIOD_STORAGE_KEY = "bt_stats_period";
// En dessous de ce nombre d'étudiants comparables, un percentile ne veut rien
// dire : « Top 50 % — 2e sur 2 » est un fait mathématique et une information
// nulle. Sous le seuil, la carte disparaît au lieu de mentir poliment.
const MIN_COHORT_FOR_PERCENTILE = 8;

// Jour de semaine ISO (0 = lundi) → nom localisé, première lettre en majuscule.
function weekdayName(isoIndex, lang) {
  if (isoIndex == null) return "";
  const base = new Date(2021, 0, 4 + isoIndex); // 4 janv. 2021 = lundi
  const name = base.toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { weekday: "long" });
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export default function Stats() {
  const { user, profile } = useAuth();
  const { t, lang } = useI18n();
  // Premier chargement. Tant qu'il n'est pas fini on montre un squelette :
  // sinon la page affiche 0h00 partout, ce que les gens lisent comme un bug.
  const [ready, setReady] = useState(false);
  const forceSkeleton = useSkeletonHatch();
  const [courses, setCourses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [frozenDays, setFrozenDays] = useState([]);
  const [blocusRanges, setBlocusRanges] = useState([]);
  const [comparison, setComparison] = useState(undefined); // undefined=chargement, null=indispo
  const [myRank, setMyRank] = useState(null);
  const [viewUserId, setViewUserId] = useState(null);

  // ── Période globale ────────────────────────────────────────────
  // Un seul réglage pilote le graphique, la répartition par cours et la
  // régularité. Mémorisé : on revient sur la fenêtre qu'on regarde d'habitude.
  const [periodKey, setPeriodKey] = useState("7");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PERIOD_STORAGE_KEY);
      if (saved && ["7", "30", "blocus", "all"].includes(saved)) setPeriodKey(saved);
    } catch {}
  }, []);
  const changePeriod = useCallback((k) => {
    setPeriodKey(k);
    try { localStorage.setItem(PERIOD_STORAGE_KEY, k); } catch {}
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    // Colonnes réduites au strict nécessaire (avant : `select("*")`, donc les
    // notes de session et l'identifiant client transitaient pour rien), et plus
    // de fenêtre à 370 jours : « Tout » doit pouvoir dire tout. Le total
    // all-time se déduit désormais de ces lignes — une requête de moins.
    const [{ data: c }, { data: s }] = await Promise.all([
      supabase.from("courses").select("id, name, color").eq("user_id", user.id),
      supabase.from("sessions").select("course_id, duration_seconds, started_at").eq("user_id", user.id),
    ]);
    setCourses(c || []);
    setSessions(s || []);
  }, [user]);

  useEffect(() => { load().finally(() => setReady(true)); }, [load]);

  // Gel de série : mêmes jours gelés que le dashboard (mémoïsé par jour).
  useEffect(() => {
    if (!user || !sessions.length) return;
    let alive = true;
    runStreakFreezeUpkeep(supabase, user.id, sessions).then((res) => {
      if (alive && res.supported) setFrozenDays(res.frozenDays);
    });
    return () => { alive = false; };
  }, [user, sessions]);

  // Périodes de blocus — alimentent l'option « Mon blocus » du filtre.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetchBlocus(supabase, user.id).then((res) => {
      if (alive && res?.supported) setBlocusRanges(toRanges(res.periods || []));
    }).catch(() => {});
    return () => { alive = false; };
  }, [user]);

  // Percentile (RPC ; absente tant que la migration n'est pas passée).
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.rpc("get_my_study_rank", { p_period: "day" });
      if (data?.[0]) setMyRank(data[0]);
    })();
  }, [user]);

  // Comparaison vs autres (RPC agrégée ; null si non déployée).
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase.rpc("get_study_comparison");
      setComparison(error ? null : (data || null));
    })();
  }, [user]);

  // ── Dérivés de la période ──────────────────────────────────────
  const hasBlocus = blocusRanges.length > 0;
  const effectiveKey = periodKey === "blocus" && !hasBlocus ? "30" : periodKey;
  const range = useMemo(
    () => resolvePeriod(effectiveKey, { sessions, blocusRanges }),
    [effectiveKey, sessions, blocusRanges]
  );
  const series = useMemo(() => buildTimeSeries(sessions, range, lang), [sessions, range, lang]);
  const breakdown = useMemo(() => courseBreakdown(sessions, courses, range), [sessions, courses, range]);
  const activeDays = useMemo(() => activeDaysIn(sessions, range), [sessions, range]);

  const periodOptions = [
    { value: "7", label: t("stats.period7") },
    { value: "30", label: t("stats.period30") },
    ...(hasBlocus ? [{ value: "blocus", label: t("stats.periodBlocus") }] : []),
    { value: "all", label: t("stats.periodAll") },
  ];

  const fmtDay = (iso) =>
    new Date(iso + "T12:00:00").toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "short" });
  const periodLabel = effectiveKey === "7" ? t("stats.periodLast7")
    : effectiveKey === "30" ? t("stats.periodLast30")
    : effectiveKey === "all" ? t("stats.periodAllSince").replace("{from}", fmtDay(range.fromISO))
    : t("stats.periodRange").replace("{from}", fmtDay(range.fromISO)).replace("{to}", fmtDay(range.toISO));

  // ── Chiffres du héros (indépendants du filtre : c'est « maintenant ») ──
  const todayISOLocal = localISO(new Date());
  const todaySecs = sessions
    .filter((s) => localISO(s.started_at) === todayISOLocal)
    .reduce((a, s) => a + s.duration_seconds, 0);
  const thisWeekDates = getWeekDates(0);
  const weekSecs = sessions
    .filter((s) => thisWeekDates.includes(localISO(s.started_at)))
    .reduce((a, s) => a + s.duration_seconds, 0);
  const allTimeSecs = sessions.reduce((a, s) => a + s.duration_seconds, 0);

  const streak = computeStreak(sessions, frozenDays);
  const bestStreak = computeBestStreak(sessions, frozenDays);
  const sessionCount = sessions.length;

  const insights = useMemo(
    () => computeInsights(sessions, {
      todaySecs, streak, bestStreak, allTimeSecs, dailyGoalSecs: DAILY_GOAL_SECS,
    }),
    [sessions, todaySecs, streak, bestStreak, allTimeSecs]
  );

  // ── Un insight, ou rien ────────────────────────────────────────
  const insight = useMemo(
    () => pickInsight(insights, { courseRows: breakdown.rows }),
    [insights, breakdown.rows]
  );
  const insightText = useMemo(() => {
    if (!insight) return null;
    const { key, vars } = insight;
    if (key === "moreRegular") {
      return t("stats.insightMoreRegular").replace("{n}", String(vars.n)).replace("{prev}", String(vars.prev));
    }
    if (key.startsWith("slot_")) {
      const slot = key.slice(5);
      const k = `stats.insightSlot${slot.charAt(0).toUpperCase()}${slot.slice(1)}`;
      return t(k).replace("{pct}", String(vars.pct));
    }
    if (key === "topCourse") {
      return t("stats.insightTopCourse")
        .replace("{course}", vars.course || t("stats.courseNone"))
        .replace("{pct}", String(vars.pct));
    }
    if (key === "bestWeekday") {
      return t("stats.insightBestWeekday").replace("{weekday}", weekdayName(vars.weekday, lang));
    }
    return null;
  }, [insight, t, lang]);

  // ── Percentile — seulement si la cohorte est significative ─────
  const cohort = myRank ? Number(myRank.total_active) : 0;
  const mySecs = myRank ? Number(myRank.my_secs) : 0;
  const percentile = cohort >= MIN_COHORT_FOR_PERCENTILE && mySecs > 0
    ? Math.max(1, Math.ceil((Number(myRank.better_count) / cohort) * 100))
    : null;

  if (!ready || forceSkeleton) return <Layout><PageContentSkeleton pathname="/stats" /></Layout>;

  const empty = sessionCount === 0;

  return (
    <Layout>
      <div className="mb-4">
        <h1 className="font-display text-2xl font-bold" style={{ color: "var(--bt-text-1)", letterSpacing: "-0.02em" }}>
          {t("stats.title")}
        </h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--bt-text-2)" }}>{t("stats.pageIntro")}</p>
      </div>

      {empty ? (
        <section className="card flex flex-col items-center p-8 text-center sm:p-10">
          <h2 className="mb-1 text-base font-bold" style={{ color: "var(--bt-text-1)" }}>{t("stats.emptyChartsTitle")}</h2>
          <p className="mb-5 max-w-xs text-sm" style={{ color: "var(--bt-text-3)" }}>{t("stats.emptyChartsSub")}</p>
          <Link href="/dashboard" className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3" /></svg>
            {t("stats.emptyCta")}
          </Link>
        </section>
      ) : (
        // Une colonne par défaut. À partir de xl, le graphique et la répartition
        // occupent la colonne large, le contexte personnel passe à droite —
        // le seuil est xl et non lg pour la même raison que sur le Planning :
        // à 1024 px la barre de navigation ne laisse pas assez au graphique.
        <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start xl:gap-5">
          {/* Héros et filtre traversent les deux colonnes : ils commandent
              toute la page, ils ne peuvent pas vivre dans un rail de 340 px. */}
          <StatsHero
            className="order-1 xl:col-span-2"
            todaySecs={todaySecs} goalSecs={DAILY_GOAL_SECS}
            weekSecs={weekSecs} streak={streak}
          />

          <div className="order-2 no-print xl:col-span-2">
            <SegmentedGlide
              className="w-full sm:w-auto sm:inline-flex"
              buttonClassName="flex-1 sm:flex-none px-4 py-2 text-xs"
              options={periodOptions}
              value={effectiveKey}
              onChange={changePeriod}
            />
          </div>

          {/* Colonne large : ce qui a besoin de place (graphique, barres par
              cours, heatmap sur 53 semaines).
              `xl:order-3` est indispensable : sous xl l'enveloppe est en
              `display:contents` et n'a pas de boîte, mais à partir de xl elle
              en reprend une — avec l'ordre par défaut 0, donc AVANT le héros
              (ordre 1). Les deux colonnes remontaient ainsi en haut de page. */}
          <div className="contents xl:order-3 xl:flex xl:flex-col xl:gap-5">
            <StudyTimeChart
              className="order-3"
              series={series}
              goalMinutes={DAILY_GOAL_SECS / 60}
              periodLabel={periodLabel}
            />
            <StudyByCourse
              className="order-5"
              rows={breakdown.rows}
              totalSecs={breakdown.totalSecs}
              periodLabel={periodLabel}
            />
            <ConsistencyCard
              className="order-6"
              sessions={sessions}
              streak={streak}
              bestStreak={bestStreak}
              activeDays={activeDays}
              periodDays={range.days}
              periodLabel={periodLabel}
            />
          </div>

          {/* Rail de contexte : plus court, se lit d'un coup d'œil. */}
          <div className="contents xl:order-3 xl:flex xl:flex-col xl:gap-5">
            {insightText && (
              <div className="order-4">
                <MascotCoach
                  id={`stats-insight-${insight.key}-${todayISOLocal}`}
                  message={insightText}
                  streak={streak}
                  persistence="day"
                />
              </div>
            )}

            {percentile !== null && (
              <section className="card-ink bt-grain order-7 p-5">
                <div className="relative z-10">
                  <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--bt-ink-muted)" }}>
                    {t("stats.percentilePre")}
                  </p>
                  <p className="mt-1 font-num text-[2rem] font-extrabold leading-none tabular-nums tracking-[-0.03em]"
                    style={{ color: "var(--bt-ink-text)" }}>
                    {t("stats.rankTop").replace("{pct}", String(percentile))}
                  </p>
                  <p className="mt-1.5 text-xs tabular-nums" style={{ color: "var(--bt-ink-muted)" }}>
                    {t("stats.rankPosition")
                      .replace("{rank}", String(Number(myRank.better_count) + 1))
                      .replace("{total}", String(cohort))}
                  </p>
                </div>
              </section>
            )}

            {comparison && <CompareCard className="order-8" comparison={comparison} />}

            <div className="order-9">
              <Leaderboard user={user} profile={profile} onViewUser={setViewUserId} compact />
            </div>
          </div>

          <AdvancedAnalytics
            className="order-10 xl:col-span-2"
            insights={insights}
            allTimeSecs={allTimeSecs}
          />
        </div>
      )}

      {viewUserId && <UserProfileModal userId={viewUserId} onClose={() => setViewUserId(null)} />}
    </Layout>
  );
}
