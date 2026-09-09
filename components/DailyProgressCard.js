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
import { getDailyMissionDefs, evaluateMissions } from "../lib/xp";
import { todayISO } from "../lib/format";

function MissionRow({ label, xp, done, social = false }) {
  return (
    <li className={`flex min-h-9 items-center gap-3 ${social ? "bt-dashboard-reward rounded-xl px-2.5 py-2" : ""}`}>
      <span
        className={done ? "bt-check-pop" : ""}
        style={{
          width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          backgroundColor: done ? "var(--bt-accent)" : social ? "var(--bt-surface)" : "var(--bt-subtle)",
          border: done ? "none" : `1px solid ${social ? "var(--bt-reward-border)" : "var(--bt-border)"}`,
        }}
      >
        {done && (
          <Glyph size={9} strokeWidth={3.5} style={{ color: "var(--bt-on-accent)" }}>
            <polyline points="20 6 9 17 4 12" />
          </Glyph>
        )}
      </span>
      <span className="flex-1 text-sm leading-snug"
        style={{ color: done ? "var(--bt-text-3)" : social ? "var(--bt-reward-text)" : "var(--bt-text-2)", textDecoration: done ? "line-through" : "none" }}>
        {label}
      </span>
      <span className={`font-num shrink-0 font-bold tabular-nums ${social ? "rounded-full px-2 py-1 text-[10px]" : "text-xs"}`}
        style={{ color: done ? "var(--bt-text-4)" : social ? "var(--bt-reward-text)" : "var(--bt-accent-text)", backgroundColor: social ? "var(--bt-surface)" : "transparent" }}>
        +{xp} XP
      </span>
    </li>
  );
}

export default function DailyProgressCard({ todayStats, className = "" }) {
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

  if (!user) return null;

  const current = levelInfo?.current || null;
  const next = levelInfo?.next || null;
  const progressXP = levelInfo?.progressXP || 0;
  const rangeXP = levelInfo?.rangeXP || 0;
  const progressPct = levelInfo?.progressPct || 0;
  const totalXP = levelInfo?.totalXP || 0;
  const doneCount = missions.filter(m => m.done).length;
  const studyMissions = missions.filter(m => m.key !== "xp.m_referral");
  const socialMissions = missions.filter(m => m.key === "xp.m_referral");

  return (
    <section className={`card bt-dashboard-card-mint min-w-0 p-4 sm:p-5 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold" style={{ color: "var(--bt-text-1)" }}>{t("xp.missions")}</h2>
          <p className="mt-0.5 text-xs" style={{ color: "var(--bt-text-3)" }}>{t("xp.missionsHelp")}</p>
        </div>
        <span className="font-num inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-bold tabular-nums"
          style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }}>
          {doneCount}/{missions.length}
        </span>
      </div>

      <div className="mt-3">
        <ul className="flex flex-col gap-1.5">
          {studyMissions.map((m, i) => (
            <MissionRow key={`${m.key}-${i}`} label={t(m.key)} xp={m.xp} done={m.done} />
          ))}
        </ul>
        {socialMissions.length > 0 && (
          <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--bt-accent-border)" }}>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--bt-reward-text)" }}>
              {t("xp.communityBonus")}
            </p>
            <ul>
              {socialMissions.map((m, i) => (
                <MissionRow key={`${m.key}-${i}`} label={t(m.key)} xp={m.xp} done={m.done} social />
              ))}
            </ul>
          </div>
        )}
      </div>

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
