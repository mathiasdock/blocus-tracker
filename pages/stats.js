import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import Layout from "../components/Layout";
import { PageContentSkeleton, useSkeletonHatch } from "../components/PageSkeleton";
import UserProfileModal from "../components/UserProfileModal";
import Leaderboard from "../components/Leaderboard";
import StatsHero from "../components/stats/StatsHero";
import StudyByCourse from "../components/stats/StudyByCourse";
import ConsistencyCard from "../components/stats/ConsistencyCard";
import StudyHabits from "../components/stats/StudyHabits";
import StudyHistory from "../components/stats/StudyHistory";
import CompareCard from "../components/stats/CompareCard";
import BadgeSummary from "../components/stats/BadgeSummary";
import { runStreakFreezeUpkeep } from "../lib/streakFreezes";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { clearClientCache } from "../lib/clientCache";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { getWeekDates, localISO, computeStreak, computeBestStreak } from "../lib/format";
import { computeInsights, regularityTrend } from "../lib/statsInsights.mjs";
import {
  PERIOD_KEYS, resolvePeriod, buildTimeSeries, courseBreakdown, activeDaysIn,
} from "../lib/statsPeriod";

// Recharts ne sert qu'ici et pèse lourd : chargé à la demande, comme avant.
const StudyTimeChart = dynamic(() => import("../components/stats/StudyTimeChart"), { ssr: false });

const DAILY_GOAL_SECS = 7200; // 2 h — même objectif que le Chrono
const CHART_PERIOD_KEY = "bt_stats_period_chart";
const COURSE_PERIOD_KEY = "bt_stats_period_course";
// Fenêtre fixe de la régularité : un mois est la bonne focale pour juger d'une
// habitude, et la heatmap couvre déjà l'année juste en dessous. Elle est
// annoncée en clair dans la carte plutôt que pilotée par un filtre de plus.
const CONSISTENCY_PERIOD = "30";
// En dessous de ce nombre d'étudiants comparables, un percentile ne veut rien
// dire : « Top 50 % — 2e sur 2 » est un fait mathématique et une information
// nulle. Sous le seuil, la carte disparaît au lieu de mentir poliment.
const MIN_COHORT_FOR_PERCENTILE = 8;

// Période d'une section, mémorisée. Le premier rendu part toujours de « 7
// derniers jours » : lire localStorage pendant le rendu ferait diverger le HTML
// serveur du HTML client (erreur d'hydratation), d'où la relecture en effet.
function usePersistedPeriod(storageKey, fallback = "7") {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && PERIOD_KEYS.includes(saved)) setValue(saved);
    } catch {}
  }, [storageKey]);
  const set = useCallback((v) => {
    setValue(v);
    try { localStorage.setItem(storageKey, v); } catch {}
  }, [storageKey]);
  return [value, set];
}

export default function Stats() {
  const { user, profile } = useAuth();
  const { t, lang } = useI18n();
  const { toast } = useToast();
  // Premier chargement. Tant qu'il n'est pas fini on montre un squelette :
  // sinon la page affiche 0h00 partout, ce que les gens lisent comme un bug.
  const [ready, setReady] = useState(false);
  const forceSkeleton = useSkeletonHatch();
  const [courses, setCourses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [frozenDays, setFrozenDays] = useState([]);
  const [comparison, setComparison] = useState(undefined); // undefined=chargement, null=indispo
  // Une lecture qui ÉCHOUE et un compte qui n'a PAS ENCORE de session sont deux
  // situations opposées : l'une demande de réessayer, l'autre de lancer un
  // chrono. Elles tombaient toutes les deux sur « Tes graphiques t'attendent »,
  // donc l'app annonçait « tu n'as jamais étudié » à quelqu'un dont l'historique
  // existe et n'a simplement pas pu être lu.
  const [loadFailed, setLoadFailed] = useState(false);
  const [myRank, setMyRank] = useState(null);
  // Badges RÉELS (`user_badges`) : undefined = chargement, null = lecture
  // impossible, tableau = la collection. Voir components/stats/BadgeSummary.
  const [earnedBadges, setEarnedBadges] = useState(undefined);
  const [viewUserId, setViewUserId] = useState(null);
  const [archiveBusyId, setArchiveBusyId] = useState(null);

  // ── Périodes locales ───────────────────────────────────────────
  // Chaque section porte la sienne, dans son propre en-tête. Le réglage global
  // posé entre le héros et le graphique ne disait pas ce qu'il commandait : on
  // ne savait pas s'il valait aussi pour la heatmap, la comparaison ou le
  // classement. Les deux choix sont mémorisés séparément.
  const [chartPeriod, setChartPeriod] = usePersistedPeriod(CHART_PERIOD_KEY);
  const [coursePeriod, setCoursePeriod] = usePersistedPeriod(COURSE_PERIOD_KEY);

  const load = useCallback(async () => {
    if (!user) return;
    // Colonnes réduites au strict nécessaire (avant : `select("*")`, donc les
    // notes de session et l'identifiant client transitaient pour rien), et plus
    // de fenêtre à 370 jours : « Tout » doit pouvoir dire tout. Le total
    // all-time se déduit désormais de ces lignes — une requête de moins.
    const [coursesRes, sessionsRes] = await Promise.all([
      // Volontairement SANS filtre sur archived_at : un cours archivé est
      // justement celui dont on veut retrouver les heures du semestre passé.
      supabase.from("courses").select("id, name, color, archived_at").eq("user_id", user.id),
      supabase.from("sessions").select("course_id, duration_seconds, started_at").eq("user_id", user.id),
    ]);
    // Les deux lectures alimentent toute la page : si l'une manque, aucun
    // chiffre n'est fiable. On ne remplace pas les données par des zéros.
    if (coursesRes.error || sessionsRes.error) { setLoadFailed(true); return; }
    setLoadFailed(false);
    setCourses(coursesRes.data || []);
    setSessions(sessionsRes.data || []);
  }, [user]);

  useEffect(() => { load().finally(() => setReady(true)); }, [load]);

  const retryLoad = useCallback(() => {
    setReady(false);
    load().finally(() => setReady(true));
  }, [load]);

  // ── Anciens cours ────────────────────────────────────────────
  // Le temps compté ici est celui de TOUTE la vie du compte, pas de la période
  // choisie plus haut : un cours du semestre passé n'a par définition aucune
  // heure dans « 7 derniers jours », et l'afficher à 0 h ne dirait rien de ce
  // qu'il a représenté.
  const archivedRows = useMemo(() => {
    const secsById = {};
    sessions.forEach((session) => {
      if (session.course_id) {
        secsById[session.course_id] = (secsById[session.course_id] || 0) + (session.duration_seconds || 0);
      }
    });
    return courses
      .filter((course) => course.archived_at)
      .map((course) => ({ id: course.id, name: course.name, secs: secsById[course.id] || 0 }))
      .sort((a, b) => b.secs - a.secs || a.name.localeCompare(b.name));
  }, [courses, sessions]);

  async function restoreArchivedCourse(id) {
    setArchiveBusyId(id);
    const { error } = await supabase
      .from("courses").update({ archived_at: null })
      .eq("id", id).eq("user_id", user.id);
    setArchiveBusyId(null);
    if (error) { toast(t("courseEditor.restoreError"), "error"); return; }
    // Le dashboard lit les cours depuis son propre cache : sans purge, le cours
    // réactivé n'apparaîtrait dans le chrono qu'après expiration.
    clearClientCache(`dashboard:${user.id}:`);
    setCourses((prev) => prev.map((c) => c.id === id ? { ...c, archived_at: null } : c));
    toast(t("courseEditor.restored"), "success");
  }

  // Suppression DÉFINITIVE. La contrainte est ON DELETE SET NULL : les sessions
  // survivent et le total d'heures ne bouge pas — c'est le NOM qui disparaît,
  // et c'est bien ce que le panneau de confirmation annonce.
  async function deleteArchivedCourse(id) {
    setArchiveBusyId(id);
    const { data, error } = await supabase
      .from("courses").delete()
      .eq("id", id).eq("user_id", user.id)
      .select("id").maybeSingle();
    setArchiveBusyId(null);
    if (error || !data) { toast(t("stats.archivedDeleteError"), "error"); return; }
    clearClientCache(`dashboard:${user.id}:`);
    setCourses((prev) => prev.filter((c) => c.id !== id));
    setSessions((prev) => prev.map((s2) => s2.course_id === id ? { ...s2, course_id: null } : s2));
    toast(t("stats.archivedDeleted"), "success");
  }

  // Gel de série : mêmes jours gelés que le dashboard (mémoïsé par jour).
  useEffect(() => {
    if (!user || !sessions.length) return;
    let alive = true;
    runStreakFreezeUpkeep(supabase, user.id, sessions).then((res) => {
      if (alive && res.supported) setFrozenDays(res.frozenDays);
    });
    return () => { alive = false; };
  }, [user, sessions]);

  // Percentile (RPC ; absente tant que la migration n'est pas passée).
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.rpc("get_my_study_rank", { p_period: "day" });
      if (data?.[0]) setMyRank(data[0]);
    })();
  }, [user]);

  // Collection de badges : lecture seule. Pas de `sync_my_badges` ici — ouvrir
  // les statistiques ne doit rien attribuer ; le profil et /badges s'en chargent.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("user_badges").select("badge_id, earned_at").eq("user_id", user.id);
      if (alive) setEarnedBadges(error ? null : (data || []));
    })();
    return () => { alive = false; };
  }, [user]);

  // Comparaison vs autres (RPC agrégée ; null si non déployée).
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase.rpc("get_study_comparison");
      setComparison(error ? null : (data || null));
    })();
  }, [user]);

  // ── Dérivés : une plage par section ────────────────────────────
  const chartRange = useMemo(() => resolvePeriod(chartPeriod, { sessions }), [chartPeriod, sessions]);
  const courseRange = useMemo(() => resolvePeriod(coursePeriod, { sessions }), [coursePeriod, sessions]);
  const consistencyRange = useMemo(() => resolvePeriod(CONSISTENCY_PERIOD, { sessions }), [sessions]);

  const series = useMemo(() => buildTimeSeries(sessions, chartRange, lang), [sessions, chartRange, lang]);
  const breakdown = useMemo(() => courseBreakdown(sessions, courses, courseRange), [sessions, courses, courseRange]);
  const activeDays = useMemo(() => activeDaysIn(sessions, consistencyRange), [sessions, consistencyRange]);

  // Libellés explicites : « 7 jours » ne disait pas si la fenêtre était
  // glissante ou calendaire. « 30 derniers jours » et « Ce mois-ci » sont deux
  // périodes différentes et ne se confondent plus.
  const periodOptions = [
    { value: "7", label: t("stats.periodLast7") },
    { value: "30", label: t("stats.periodLast30") },
    { value: "month", label: t("stats.periodThisMonth") },
    { value: "year", label: t("stats.periodThisYear") },
    { value: "all", label: t("stats.periodAll") },
  ];

  const fmtDay = (iso) =>
    new Date(iso + "T12:00:00").toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "short" });
  // Sous le titre : la plage réelle en DATES, pour toutes les périodes. Le menu
  // dit l'intention (« 7 derniers jours »), cette ligne dit quels jours sont
  // comptés. Répéter « 7 derniers jours » sous un filtre qui l'affiche déjà
  // n'apprenait rien.
  const rangeLabel = (key, range) => key === "all"
    ? t("stats.periodAllSince").replace("{from}", fmtDay(range.fromISO))
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

  const insights = useMemo(() => computeInsights(sessions), [sessions]);
  // L'ancienne carte « insight » répétait, en tête de page, un chiffre que sa
  // section affiche désormais à sa place (créneau dominant, part du premier
  // cours, jour le plus étudié). Seule l'évolution de la régularité n'était
  // écrite nulle part ailleurs : elle rejoint la section Régularité.
  const trend = useMemo(() => regularityTrend(insights), [insights]);

  // ── Percentile — seulement si la cohorte est significative ─────
  const cohort = myRank ? Number(myRank.total_active) : 0;
  const mySecs = myRank ? Number(myRank.my_secs) : 0;
  // « Top X % » = la place occupée, donc rang / cohorte. L'ancien calcul
  // divisait le nombre d'étudiants MEILLEURS par la cohorte : premier sur huit
  // donnait « Top 1 % », ce qui est impossible dans un groupe de huit. Le rang
  // est `better_count + 1`, et le premier d'un groupe de huit est donc dans le
  // premier huitième — « Top 13 % ».
  const myPosition = myRank ? Number(myRank.better_count) + 1 : 0;
  const position = cohort >= MIN_COHORT_FOR_PERCENTILE && mySecs > 0
    ? {
      percentile: Math.min(100, Math.max(1, Math.ceil((myPosition / cohort) * 100))),
      rank: myPosition,
      cohort,
    }
    : null;

  if (!ready || forceSkeleton) return <Layout><PageContentSkeleton pathname="/stats" /></Layout>;

  const empty = sessionCount === 0;

  return (
    <Layout>
      <h1 className="sr-only">{t("stats.title")}</h1>

      {loadFailed ? (
        <section className="card flex flex-col items-center p-8 text-center sm:p-10" role="status">
          <h2 className="mb-1 text-base font-bold" style={{ color: "var(--bt-text-1)" }}>{t("stats.loadErrorTitle")}</h2>
          <p className="mb-5 max-w-xs text-sm" style={{ color: "var(--bt-text-2)" }}>{t("stats.loadErrorSub")}</p>
          <button type="button" onClick={retryLoad} className="btn-primary min-h-11 px-5 text-sm">
            {t("plan.retryLoad")}
          </button>
        </section>
      ) : empty ? (
        <div className="flex flex-col gap-4">
          <section className="card flex flex-col items-center p-8 text-center sm:p-10">
            <h2 className="mb-1 text-base font-bold" style={{ color: "var(--bt-text-1)" }}>{t("stats.emptyChartsTitle")}</h2>
            <p className="mb-5 max-w-xs text-sm" style={{ color: "var(--bt-text-2)" }}>{t("stats.emptyChartsSub")}</p>
            <Link href="/dashboard" className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              {t("stats.emptyCta")}
            </Link>
          </section>
          {/* Un compte sans session peut avoir archivé un cours mal nommé : sans
              cette section, il n'aurait aucun endroit d'où le supprimer. */}
          <StudyHistory
            className="bt-stats-readable"
            archived={archivedRows}
            archivedBusyId={archiveBusyId}
            onRestoreCourse={restoreArchivedCourse}
            onDeleteCourse={deleteArchivedCourse}
          />
        </div>
      ) : (
        /* L'ordre de la page suit les questions de l'étudiant, du plus personnel
           au plus social :
             1. où j'en suis aujourd'hui           → héros
             2. comment mon étude a évolué         → temps d'étude
             3. où est allé ce temps               → par cours
             4. suis-je régulier                   → régularité
             5. quelles habitudes, quels records   → habitudes · records
             6. et par rapport aux autres          → classement · me situer
             7. ce que j'ai obtenu                 → badges
           Avant, le classement occupait tout le rail droit dès la première
           rangée — à égalité avec le graphique — et s'intercalait sur téléphone
           avant la régularité : la comparaison passait devant la
           compréhension. L'ordre du DOM est maintenant l'ordre de lecture à
           toutes les largeurs ; plus de `display: contents` ni de `order-*`.

           `bt-stats-readable` remonte les encres secondaires au seuil de
           lecture (voir styles/globals.css). */
        <div className="bt-stats-readable flex flex-col gap-4 xl:gap-5">
          <StatsHero
            todaySecs={todaySecs} goalSecs={DAILY_GOAL_SECS}
            weekSecs={weekSecs} streak={streak}
          />

          {/* Volume et répartition côte à côte à partir de xl : deux lectures
              de la même période récente. Le graphique prend la largeur, parce
              qu'une tendance se lit en comparant des barres voisines. */}
          <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
            <StudyTimeChart
              series={series}
              goalMinutes={DAILY_GOAL_SECS / 60}
              periodLabel={rangeLabel(chartPeriod, chartRange)}
              period={chartPeriod}
              periodOptions={periodOptions}
              onPeriodChange={setChartPeriod}
            />
            <StudyByCourse
              rows={breakdown.rows}
              totalSecs={breakdown.totalSecs}
              periodLabel={rangeLabel(coursePeriod, courseRange)}
              period={coursePeriod}
              periodOptions={periodOptions}
              onPeriodChange={setCoursePeriod}
            />
          </div>

          <ConsistencyCard
            sessions={sessions}
            streak={streak}
            bestStreak={bestStreak}
            activeDays={activeDays}
            periodDays={consistencyRange.days}
            periodLabel={t("stats.consistencyWindow")}
            trend={trend}
          />

          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 xl:gap-5">
            <StudyHabits insights={insights} />
            <StudyHistory
              insights={insights}
              allTimeSecs={allTimeSecs}
              archived={archivedRows}
              archivedBusyId={archiveBusyId}
              onRestoreCourse={restoreArchivedCourse}
              onDeleteCourse={deleteArchivedCourse}
            />
          </div>

          {/* ── Et par rapport aux autres ──
              Une frontière explicite : ce qui suit ne parle plus de TON étude.
              Trois surfaces répondaient à « où je me situe » (classement,
              carte percentile, moyennes) ; il en reste deux, de rôles
              distincts — les personnes, puis ta position anonyme. */}
          <section aria-labelledby="stats-compare-title" className="mt-2 flex flex-col gap-3">
            <div>
              <h2 id="stats-compare-title" className="bt-section-title">{t("stats.compareSectionTitle")}</h2>
              {/* Posée sur le fond de page et non sur une carte : l'encre
                  secondaire n'y tient que 4,1:1, d'où l'encre principale. */}
              <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--bt-text-1)" }}>
                {t("stats.compareSectionSub")}
              </p>
            </div>
            <div className="flex flex-col gap-4 xl:grid xl:grid-cols-2 xl:items-start xl:gap-5">
              <Leaderboard
                user={user}
                profile={profile}
                onViewUser={setViewUserId}
                compact
                desktopTall
              />
              <CompareCard comparison={comparison} position={position} />
            </div>
          </section>

          <BadgeSummary earned={earnedBadges} />
        </div>
      )}

      {viewUserId && <UserProfileModal userId={viewUserId} onClose={() => setViewUserId(null)} />}
    </Layout>
  );
}
