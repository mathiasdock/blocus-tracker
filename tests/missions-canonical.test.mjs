// Phase 5B — missions sur les jours canoniques. Le serveur fait foi (v76,
// testé en base par supabase/tests/missions_canonical.sql) ; le repli local
// applique les mêmes règles sur les mêmes sources (lib/missionStats.mjs).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { missionDayStats } from "../lib/missionStats.mjs";
import { mergeStudyDays } from "../lib/studyDays.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const TODAY = "2026-10-14";
const row = (local_date, seconds, course_id = null, session_id = `${local_date}-${seconds}-${course_id}`) => ({ session_id, local_date, seconds, course_id });
const m25 = (stats) => stats.todaySecs >= 1500;

test("24:59 ne valide pas 25 min, 25:00 oui ; plusieurs sessions se cumulent", () => {
  assert.equal(m25(missionDayStats({ rows: [row(TODAY, 1499)], today: TODAY })), false);
  assert.equal(m25(missionDayStats({ rows: [row(TODAY, 1499), row(TODAY, 1, null, "b")] , today: TODAY })), true);
  assert.equal(m25(missionDayStats({ rows: [row(TODAY, 500, null, "a"), row(TODAY, 500, null, "b"), row(TODAY, 500, null, "c")], today: TODAY })), true);
});

test("la règle des 5 min du streak ne touche pas les missions de durée", () => {
  // 4 min 59 : pas un jour étudié après le 05/10, mais bien 299 s de mission.
  assert.equal(missionDayStats({ rows: [row(TODAY, 299)], today: TODAY }).todaySecs, 299);
});

test("23:30 → 00:30 : 30 min pour chaque jour, et seulement la portion du jour", () => {
  const session = {
    id: "night", timezone: "Europe/Brussels", duration_seconds: 3600, course_id: "c1",
    started_at: "2026-10-13T21:30:00Z", ended_at: "2026-10-13T22:30:00Z",
  };
  const rows = mergeStudyDays([], { unsynced: [session] });
  const yesterday = missionDayStats({ rows, today: "2026-10-13" });
  const today = missionDayStats({ rows, today: TODAY });
  assert.equal(yesterday.todaySecs, 1800);
  assert.equal(today.todaySecs, 1800);
  assert.equal(today.minutesOnCourse.c1, 30);
});

test("session hors ligne : comptée une fois, même envoyée deux fois", () => {
  const offline = { id: "q", timezone: "Europe/Brussels", duration_seconds: 1500, started_at: "2026-10-14T08:00:00Z", ended_at: "2026-10-14T08:25:00Z" };
  const rows = mergeStudyDays([], { unsynced: [offline, offline] });
  assert.equal(missionDayStats({ rows, today: TODAY }).todaySecs, 1500);
  const synced = mergeStudyDays([{ session_id: "q", local_date: TODAY, seconds: 1500 }], { unsynced: [offline] });
  assert.equal(missionDayStats({ rows: synced, today: TODAY }).todaySecs, 1500);
});

test("cours : minutes par cours depuis les portions, 15 min par cours", () => {
  const stats = missionDayStats({ rows: [row(TODAY, 900, "a"), row(TODAY, 840, "b"), row("2026-10-13", 600, "b")], today: TODAY });
  assert.equal(stats.todayCoursesCount, 1, "14 min sur b aujourd'hui (les 10 min d'hier ne comptent pas)");
});

test("sessions individuelles : les sessions commencées aujourd'hui, pas les totaux", () => {
  const startedToday = [
    { id: "1", duration_seconds: 1800, started_at: "2026-10-14T07:00:00Z" },
    { id: "2", duration_seconds: 1800, started_at: "2026-10-14T13:00:00Z" },
  ];
  const stats = missionDayStats({ rows: [row(TODAY, 3600)], startedToday, today: TODAY });
  assert.equal(stats.todayMaxSessionSecs, 1800, "deux fois 30 min ne font pas une session de 50");
  assert.equal(stats.todaySessionCount, 2);
  assert.equal(stats.todayFocusedCount, 2);
});

test("série : la valeur officielle passe telle quelle", () => {
  assert.equal(missionDayStats({ rows: [], today: TODAY, streak: 7 }).streak, 7);
});

test("v76 : sources canoniques, complétion tardive idempotente, rien de repris", () => {
  const sql = read("../supabase/migration_v76_missions_canonical_days.sql").replace(/--[^\n]*/g, "");
  // Plus aucune mission sur la série legacy.
  assert.doesNotMatch(sql, /gamification_current_streak\(p_user_id\)/);
  assert.match(sql, /select s\.current_streak into v_streak from public\.study_streaks\(p_user_id, p_date\) s;/);
  // Durées : session_days, minutes tronquées comme avant.
  assert.match(sql, /from public\.session_days sd\s+where sd\.user_id = p_user_id and sd\.local_date = p_date/);
  assert.match(sql, /\(sum\(secs\)::bigint \/ 60\)::integer/);
  // Jours étudiés : seuil de la date.
  assert.match(sql, /count\(\*\) from days where secs >= public\.study_day_min_seconds\(local_date\)/);
  // Sessions individuelles : jour local de début dans le fuseau de la session.
  assert.match(sql, /\(s\.started_at at time zone coalesce\(s\.timezone, 'Europe\/Brussels'\)\)::date = p_date/);
  // Tardif : insertion seulement, différé, borné à la date de mise en service.
  assert.match(sql, /create constraint trigger b20_refresh_missions_for_day\s+after insert on public\.session_day_parts\s+deferrable initially deferred/);
  assert.match(sql, /if new\.local_date >= public\.mission_late_completion_from\(\) then/);
  assert.match(sql, /select date '2026-09-26'/);
  // Jamais de création rétroactive ni de retrait ; une seule récompense.
  const refresh = sql.slice(sql.indexOf("function public.refresh_daily_missions_for_date"), sql.indexOf("function public.refresh_daily_missions_for_user"));
  assert.doesNotMatch(refresh, /insert into public\.daily_mission_assignments|completed_at = null|delete from/);
  assert.match(refresh, /on conflict \(user_id, source, source_key\) do nothing/);
  // Seuils et XP inchangés.
  for (const t of ["x.day_seconds >= 1500", "x.day_seconds >= 3600", "x.max_session >= 3000", "x.courses_15 >= 2", "v_exam_week_min >= 15"]) {
    assert.ok(refresh.includes(t), t);
  }
  assert.doesNotMatch(sql, /function public\.gamification_mission_xp/);
});

test("client : plus de série legacy ni de repli hebdomadaire UTC", () => {
  const xp = read("../lib/xp.js");
  const dashboard = read("../pages/dashboard.js");
  assert.doesNotMatch(xp, /fallbackWeeklyMissions|weekStartISO/);
  assert.doesNotMatch(dashboard, /computeStreak|legacyMissionStreak/);
  assert.match(dashboard, /missionDayStats\(\{ rows: studyDays, startedToday: missionSessions, today: todayDate, streak \}\)/);
});
