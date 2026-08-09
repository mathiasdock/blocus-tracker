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
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { loadUserLevelMap } from "../lib/userLevels";
import { getDailyMissionDefs, evaluateMissions } from "../lib/xp";
import { todayISO } from "../lib/format";

function MissionRow({ label, xp, done }) {
  return (
    <li className="flex items-center gap-2.5">
      <span
        className={done ? "bt-check-pop" : ""}
        style={{
          width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          backgroundColor: done ? "#14B885" : "var(--bt-subtle)",
          border: done ? "none" : "1px solid var(--bt-border)",
        }}
      >
        {done && (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff"
            strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>
      <span className="flex-1 text-[13px] leading-snug"
        style={{ color: done ? "var(--bt-text-3)" : "var(--bt-text-2)", textDecoration: done ? "line-through" : "none" }}>
        {label}
      </span>
      <span className="font-num tabular-nums text-[11px] font-bold shrink-0"
        style={{ color: done ? "var(--bt-text-4)" : "var(--bt-accent-dark)" }}>
        +{xp}
      </span>
    </li>
  );
}

export default function DailyProgressCard({ todayStats }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [levelInfo, setLevelInfo] = useState(null);
  const [serverMissions, setServerMissions] = useState(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [levels, missionsRes] = await Promise.all([
      loadUserLevelMap(supabase, [user.id], { selfUserId: user.id }).catch(() => null),
      supabase.rpc("get_my_daily_missions").then(r => r).catch(() => ({ data: null })),
    ]);
    if (levels?.[user.id]) setLevelInfo(levels[user.id]);
    if (Array.isArray(missionsRes?.data) && missionsRes.data.length) {
      setServerMissions(missionsRes.data.map(m => ({ key: m.label_key, xp: m.xp, done: m.done })));
    }
  }, [user]);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener("bt-xp-changed", onChange);
    return () => window.removeEventListener("bt-xp-changed", onChange);
  }, [refresh]);

  // Repli hors-ligne / avant migration : mêmes définitions, évaluées localement.
  const fallbackMissions = evaluateMissions(
    getDailyMissionDefs(todayISO(), user?.id),
    todayStats || {}
  ).map(m => ({ key: m.key, xp: m.xp, done: m.done }));
  const missions = serverMissions || fallbackMissions;

  if (!user || !levelInfo?.current) return null;

  const { current, next, progressXP, rangeXP, progressPct, totalXP } = levelInfo;
  const doneCount = missions.filter(m => m.done).length;

  return (
    <section className="card p-5 min-w-0">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: "var(--bt-text-3)" }}>
          {t("xp.cardTitle")}
        </h2>
        <span className="font-num tabular-nums text-[11px] font-bold px-2 py-1 rounded-full"
          style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }}>
          {totalXP} {t("xp.xpLabel")}
        </span>
      </div>

      {/* Niveau + barre de progression */}
      <div className="flex items-center gap-3 mb-2">
        <div className="flex flex-col items-center justify-center shrink-0"
          style={{
            width: 44, height: 44, borderRadius: 14,
            background: "linear-gradient(165deg, #14B885, #0E8F68 115%)",
            boxShadow: "0 3px 14px rgba(20,184,133,0.40)",
          }}>
          <span style={{ fontSize: 8, fontWeight: 600, color: "rgba(255,255,255,0.72)", lineHeight: 1 }}>
            {t("xp.level")}
          </span>
          <span className="font-num tabular-nums" style={{ fontSize: 19, fontWeight: 700, color: "#fff", lineHeight: 1.15 }}>
            {current.level}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display truncate" style={{ fontSize: 15, fontWeight: 700, color: "var(--bt-text-1)" }}>
            {t(current.titleKey)}
          </p>
          <p className="tabular-nums text-[11px] mt-0.5" style={{ color: "var(--bt-text-3)" }}>
            {next ? `${progressXP} / ${rangeXP} ${t("xp.xpLabel")}` : t("xp.maxLevel")}
          </p>
        </div>
      </div>
      <div style={{ height: 8, borderRadius: 99, overflow: "hidden", backgroundColor: "var(--bt-subtle)" }}>
        <div style={{
          height: "100%", borderRadius: 99, width: `${progressPct}%`,
          background: "linear-gradient(90deg, #0EA571 0%, #14B885 55%, #22E4A4 100%)",
          transition: "width 0.4s ease-out",
        }} />
      </div>

      {/* Missions du jour */}
      <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--bt-border)" }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--bt-text-3)" }}>
            {t("xp.missions")}
          </h3>
          <span className="font-num tabular-nums text-[11px] font-semibold" style={{ color: "var(--bt-text-3)" }}>
            {doneCount}/{missions.length}
          </span>
        </div>
        <ul className="flex flex-col gap-2.5">
          {missions.map((m, i) => (
            <MissionRow key={`${m.key}-${i}`} label={t(m.key)} xp={m.xp} done={m.done} />
          ))}
        </ul>
      </div>
    </section>
  );
}
