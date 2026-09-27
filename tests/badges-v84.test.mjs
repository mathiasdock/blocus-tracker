// Progression des badges v84 : catalogue, paliers, XP, textes FR/EN et
// formulation « ancienne règle ». Les règles elles-mêmes sont testées en base
// par supabase/tests/badges_v84.sql.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { BADGE_RULES_V84_FROM, LEGACY_DESC_KEYS, badgeDescKey, earnedUnderLegacyRule } from "../lib/badgeRules.mjs";
import { fetchCanonicalBadges } from "../lib/badgeTruth.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const badgesSrc = read("../lib/badges.js");
const artSrc = read("../lib/badgeArt.js");
const groupsSrc = read("../lib/badgeGroups.js");
const i18n = read("../lib/i18n.js");
const sql = read("../supabase/migration_v84_badges_progression.sql").replace(/--[^\n]*/g, "");

const CATALOG = [...badgesSrc.matchAll(/\{ id: "([a-z0-9_]+)",/g)].map((m) => m[1]);
const NEW = ["steamroller", "iron_month", "metronome", "regular", "relentless", "in_the_zone", "exam_ready", "all_rounder", "study_buddy", "early_bird"];
const RETIRED = ["motivator", "community_pillar"];
const TIER_XP = { discovery: 50, common: 125, rare: 300, epic: 600, legendary: 1200 };
// Les XP de la v78 : aucun badge existant ne change de montant.
const PREVIOUS_XP = {
  first_session: 50, first_friend: 50, first_exam: 50, first_post: 50, team_spirit: 50,
  hours_10: 125, marathon_day: 125, streak_3: 125, planner: 125,
  hours_50: 300, streak_7: 300, strategist: 300, influencer: 300,
  hours_100: 600, streak_14: 600, social: 600, referrer: 600,
  hours_250: 1200, streak_30: 1200, blocus_architect: 1200,
};
const EXPECTED_NEW_XP = {
  steamroller: 300, iron_month: 1200, metronome: 600, regular: 300, relentless: 600,
  in_the_zone: 300, exam_ready: 300, all_rounder: 300, study_buddy: 125, early_bird: 300,
};

function objectBlock(src, name) {
  const start = src.indexOf(`export const ${name} = {`);
  return src.slice(start, src.indexOf("\n};", start));
}
const rarity = Object.fromEntries([...objectBlock(artSrc, "BADGE_RARITY").matchAll(/^\s+([a-zA-Z0-9_]+): "([a-z]+)",/gm)].map((m) => [m[1], m[2]]));
const art = Object.fromEntries([...objectBlock(artSrc, "BADGE_ART").matchAll(/^\s+([a-zA-Z0-9_]+):\s+"([a-zA-Z]+)",/gm)].map((m) => [m[1], m[2]]));
const drawings = new Set([...objectBlock(artSrc, "ART").matchAll(/^ {2}([a-zA-Z]+): \[/gm)].map((m) => m[1]));
const sqlXp = Object.fromEntries([...sql.matchAll(/when '([a-z0-9_]+)'\s+then (\d+)/g)].map((m) => [m[1], Number(m[2])]));

test("catalogue : 30 badges, les 10 nouveaux, plus les 2 retirés", () => {
  assert.equal(CATALOG.length, 30);
  assert.equal(new Set(CATALOG).size, 30);
  for (const id of NEW) assert.ok(CATALOG.includes(id), id);
  for (const id of RETIRED) {
    for (const [name, src] of [["badges", badgesSrc], ["badgeArt", artSrc], ["badgeGroups", groupsSrc], ["i18n", i18n], ["sql", sql]]) {
      assert.doesNotMatch(src, new RegExp(`\\b${id}\\b`), `${id} in ${name}`);
    }
  }
  assert.doesNotMatch(badgesSrc, /computeEarnedBadgeIds|streak >=|totalHours >=/, "no local earning rule left on the client");
});

test("XP : palier client = table serveur ; aucun montant existant ne bouge", () => {
  for (const id of CATALOG) {
    assert.ok(rarity[id], `rarity ${id}`);
    assert.equal(sqlXp[id], TIER_XP[rarity[id]], `xp ${id}`);
  }
  for (const [id, xp] of Object.entries(PREVIOUS_XP)) assert.equal(sqlXp[id], xp, `unchanged ${id}`);
  for (const [id, xp] of Object.entries(EXPECTED_NEW_XP)) assert.equal(sqlXp[id], xp, `new ${id}`);
  assert.deepEqual(Object.keys(sqlXp).sort(), [...CATALOG].sort());
  assert.match(badgesSrc, /discovery: 50,[\s\S]*common: 125,[\s\S]*rare: 300,[\s\S]*epic: 600,[\s\S]*legendary: 1200,/);
});

test("dessin : chaque badge réutilise un objet existant, un seul groupe", () => {
  const expectedArt = { early_bird: "sunrise", metronome: "stopwatch", steamroller: "bolt", exam_ready: "paper", study_buddy: "people", iron_month: "crown", regular: "book", relentless: "gem" };
  for (const [id, drawing] of Object.entries(expectedArt)) assert.equal(art[id], drawing, id);
  for (const id of CATALOG) assert.ok(drawings.has(art[id]), `drawing for ${id}`);
  const grouped = [...groupsSrc.matchAll(/ids: \[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/"([a-z0-9_]+)"/g)].map((x) => x[1]));
  assert.deepEqual([...grouped].sort(), [...CATALOG].sort());
  assert.equal(new Set(grouped).size, grouped.length);
});

test("palette : plus d'ancien vert dans les dessins, la forêt vient des tokens", () => {
  assert.doesNotMatch(artSrc, /#14B885|#0A6B4E|#7BE9C4/i);
  assert.match(artSrc, /import \{ brand \} from "\.\/colorTokens\.cjs";/);
  assert.match(artSrc, /mint: {3}\{ light: brand\.border, mid: brand\.primary, deep: brand\.text \}/);
});

test("textes FR + EN pour chaque badge et chaque ancienne règle", () => {
  const count = (key) => (i18n.match(new RegExp(`"${key.replace(/\./g, "\\.")}":`, "g")) || []).length;
  for (const id of CATALOG) {
    assert.equal(count(`badge.${id}`), 2, `label ${id}`);
    assert.equal(count(`badge.${id}.desc`), 2, `desc ${id}`);
  }
  for (const key of Object.values(LEGACY_DESC_KEYS)) assert.equal(count(key), 2, key);
  assert.match(i18n, /"badge\.streak_3\.desc": +"Étudier 5 jours de suite\."/);
  assert.match(i18n, /"badge\.streak_3\.desc": +"Study 5 days in a row\."/);
  assert.match(i18n, /"badge\.marathon_day\.desc": +"Étudier 8 heures/);
});

test("ancienne règle : seulement pour un badge durci, gagné avant la bascule", () => {
  const from = Date.parse(BADGE_RULES_V84_FROM);
  assert.ok(Number.isFinite(from) && from >= Date.parse("2026-09-27T00:00:00Z"));
  const before = new Date(from - 60_000).toISOString();
  const after = new Date(from + 60_000).toISOString();
  const streak = { id: "streak_3", descKey: "badge.streak_3.desc" };
  assert.equal(badgeDescKey(streak, { earned: true, earnedAt: before }), "badge.streak_3.descLegacy");
  // Attribution rétroactive v84 : même instant que la bascule → règle actuelle.
  assert.equal(badgeDescKey(streak, { earned: true, earnedAt: BADGE_RULES_V84_FROM }), "badge.streak_3.desc");
  assert.equal(badgeDescKey(streak, { earned: true, earnedAt: after }), "badge.streak_3.desc");
  assert.equal(badgeDescKey(streak, { earned: false, earnedAt: before }), "badge.streak_3.desc");
  assert.equal(badgeDescKey(streak, { earned: true, earnedAt: null }), "badge.streak_3.desc");
  // Un badge dont la règle n'a pas changé n'a pas de version d'époque.
  assert.equal(earnedUnderLegacyRule("hours_10", before), false);
  assert.deepEqual(Object.keys(LEGACY_DESC_KEYS).sort(), ["blocus_architect", "marathon_day", "planner", "referrer", "strategist", "streak_3"]);
});

test("la collection lit aussi la date d'obtention", async () => {
  let selected = "";
  const db = {
    rpc: () => Promise.resolve({ data: ["streak_3"], error: null }),
    from: () => ({
      select: (columns) => {
        selected = columns;
        return { eq: () => Promise.resolve({ data: [{ badge_id: "streak_3", earned_at: "2026-09-01T10:00:00Z" }, { badge_id: "motivator", earned_at: "2026-06-01T10:00:00Z" }], error: null }) };
      },
    }),
  };
  const result = await fetchCanonicalBadges(db, "u", ["streak_3", "hours_10"]);
  assert.equal(selected, "badge_id, earned_at");
  assert.deepEqual(result.ids, ["streak_3"]);
  assert.equal(result.earnedAt.streak_3, "2026-09-01T10:00:00Z");
  assert.match(read("../components/BadgeSheet.js"), /t\(badgeDescKey\(badge, \{ earned, earnedAt \}\)\)/);
  assert.match(read("../pages/badges.js"), /earnedAt=\{selected \? earnedAt\[selected\.id\] : null\}/);
});

test("v84 en SQL : insertion seule, meilleure série, sources canoniques", () => {
  const award = sql.slice(sql.indexOf("function public.award_badges_for_user"), sql.indexOf("function public.gamification_badge_xp"));
  assert.match(award, /from unnest\(public\.badge_ids_for_user\(p_user_id\)\) as badge_id\s+on conflict \(user_id, badge_id\) do nothing;/);
  assert.doesNotMatch(sql, /delete from public\.user_badges|update public\.user_badges/);
  const rules = sql.slice(sql.indexOf("function public.badge_ids_for_user"), sql.indexOf("function public.award_badges_for_user"));
  assert.match(rules, /select s\.best_streak, s\.studied_days\s+into v_best_streak, v_studied_days\s+from public\.study_streaks\(p_user_id\) s;/);
  assert.match(rules, /public\.study_day_states\(p_user_id, v_first_day, v_last_day\)/);
  assert.doesNotMatch(rules, /current_streak|lifetime_reactions|community_messages/);
  for (const rule of [
    "v_best_streak >= 5 then v_badges := array_append(v_badges, 'streak_3')",
    "d.secs between 28800 and 57600",
    "d.secs between 21600 and 57600",
    "v_big_days >= 5",
    "coalesce((select max(n) from months), 0) >= 20",
    "join weeks c on c.w = a.w + 14",
    "v_studied_days >= 15", "v_studied_days >= 50",
    "duration_seconds between 1500 and 43200",
    "time '05:00'", "time '08:00'",
    "cd.local_date between e.exam_date - 14 and e.exam_date - 1",
    "secs >= 36000", "secs >= 18000",
    "v_verified_objectives >= 10", "v_verified_objectives >= 25", "v_verified_objectives >= 75",
    "o.done and o.target_minutes > 0",
    ">= 3600;",
    "v_active_referrals >= 5",
  ]) assert.ok(rules.includes(rule), rule);
  assert.match(sql, /revoke all on function public\.badge_ids_for_user\(uuid\) from public, anon, authenticated;/);
  assert.match(sql, /'Badge rules v84 in force since '/);
});
