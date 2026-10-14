import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createStudyHistoryDatabase, historyClient } from "./fixtures/study-history/database.mjs";
import { fetchStudySessions } from "../lib/studyHistory.mjs";
import { fetchStudyDays, secondsByDay } from "../lib/studyDays.mjs";
import { computeInsights } from "../lib/statsInsights.mjs";
import { courseBreakdown, buildTimeSeries } from "../lib/statsPeriod.js";
import { studyStreaks } from "../lib/studyDayStates.mjs";

const U = "10000000-0000-4000-8000-000000000001";
const OLD = "20000000-0000-4000-8000-000000000001";
const NEW = "20000000-0000-4000-8000-000000000002";
const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const lifetimeMigration = read("../supabase/migrations/20261013164455_preserve_lifetime_study_days.sql");
let db, client;
before(async () => { db = await createStudyHistoryDatabase(); client = historyClient(db); });
after(async () => db?.close());

async function snapshot() {
  const sessions = await fetchStudySessions(client, U);
  const days = await fetchStudyDays(client, U);
  assert.equal(sessions.error, null); assert.equal(days.error, null);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [U]);
  return {
    sessions: sessions.data,
    days: days.data,
    totals: {
      seconds: days.data.reduce((sum, row) => sum + Number(row.seconds), 0),
      insights: computeInsights(sessions.data, days.data),
      heatmap: secondsByDay(days.data),
      localStreak: studyStreaks({ rows: days.data, today: "2026-10-13" }),
      streak: (await db.query("select * from study_streaks($1,date '2026-10-13')", [U])).rows,
      xp: (await db.query("select * from get_gamification_levels(array[$1]::uuid[])", [U])).rows,
      badges: (await db.query("select * from user_badges where user_id=$1 order by badge_id", [U])).rows,
    },
  };
}

test("isolated PostgreSQL: archive → new semester → restore → permanent deletion preserves lifetime history", async () => {
  await db.query("insert into profiles(id) values($1)", [U]);
  await db.query("insert into courses values($1,$2,'Previous semester','#ec4899',null)", [OLD, U]);
  // 1,206 sessions, including ties spanning pagination and a longest session
  // after the first thousand. Multiple semesters, plus a captured midnight split.
  await db.query(`
    insert into sessions(id,user_id,course_id,started_at,ended_at,duration_seconds,timezone,timezone_source,day_parts_version)
    select md5('history-'||g)::uuid,$1,$2,
      date '2025-01-01' + (g / 4)::integer + time '10:00',
      date '2025-01-01' + (g / 4)::integer + time '10:00' + interval '25 minutes',
      1500,'Europe/Brussels','device',1
    from generate_series(1,1204) g
  `, [U, OLD]);
  await db.query(`
    insert into sessions values
      (md5('longest')::uuid,$1,$2,10800,'2026-10-11T08:00Z','2026-10-11T11:00Z','Europe/Brussels','device',1),
      (md5('midnight')::uuid,$1,$2,3600,'2026-10-11T21:30Z','2026-10-11T22:30Z','Europe/Brussels','device',1)
  `, [U, OLD]);
  await db.query("insert into objectives values(md5('objective')::uuid,$1,$2,true,25,'2025-01-02')", [U, OLD]);
  await db.query("insert into exams values(md5('exam')::uuid,$1,$2,'2025-01-04')", [U, OLD]);
  await db.query("select award_badges_for_user($1)", [U]);
  const oldUnpaged = await client.from("sessions").select("duration_seconds").eq("user_id", U);
  assert.equal(oldUnpaged.data.length, 1000, "the former query really truncates this account");
  assert.ok(oldUnpaged.data.reduce((sum,s) => sum + s.duration_seconds, 0) < 1204 * 1500 + 14400);
  const beforeArchive = await snapshot();
  assert.equal(beforeArchive.sessions.length, 1206);
  assert.equal(beforeArchive.totals.seconds, 1204 * 1500 + 14400);
  assert.equal(beforeArchive.totals.insights.longestSessionSecs, 10800);
  assert.equal(beforeArchive.totals.insights.sessionCount, 1206);
  assert.equal(beforeArchive.totals.insights.bestDaySecs, 12600);
  assert.equal(beforeArchive.totals.insights.bestWeekSecs, 42000);
  assert.equal(beforeArchive.totals.insights.bestMonthSecs, 186000);
  assert.equal(beforeArchive.days.length, 1207);
  assert.ok(beforeArchive.totals.badges.some(b => b.badge_id === "hours_250"));
  const range = { fromISO: "2025-01-01", toISO: "2026-10-13", days: 651 };
  const beforeChart = buildTimeSeries(beforeArchive.days, range, "en");

  await db.query("update courses set archived_at=now() where id=$1 and user_id=$2", [OLD, U]);
  await db.query("select award_badges_for_user($1)", [U]);
  assert.deepEqual((await snapshot()).totals, beforeArchive.totals);
  await db.query("insert into courses values($1,$2,'New semester','#2563eb',null)", [NEW, U]);
  const afterArchive = await snapshot();
  assert.deepEqual(afterArchive.totals, beforeArchive.totals);
  assert.deepEqual(afterArchive.sessions, beforeArchive.sessions);
  assert.deepEqual(afterArchive.days, beforeArchive.days);
  assert.deepEqual(buildTimeSeries(afterArchive.days, range, "en"), beforeChart);
  const courses = (await db.query("select * from courses where user_id=$1", [U])).rows;
  assert.deepEqual(courseBreakdown(afterArchive.days, courses, range).rows.map(r => [r.name,r.archived,r.secs]),
    [["Previous semester",true,beforeArchive.totals.seconds]]);
  assert.deepEqual((await db.query("select id from courses where archived_at is null")).rows.map(r => r.id), [NEW]);

  // Restore is an UPDATE of the same ID, repeatable without copies.
  for (let i=0;i<2;i++) await db.query("update courses set archived_at=null where id=$1 and user_id=$2", [OLD,U]);
  assert.equal((await db.query("select count(*)::int n from courses")).rows[0].n,2);
  assert.deepEqual((await snapshot()).totals,beforeArchive.totals);
  assert.equal(courseBreakdown(afterArchive.days,(await db.query("select * from courses")).rows,range).rows[0].archived,false);

  // A real new-semester session adds exactly its duration, never re-counts old rows.
  await db.query(`insert into sessions values(md5('new-semester')::uuid,$1,$2,1800,
    '2026-10-12T10:00Z','2026-10-12T10:30Z','Europe/Brussels','device',1)`,[U,NEW]);
  const beforeDelete=await snapshot();
  assert.equal(beforeDelete.totals.seconds,beforeArchive.totals.seconds+1800);
  assert.equal(beforeDelete.sessions.length,1207);
  await db.query("update courses set archived_at=now() where id=$1",[OLD]);
  await db.query("delete from courses where id=$1 and user_id=$2",[OLD,U]);
  await db.query("select award_badges_for_user($1)",[U]);
  const afterDelete=await snapshot();
  assert.deepEqual(afterDelete.totals,beforeDelete.totals);
  assert.equal(afterDelete.sessions.filter(s=>s.course_id===null).length,1206);
  assert.equal(afterDelete.days.filter(s=>s.course_id===null).length,1207);
  assert.deepEqual(courseBreakdown(afterDelete.days,(await db.query("select * from courses")).rows,range).rows.map(r=>[r.id,r.secs]),
    [["__none__",beforeArchive.totals.seconds],[NEW,1800]]);
  assert.equal((await db.query("select course_id from objectives")).rows[0].course_id,null);
  assert.equal((await db.query("select course_id from exams")).rows[0].course_id,null);
});

test("pagination: empty / exact boundary / >1,000 rows, deterministic ties and scoped filters", async () => {
  for (const count of [0,500,1000,1501]) {
    const calls=[];
    const fake={from(table){
      assert.equal(table,"sessions");
      const q={select(columns){assert.equal(columns,"duration_seconds");return q;},
        eq(key,value){assert.deepEqual([key,value],["user_id",U]);return q;},
        gte(key,value){assert.deepEqual([key,value],["started_at","2026-01-01"]);return q;},
        order(key,options){calls.push([key,options.ascending]);return q;},
        range(from,to){calls.push([from,to]);return Promise.resolve({data:Array.from({length:Math.max(0,Math.min(500,count-from))},(_,i)=>({id:from+i})),error:null});}};
      return q;
    }};
    const res=await fetchStudySessions(fake,U,{columns:"duration_seconds",fromISO:"2026-01-01"});
    assert.equal(res.data.length,count); assert.equal(res.error,null);
    assert.equal(new Set(res.data.map(r=>r.id)).size,count);
    assert.deepEqual(calls.slice(0,3),[["started_at",true],["id",true],[0,499]]);
    assert.equal(calls.length/3,Math.floor(count/500)+1);
  }
});

test("second-page failure returns an error, never a partial successful history", async () => {
  const error={message:"network unavailable"};
  const q={select(){return q;},eq(){return q;},order(){return q;},
    range(from){return Promise.resolve(from===0?{data:Array(500).fill({}),error:null}:{data:null,error});}};
  assert.deepEqual(await fetchStudySessions({from:()=>q},U),{data:null,error});
});

test("legacy XP fallback can page multiple users without dropping the user filter", async () => {
  const ids=[U,"10000000-0000-4000-8000-000000000002"];
  const q={select(){return q;},in(key,values){assert.equal(key,"user_id");assert.deepEqual(values,ids);return q;},
    order(){return q;},range(){return Promise.resolve({data:[],error:null});}};
  assert.deepEqual(await fetchStudySessions({from:()=>q},ids),{data:[],error:null});
});

test("lifetime >10 years: reproduce the server cutoff, fix locally and retain private/idempotent function", async () => {
  const oldAccount="10000000-0000-4000-8000-000000000003";
  await db.query("insert into profiles(id) values($1)",[oldAccount]);
  await db.query(`insert into sessions values
    (md5('ancient')::uuid,$1,null,600,'2010-01-01T10:00Z','2010-01-01T10:10Z',null,null,null),
    (md5('recent-1')::uuid,$1,null,600,'2026-10-11T10:00Z','2026-10-11T10:10Z','Europe/Brussels','device',1),
    (md5('recent-2')::uuid,$1,null,600,'2026-10-12T10:00Z','2026-10-12T10:10Z','Europe/Brussels','device',1)`,[oldAccount]);
  assert.deepEqual((await db.query("select * from study_streaks($1,date '2026-10-13')",[oldAccount])).rows,
    [{current_streak:0,best_streak:0,studied_days:0}], "confirmed pre-fix failure");
  const unchanged=await snapshot();
  await db.exec(lifetimeMigration);
  assert.deepEqual((await db.query("select * from study_streaks($1,date '2026-10-13')",[oldAccount])).rows,
    [{current_streak:2,best_streak:2,studied_days:3}]);
  assert.deepEqual((await snapshot()).totals,unchanged.totals,"normal semester data and XP stay identical");
  const definition=(await db.query("select pg_get_functiondef('study_day_states(uuid,date,date,date)'::regprocedure) d")).rows[0].d;
  await db.exec(lifetimeMigration);
  assert.equal((await db.query("select pg_get_functiondef('study_day_states(uuid,date,date,date)'::regprocedure) d")).rows[0].d,definition);
  for (const role of ["anon","authenticated"]) {
    assert.equal((await db.query("select has_function_privilege($1,'study_day_states(uuid,date,date,date)','execute') allowed",[role])).rows[0].allowed,false);
  }
  assert.equal((await db.query("select count(*)::int n from study_day_states($1,date '2026-10-13',date '2026-10-12')",[oldAccount])).rows[0].n,0);
  assert.equal((await db.query("select count(*)::int n from study_day_states($1,date '-infinity',date '2026-10-12')",[oldAccount])).rows[0].n,0);
});

test("all historical consumers use complete reads; ordinary removal archives, permanent delete is explicit", () => {
  for(const page of ["stats","profile","planning","dashboard"]){
    assert.match(read(`../pages/${page}.js`),/fetchStudySessions\(\s*supabase, user\.id/,page);
  }
  const setup=read("../components/auth/useCourseSetup.js");
  assert.doesNotMatch(setup,/from\("courses"\)\.delete\(/);
  assert.match(setup,/update\(\{ archived_at: new Date\(\)\.toISOString\(\) \}\)/);
  const dashboard=read("../pages/dashboard.js").split("async function deleteCourse(id)")[1].split("// ── Session")[0];
  assert.match(dashboard,/update\(\{ archived_at: archivedAt \}\)/);
  assert.doesNotMatch(dashboard,/\.delete\(/);
  const stats=read("../pages/stats.js");
  assert.match(stats,/select\("id, name, color, archived_at"\)/);
  assert.match(stats,/if \(error \|\| !data\) \{ toast\(t\("courseEditor.restoreError"\)/);
  assert.match(read("../pages/historique.js"), /useSessionHistory\(user\?\.id, filterCourse\)/);
  assert.match(read("../hooks/useSessionHistory.js"),/order\("started_at", \{ ascending: false \}\)\s*\.order\("id", \{ ascending: false \}\)/);
  for(const key of ["stats.archivedDeleteKept","stats.archivedDeleteTitle","courseEditor.archiveConfirmHelp"]){
    assert.equal((read("../lib/i18n.js").match(new RegExp(`"${key}":`,"g"))||[]).length,2,key);
  }
});
