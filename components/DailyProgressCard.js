// Progression du jour sur le DASHBOARD — niveau + missions.
//
// Pourquoi ici : la boucle effort → récompense était coupée en deux. On gagnait
// de l'XP au chrono et on l'apprenait ailleurs, sur /profile, plus tard, si on
// y pensait. Le dashboard n'affichait que la série.
//
// Effet de bord VOULU : `get_my_daily_missions` évalue les missions côté
// serveur et crédite leur XP. Tant que ce RPC n'était appelé que depuis
// /profile, une journée d'étude sans passage par le profil ne rapportait rien
// (80 missions créditées en tout, pour 14 utilisateurs). L'appeler depuis le
// dashboard répare cette fuite pour tout le monde, même avant que le trigger
// SQL de la migration v39 ne soit exécuté.

import { useCallback, useEffect, useState } from "react";
import Glyph from "./Glyph";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { loadUserLevelMap } from "../lib/userLevels";
import { getDailyMissionDefs, evaluateMissions, fallbackWeeklyMissions } from "../lib/xp";
import MascotMoment from "./MascotMoment";
import { missionText, weeklyText, weeklyProgressLabel, weeklyRatio, weeklyRemaining } from "../lib/missionText";
import { todayISO } from "../lib/format";
import { weekStartISO } from "../lib/xp";

function MissionRow({ label, xp, done }) {
  return (
    <li className="flex min-h-9 items-center gap-3">
      <span
        className={done ? "bt-check-pop" : ""}
        style={{
          width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          backgroundColor: done ? "var(--bt-accent)" : "var(--bt-subtle)",
          border: done ? "none" : "1px solid var(--bt-border)",
        }}
      >
        {done && (
          <Glyph size={9} strokeWidth={3.5} style={{ color: "var(--bt-on-accent)" }}>
            <polyline points="20 6 9 17 4 12" />
          </Glyph>
        )}
      </span>
      <span className="flex-1 text-sm leading-snug"
        style={{ color: done ? "var(--bt-text-3)" : "var(--bt-text-2)", textDecoration: done ? "line-through" : "none" }}>
        {label}
      </span>
      <span className="font-num shrink-0 text-xs font-bold tabular-nums"
        style={{ color: done ? "var(--bt-text-4)" : "var(--bt-accent-text)" }}>
        +{xp} XP
      </span>
    </li>
  );
}

// Le Défi du jour ne ressemble pas aux trois autres : une ligne de plus dans
// la même liste se serait lue comme une quatrième corvée. Titre = la situation
// (« Examen dans 6 jours »), sous-titre = la donnée personnelle qui rend le
// défi crédible (« Hier : 1 h 42 »).
function ChallengeRow({ challenge, t }) {
  const { title, body } = missionText(t, challenge);
  const done = Boolean(challenge.done);
  return (
    <div className="rounded-2xl px-3.5 py-3"
      style={{
        backgroundColor: "var(--bt-surface)",
        boxShadow: `inset 0 0 0 1px var(--bt-accent-border)`,
        opacity: done ? 0.75 : 1,
      }}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em]"
          style={{ color: "var(--bt-accent-dark)" }}>
          <Glyph size={12} strokeWidth={2.4}>
            <path d="M12 3l2.6 5.6 6.1.8-4.5 4.2 1.2 6.1L12 16.8 6.6 19.7l1.2-6.1L3.3 9.4l6.1-.8z" />
          </Glyph>
          {t("xp.challengeLabel")}
        </span>
        <span className="font-num shrink-0 text-xs font-bold tabular-nums" style={{ color: "var(--bt-accent-dark)" }}>
          +{challenge.xp} XP
        </span>
      </div>
      <p className="text-[15px] font-bold leading-snug"
        style={{ color: "var(--bt-text-1)", textDecoration: done ? "line-through" : "none" }}>
        {title}
      </p>
      {body && <p className="mt-0.5 text-xs leading-snug" style={{ color: "var(--bt-text-3)" }}>{body}</p>}
    </div>
  );
}

// La progression est la raison d'être des missions de semaine : sept jours
// d'effort qui n'afficheraient que « fait / pas fait » ne donneraient aucune
// raison de revenir mercredi. Comptes courts en pastilles, temps en barre —
// « 6h24 sur 8h » ne se dessine pas en cinq points.
function WeeklyRow({ row, t }) {
  const dotted = row.id === "w_days" || row.id === "w_courses";
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm leading-snug" style={{ color: row.done ? "var(--bt-text-3)" : "var(--bt-text-2)" }}>
          {weeklyText(t, row)}
        </span>
        <span className="font-num shrink-0 text-xs font-bold tabular-nums"
          style={{ color: row.done ? "var(--bt-text-4)" : "var(--bt-accent-text)" }}>
          +{row.xp} XP
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2.5">
        {dotted ? (
          <span className="flex flex-1 gap-1.5" aria-hidden="true">
            {Array.from({ length: row.target }, (_, i) => (
              <span key={i} className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: i < row.progress ? "var(--bt-accent)" : "var(--bt-subtle)" }} />
            ))}
          </span>
        ) : (
          <span className="h-2 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: "var(--bt-subtle)" }} aria-hidden="true">
            <span className="block h-full origin-left rounded-full transition-transform duration-300 motion-reduce:transition-none"
              style={{ transform: `scaleX(${weeklyRatio(row)})`, backgroundColor: "var(--bt-accent)" }} />
          </span>
        )}
        <span className="font-num shrink-0 text-xs tabular-nums"
          style={{ color: row.done ? "var(--bt-accent-dark)" : "var(--bt-text-3)" }}>
          {weeklyProgressLabel(t, row)}
        </span>
      </div>
    </li>
  );
}

export default function DailyProgressCard({ todayStats, className = "" }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [levelInfo, setLevelInfo] = useState(null);
  const [serverMissions, setServerMissions] = useState(null);
  const [serverWeekly, setServerWeekly] = useState(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [levels, missionsRes, weeklyRes] = await Promise.all([
      loadUserLevelMap(supabase, [user.id], { selfUserId: user.id }).catch(() => null),
      supabase.rpc("get_my_daily_missions").then(r => r).catch(() => ({ data: null })),
      supabase.rpc("get_my_weekly_missions").then(r => r).catch(() => ({ data: null })),
    ]);
    if (levels?.[user.id]) setLevelInfo(levels[user.id]);
    if (Array.isArray(missionsRes?.data) && missionsRes.data.length) {
      setServerMissions(missionsRes.data.map(m => ({
        id: m.mission_id, key: m.label_key, xp: m.xp, done: m.done,
        kind: m.kind || "daily", params: m.params || {},
      })));
    }
    if (Array.isArray(weeklyRes?.data)) {
      setServerWeekly(weeklyRes.data.map(w => ({
        id: w.mission_id, key: w.label_key, target: Number(w.target || 0),
        progress: Number(w.progress || 0), xp: Number(w.xp || 0), done: Boolean(w.done),
      })));
    }
  }, [user]);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener("bt-xp-changed", onChange);
    return () => window.removeEventListener("bt-xp-changed", onChange);
  }, [refresh]);

  // Repli le temps de l'aller-retour serveur. Cette carte ne charge que les
  // sessions du JOUR : elle ne peut donc pas calculer un défi qui demande
  // l'historique (hier, la moyenne, l'absence). Seule la série lui est connue,
  // et `pickFallbackChallenge` s'abstient plutôt que d'inventer.
  const fallbackAll = evaluateMissions(
    getDailyMissionDefs(todayISO(), user?.id, { streak: todayStats?.streak || 0 }),
    todayStats || {}
  );
  const allMissions = serverMissions || fallbackAll;
  const missions = allMissions.filter(m => m.kind !== "challenge");
  const challenge = allMissions.find(m => m.kind === "challenge") || null;
  const weekly = serverWeekly || [];

  if (!user) return null;

  const current = levelInfo?.current || null;
  const next = levelInfo?.next || null;
  const progressXP = levelInfo?.progressXP || 0;
  const rangeXP = levelInfo?.rangeXP || 0;
  const progressPct = levelInfo?.progressPct || 0;
  const totalXP = levelInfo?.totalXP || 0;
  const doneCount = allMissions.filter(m => m.done).length;

  // La mascotte n'entre PAS dans cette carte par défaut. Elle n'apparaît que
  // sur un fait accompli : la journée bouclée, un défi de semaine remporté, ou
  // le dernier quart d'heure avant de le remporter. Le reste du temps la carte
  // parle toute seule — c'est une liste de cases à cocher, elle n'a besoin de
  // personne pour dire ce qu'elle dit déjà.
  const weeklyWon = weekly.find(w => w.done);
  const weeklyNear = weekly.find(w => !w.done && weeklyRatio(w) >= 0.7);
  const missionMoment =
    weeklyWon
      ? { key: `weekly-done-${weekStartISO()}-${weeklyWon.id}`, mood: "celebrating", frequency: "once",
          presentation: "celebration", message: t("mascot.weeklyDone") }
      : (allMissions.length >= 4 && doneCount === allMissions.length)
        ? { key: "perfect-day", mood: "celebrating", frequency: "daily",
            presentation: "celebration", message: t("mascot.perfectDay") }
        : weeklyNear
          ? { key: `weekly-close-${weeklyNear.id}`, mood: "focused", frequency: "daily",
              presentation: "bubble",
              message: t("mascot.weeklyClose").replace("{left}", weeklyRemaining(t, weeklyNear)) }
          : null;

  return (
    <section className={`card bt-dashboard-card-mint min-w-0 p-4 sm:p-5 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold" style={{ color: "var(--bt-text-1)" }}>{t("xp.missions")}</h2>
          <p className="mt-0.5 text-xs" style={{ color: "var(--bt-text-3)" }}>{t("xp.missionsHelp")}</p>
        </div>
        <span className="font-num inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-bold tabular-nums"
          style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }}>
          {doneCount}/{allMissions.length}
        </span>
      </div>

      {missionMoment && (
        <MascotMoment
          eventKey={missionMoment.key}
          message={missionMoment.message}
          mood={missionMoment.mood}
          frequency={missionMoment.frequency}
          presentation={missionMoment.presentation}
          streak={todayStats?.streak || 0}
          className="mt-3"
        />
      )}

      {challenge && (
        <div className="mt-3">
          <ChallengeRow challenge={challenge} t={t} />
        </div>
      )}

      <div className="mt-3">
        <ul className="flex flex-col gap-1.5">
          {missions.map((m, i) => (
            <MissionRow key={m.id || i} label={missionText(t, m).title} xp={m.xp} done={m.done} />
          ))}
        </ul>
      </div>

      {weekly.length > 0 && (
        <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--bt-accent-border)" }}>
          <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--bt-text-3)" }}>
            {t("xp.weeklyTitle")}
          </p>
          <ul className="flex flex-col gap-3">
            {weekly.map((w, i) => <WeeklyRow key={w.id || i} row={w} t={t} />)}
          </ul>
        </div>
      )}

      {current && (
        <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--bt-accent-border)" }}>
          <div className="flex items-center gap-3">
            <span className="font-num inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-xl px-2 text-sm font-extrabold tabular-nums"
              style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }}>
              {t("xp.level")} {current.level}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t(current.titleKey)}</p>
                <p className="font-num shrink-0 text-xs font-semibold tabular-nums" style={{ color: "var(--bt-text-3)" }}>
                  {next ? `${progressXP}/${rangeXP} ${t("xp.xpLabel")}` : t("xp.maxLevel")}
                </p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full" role="progressbar" aria-label={t("xp.cardTitle")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPct} style={{ backgroundColor: "var(--bt-subtle)" }}>
                <div className="h-full origin-left rounded-full transition-transform duration-300 motion-reduce:transition-none" style={{ transform: `scaleX(${progressPct / 100})`, backgroundColor: "var(--bt-accent)" }} />
              </div>
            </div>
          </div>
          <p className="sr-only">{totalXP} {t("xp.xpLabel")}</p>
        </div>
      )}
    </section>
  );
}
