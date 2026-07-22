import { useEffect, useState } from "react";
import { Avatar } from "./Layout";
import LevelPill from "./LevelPill";
import { SkeletonList } from "./Skeleton";
import EmptyState from "./EmptyState";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { formatMinutesShort, displayName, lastNDates, todayISO } from "../lib/format";
import { loadUserLevelMap } from "../lib/userLevels";
import AnimatedNumber from "./AnimatedNumber";
import Flame from "./Flame";

// ── RankBadge ────────────────────────────────────────────────
// Pastille de rang — podium or / argent / bronze pour bien démarquer le 1er.
// Réservé et intentionnel (comme le rouge pour le destructif) ; le reste en
// numéro discret. Chiffres en Space Grotesk. Dark-safe (couleurs pleines).
// (Déplacé depuis pages/stats.js — aussi utilisé par le podium des cours.)
export function RankBadge({ rank }) {
  const medal = rank === 1
    ? { backgroundColor: "#F59E0B", color: "#fff", boxShadow: "0 2px 10px rgba(245,158,11,0.5)" }   // or
    : rank === 2
    ? { backgroundColor: "#9AA4B2", color: "#fff", boxShadow: "0 1px 5px rgba(154,164,178,0.45)" }  // argent
    : rank === 3
    ? { backgroundColor: "#C2703D", color: "#fff", boxShadow: "0 1px 5px rgba(194,112,61,0.45)" }   // bronze
    : null;
  if (!medal) {
    return (
      <span className="shrink-0 w-6 h-6 flex items-center justify-center font-num font-bold text-xs tabular-nums"
        style={{ color: "var(--bt-text-3)" }}>
        {rank}
      </span>
    );
  }
  return (
    <span className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center font-num font-bold text-xs tabular-nums"
      style={medal}>
      {rank}
    </span>
  );
}

// ── Styles partagés des contrôles (même langage que le reste des Stats) ──
const segWrap = { display: "inline-flex", backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)", borderRadius: 24, padding: 3, flexShrink: 0 };
const segBtn = (active) => ({
  borderRadius: 20, padding: "5px 12px", fontSize: 12, fontWeight: active ? 600 : 400,
  border: "none", cursor: "pointer", transition: "all 0.15s",
  backgroundColor: active ? "#14B885" : "transparent",
  color: active ? "#fff" : "var(--bt-text-3)",
  boxShadow: active ? "0 1px 4px rgba(20,184,133,0.30)" : "none",
});
const chipBtn = (active) => ({
  borderRadius: 20, padding: "5px 12px", fontSize: 12, fontWeight: active ? 600 : 400,
  border: "1px solid", cursor: "pointer", transition: "all 0.15s",
  backgroundColor: active ? "#EAFBF4" : "transparent",
  color: active ? "#0E8F68" : "var(--bt-text-3)",
  borderColor: active ? "#C6EED9" : "var(--bt-border)",
  flexShrink: 0,
});

function Segmented({ options, value, onChange }) {
  return (
    <div style={segWrap}>
      {options.map(opt => (
        <button key={opt.val} onClick={() => onChange(opt.val)} style={segBtn(value === opt.val)}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Leaderboard ──────────────────────────────────────────────
// Classement de la page Stats. Métriques : temps / série / régularité ;
// portée Public / Amis ; filtres Mon école / Ma filière / Mon année ;
// période Jour / Semaine / Mois. Tout est servi par get_leaderboard_v2
// (migration v27). Tant que la migration n'a pas été exécutée en prod, on
// retombe automatiquement sur l'ancien comportement (get_public_leaderboard
// + calcul amis côté client) avec les anciens contrôles uniquement.
export default function Leaderboard({ user, profile, onViewUser }) {
  const { t } = useI18n();

  const [mode,   setMode]   = useState("public"); // public | friends
  const [period, setPeriod] = useState("day");    // day | week | month
  const [metric, setMetric] = useState("time");   // time | streak | regularity
  const [fUni,   setFUni]   = useState(false);
  const [fField, setFField] = useState(false);
  const [fYear,  setFYear]  = useState(false);

  const [v2Available, setV2Available] = useState(true); // optimiste ; ↓ legacy si RPC absente
  const [rows,    setRows]    = useState([]);
  const [levels,  setLevels]  = useState({});
  const [loading, setLoading] = useState(true);
  const [friendIds, setFriendIds] = useState([]);

  // Le sélecteur de métrique contraint la période : la série est
  // indépendante de la période, la régularité n'a pas de sens sur un jour.
  function pickMetric(m) {
    setMetric(m);
    if (m === "regularity" && period === "day") setPeriod("week");
  }

  // Amis acceptés — sert à afficher l'onglet Amis et au repli legacy.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: links } = await supabase
        .from("friendships")
        .select("requester, addressee")
        .or(`requester.eq.${user.id},addressee.eq.${user.id}`)
        .eq("status", "accepted");
      setFriendIds((links || []).map(l => l.requester === user.id ? l.addressee : l.requester));
    })();
  }, [user]);

  // ── Chargement principal ───────────────────────────────────
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      let list = null;

      if (v2Available) {
        const { data, error } = await supabase.rpc("get_leaderboard_v2", {
          p_period:      metric === "streak" ? "week" : period,
          p_metric:      metric,
          p_scope:       mode === "friends" ? "friends" : "all",
          p_university:  fUni   ? (profile?.university  || null) : null,
          p_study_field: fField ? (profile?.study_field || null) : null,
          p_study_year:  fYear  ? (profile?.study_year  || null) : null,
        });
        if (error || data == null) {
          // RPC absente (migration v27 pas encore exécutée) → repli legacy.
          if (!cancelled) setV2Available(false);
          return;
        }
        list = data.map(r => ({
          user_id: r.user_id,
          name: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.pseudo,
          avatar_url: r.avatar_url,
          total_seconds: Number(r.total_seconds),
          alltime_seconds: Number(r.alltime_seconds),
          streak_days: Number(r.streak_days),
          active_days: Number(r.active_days),
        }));
      } else if (mode === "public") {
        // Legacy : ancienne RPC (heures uniquement, filtre école, jour/semaine).
        const { data } = await supabase.rpc("get_public_leaderboard", {
          p_period: period === "month" ? "week" : period,
          p_university: fUni ? (profile?.university || null) : null,
        });
        list = (data || []).map(r => ({
          user_id: r.user_id,
          name: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.pseudo,
          avatar_url: r.avatar_url,
          total_seconds: Number(r.total_seconds),
          alltime_seconds: Number(r.alltime_seconds ?? r.total_seconds ?? 0),
          streak_days: 0,
          active_days: 0,
        }));
      } else {
        // Legacy amis : profils + sessions 7 j des amis, moi inclus.
        const ids = friendIds;
        const since7 = lastNDates(7)[0];
        const [{ data: profs }, { data: fSessions }, { data: mine }] = await Promise.all([
          ids.length
            ? supabase.from("profiles").select("id, pseudo, first_name, last_name, avatar_url, university").in("id", ids)
            : Promise.resolve({ data: [] }),
          ids.length
            ? supabase.from("sessions").select("user_id, duration_seconds, started_at").in("user_id", ids).gte("started_at", since7)
            : Promise.resolve({ data: [] }),
          supabase.from("sessions").select("user_id, duration_seconds, started_at").eq("user_id", user.id).gte("started_at", since7),
        ]);
        const secsOf = (sess) => period === "day"
          ? sess.filter(s => s.started_at.slice(0, 10) === todayISO()).reduce((a, s) => a + s.duration_seconds, 0)
          : sess.reduce((a, s) => a + s.duration_seconds, 0);
        list = [
          { user_id: user.id, name: displayName(profile), avatar_url: profile?.avatar_url,
            total_seconds: secsOf(mine || []), alltime_seconds: 0, streak_days: 0, active_days: 0 },
          ...(profs || [])
            .filter(p => !fUni || !profile?.university || p.university === profile.university)
            .map(p => ({
              user_id: p.id, name: displayName(p), avatar_url: p.avatar_url,
              total_seconds: secsOf((fSessions || []).filter(s => s.user_id === p.id)),
              alltime_seconds: 0, streak_days: 0, active_days: 0,
            })),
        ].sort((a, b) => b.total_seconds - a.total_seconds);
      }

      if (cancelled) return;
      setRows(list);

      // Pastilles de niveau (mêmes règles qu'avant : fallback sur le temps total).
      const withAlltime = list.filter(r => r.alltime_seconds > 0);
      if (withAlltime.length) {
        const fallback = Object.fromEntries(withAlltime.map(r => [r.user_id, r.alltime_seconds]));
        const levelMap = await loadUserLevelMap(supabase, withAlltime.map(r => r.user_id), {
          selfUserId: user.id,
          fallbackTotalSecondsByUser: fallback,
        });
        if (!cancelled) setLevels(levelMap);
      } else {
        setLevels({});
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, profile, mode, period, metric, fUni, fField, fYear, v2Available, friendIds]);

  // ── Libellés ───────────────────────────────────────────────
  const periodDays = period === "month" ? 30 : 7;
  const metricLabel = metric === "streak" ? t("stats.metricStreak")
    : metric === "regularity" ? t("stats.metricRegularity")
    : t("stats.metricTime");
  const periodLabel = period === "day" ? t("stats.day") : period === "month" ? t("stats.month") : t("stats.week");

  const subtitle = v2Available
    ? [mode === "public" ? "Top 50" : null, metricLabel, metric === "streak" ? null : periodLabel]
        .filter(Boolean).join(" · ")
    : (mode === "public"
        ? (period === "day" ? t("stats.publicLeaderSubDay") : t("stats.publicLeaderSub"))
        : (period === "day" ? t("common.today") : t("stats.last7days")));

  // Valeur affichée à droite de chaque ligne, selon la métrique active.
  function ValueCell({ row, rank }) {
    const animate = rank <= 10;
    if (v2Available && metric === "streak") {
      return (
        <span className="inline-flex items-center gap-1 text-sm font-num font-semibold tabular-nums" style={{ color: "#D97706" }}>
          <Flame size={13} />
          {animate
            ? <AnimatedNumber value={row.streak_days} suffix={` ${t("stats.dayUnit")}`} />
            : <>{row.streak_days} {t("stats.dayUnit")}</>}
        </span>
      );
    }
    if (v2Available && metric === "regularity") {
      return (
        <span className="text-sm font-num font-semibold tabular-nums" style={{ color: "#0E8F68" }}>
          {animate ? <AnimatedNumber value={row.active_days} /> : row.active_days}/{periodDays} {t("stats.dayUnit")}
        </span>
      );
    }
    return (
      <span className="text-sm font-num font-semibold tabular-nums" style={{ color: "#0E8F68" }}>
        {animate
          ? <AnimatedNumber value={row.total_seconds} format={formatMinutesShort} />
          : formatMinutesShort(row.total_seconds)}
      </span>
    );
  }

  const periodOptions = [
    ...(metric === "regularity" ? [] : [{ val: "day", label: t("stats.day") }]),
    { val: "week", label: t("stats.week") },
    ...(v2Available ? [{ val: "month", label: t("stats.month") }] : []),
  ];

  return (
    <section className="card p-5 mt-6">
      {/* Titre + sous-titre dynamique */}
      <div className="mb-3">
        <h2 className="text-base font-semibold" style={{ color: "var(--bt-text-1)" }}>
          {mode === "friends" ? t("stats.leaderTitle") : t("stats.publicLeaderTitle")}
        </h2>
        <p className="text-xs" style={{ color: "var(--bt-text-3)" }}>{subtitle}</p>
      </div>

      {/* Ligne 1 : portée + période */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Segmented
          value={mode} onChange={setMode}
          options={[
            { val: "public", label: t("stats.filterPublic") },
            ...(friendIds.length ? [{ val: "friends", label: t("stats.filterFriends") }] : []),
          ]} />
        {(!v2Available || metric !== "streak") && (
          <div style={{ marginLeft: "auto" }}>
            <Segmented value={period} onChange={setPeriod} options={periodOptions} />
          </div>
        )}
      </div>

      {/* Ligne 2 (v2) : métrique + filtres de profil */}
      {v2Available && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Segmented
            value={metric} onChange={pickMetric}
            options={[
              { val: "time",       label: t("stats.metricTime") },
              { val: "streak",     label: t("stats.metricStreak") },
              { val: "regularity", label: t("stats.metricRegularity") },
            ]} />
          {profile?.university && (
            <button onClick={() => setFUni(f => !f)} className="flex items-center gap-1.5" style={chipBtn(fUni)}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
              </svg>
              {t("stats.filterMyUni")}
            </button>
          )}
          {profile?.study_field && (
            <button onClick={() => setFField(f => !f)} className="flex items-center gap-1.5" style={chipBtn(fField)}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
              {t("stats.filterMyField")}
            </button>
          )}
          {profile?.study_year && (
            <button onClick={() => setFYear(f => !f)} className="flex items-center gap-1.5" style={chipBtn(fYear)}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              {t("stats.filterMyYear")}
            </button>
          )}
        </div>
      )}
      {!v2Available && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {profile?.university && (
            <button onClick={() => setFUni(f => !f)} className="flex items-center gap-1.5" style={chipBtn(fUni)}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
              </svg>
              {t("stats.filterMyUni")}
            </button>
          )}
        </div>
      )}

      {/* Liste */}
      <div className="[&::-webkit-scrollbar]:hidden" style={{ maxHeight: "480px", overflowY: "auto", scrollbarWidth: "none" }}>
        {loading ? (
          <div className="py-1"><SkeletonList rows={6} avatar={32} lines={1} /></div>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((row, i) => {
              const isMe = row.user_id === user?.id;
              return (
                <li key={row.user_id}
                  className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors"
                  style={isMe ? { backgroundColor: "#EAFBF4" } : { cursor: "pointer" }}
                  onClick={() => { if (!isMe) onViewUser(row.user_id); }}
                  onMouseEnter={e => { if (!isMe) e.currentTarget.style.backgroundColor = "var(--bt-subtle)"; }}
                  onMouseLeave={e => { if (!isMe) e.currentTarget.style.backgroundColor = ""; }}>
                  <RankBadge rank={i + 1} />
                  <Avatar url={row.avatar_url} pseudo={row.name} size={32} />
                  <span className="flex-1 min-w-0 text-sm font-medium" style={{ color: "var(--bt-text-1)" }}>
                    <span className="inline-flex items-center gap-1.5 max-w-full">
                      <span className="truncate">{row.name}</span>
                      {Number(levels[row.user_id]?.totalXP) > 0 && (
                        <LevelPill level={levels[row.user_id].current.level} />
                      )}
                    </span>
                    {isMe && <span className="font-normal" style={{ color: "var(--bt-text-3)" }}> {t("stats.me")}</span>}
                  </span>
                  <ValueCell row={row} rank={i + 1} />
                </li>
              );
            })}
            {rows.length === 0 && (
              <li>
                <EmptyState illustration="leaderboard" title={t("stats.leaderboardEmptyTitle")} subtitle={t("stats.leaderboardEmptySubtitle")} />
              </li>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
