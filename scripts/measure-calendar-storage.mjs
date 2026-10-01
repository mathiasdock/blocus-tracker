// Local-only PostgreSQL measurement. No env, hosted client, credentials or network.
// Usage: node scripts/measure-calendar-storage.mjs [--quick]
import { readFileSync } from 'node:fs';
import { createCalendarDatabase } from '../tests/fixtures/calendars/database.mjs';
import { parseCalendar } from '../lib/server/calendarParser.mjs';

const today = new Date().toISOString().slice(0, 10);
const stamp = offset => new Date(Date.parse(today) + offset * 86400000).toISOString().slice(0, 10).replaceAll('-', '');
const base = readFileSync(new URL('../tests/fixtures/calendars/canvas.ics', import.meta.url), 'utf8');
const fixture = base.replace(/202610\d{2}/g, stamp(10)).replace(/20260928/g, stamp(0));
const subjects = ['Advertising','Economics','Statistics','Consumer Behaviour','Marketing'];
const titles = ['Reading response and seminar preparation', 'Group campaign brief', 'Weekly problem set', 'Case study discussion', 'Research proposal', 'Chapter review'];
const pieces = [];
for (let i = 2; i < 300; i++) {
  const course = 42 + i % 5;
  const allDay = i % 10 === 0;
  pieces.push(`BEGIN:VEVENT
UID:event-assignment-${100000 + i}
DTSTAMP:${stamp(0)}T120000Z
DTSTART${allDay ? ';VALUE=DATE' : ''}:${stamp(i % 330 - 20)}${allDay ? '' : 'T235900Z'}
SUMMARY:${titles[i % titles.length]} ${i + 1} [${subjects[i % 5].slice(0, 3).toUpperCase()} ${3000 + i % 5}]
${i % 5 ? `DESCRIPTION:Prepare ${subjects[i % 5].toLowerCase()} coursework ${i + 1}. Read the assigned chapter and submit your response before the class discussion. Include sources and bring your notes.\n` : ''}URL:https://canvas.example.edu/calendar?include_contexts=course_${course}&month=10&year=2026#assignment_${100000 + i}
END:VEVENT`);
}
const rows = [...parseCalendar(fixture, { provider: 'canvas' }), ...parseCalendar(`BEGIN:VCALENDAR\nVERSION:2.0\n${pieces.join('\n')}\nEND:VCALENDAR`, { provider: 'canvas' })];
const tables = ['external_calendar_sources', 'external_calendar_secrets', 'external_academic_events', 'external_calendar_course_map'];
const scenarios = process.argv.includes('--quick') ? [[100,100]] : [[100,100],[100,300],[1000,100],[1000,300]];
const report = { generated_at: new Date().toISOString(), units: 'bytes; MB = 1,000,000 bytes', methodology: 'PGlite PostgreSQL, actual migration, one source and five mapped courses per user, varied Canvas-style rows parsed by production parser. All four new relations plus the extra courses ownership index. Ordinary VACUUM, never VACUUM FULL. Excludes existing auth/course tables, WAL and other app data.', scenarios: [] };
for (const [users, events] of scenarios) {
  const db = await createCalendarDatabase();
  try {
    report.postgres = (await db.query('select version() v')).rows[0].v;
    await db.exec(`
      create temporary table sample_users as select n, md5('calendar-user-'||n)::uuid user_id, md5('calendar-source-'||n)::uuid source_id from generate_series(1,${users}) n;
      insert into auth.users select user_id from sample_users;
      insert into profiles(id) select user_id from sample_users;
      insert into courses(id,user_id,name) select md5(u.n||'-course-'||c)::uuid,user_id,'Course '||c from sample_users u cross join generate_series(42,46) c;
      insert into external_calendar_sources(id,user_id,provider,display_name) select source_id,user_id,'canvas','University calendar' from sample_users;
      insert into external_calendar_secrets(source_id,feed_url) select source_id,'https://canvas.example.edu/feeds/calendars/user_'||md5(source_id::text)||'.ics' from sample_users;
      insert into external_calendar_course_map(user_id,source_id,external_course_key,external_course_label,local_course_id)
        select user_id,source_id,'canvas:course:'||c,'Course '||c,md5(u.n||'-course-'||c)::uuid from sample_users u cross join generate_series(42,46) c;
    `);
    const selected = rows.slice(0, events);
    const columns = Object.keys(selected[0]);
    await db.query(`insert into external_academic_events(source_id,${columns.join(',')})
      select u.source_id,${columns.map(k => 'e.'+k).join(',')}
      from sample_users u cross join jsonb_populate_recordset(null::external_academic_events, $1::jsonb) e order by u.n`, [JSON.stringify(selected)]);
    const measure = async () => {
      const relations = [];
      for (const table of tables) {
        const { rows: [sizes] } = await db.query('select pg_table_size($1::regclass)::float8 table_bytes, pg_indexes_size($1::regclass)::float8 index_bytes, pg_total_relation_size($1::regclass)::float8 total_bytes', [table]);
        relations.push({ table, ...sizes });
      }
      const extraCourseIndex = (await db.query("select pg_relation_size('courses_id_user_calendar_unique')::float8 bytes")).rows[0].bytes;
      const total = relations.reduce((sum, row) => sum + row.total_bytes, extraCourseIndex);
      return { relations, course_ownership_index_bytes: extraCourseIndex, total_bytes: total, total_MB: +(total / 1e6).toFixed(2) };
    };
    await db.exec('vacuum analyze external_academic_events');
    const initial = await measure();
    const rowSize = (await db.query('select round(avg(pg_column_size(e)),1)::float8 average_row_bytes, count(*)::int event_count from external_academic_events e')).rows[0];
    // Three 10% edit rounds, with ordinary vacuum between rounds. Different
    // columns each time; no synthetic last_seen writes on unchanged records.
    for (let round = 0; round < 3; round++) {
      await db.exec(`update external_academic_events set raw_title=left(raw_title,140)||' revised',updated_at=now()
        where external_uid like '%${round}'`);
      await db.exec('vacuum analyze external_academic_events');
    }
    const afterEdits = await measure();
    report.scenarios.push({ users, events_per_user: events, ...rowSize, initial, after_three_10_percent_edit_rounds: afterEdits });
    console.error(`Measured ${users} × ${events}: ${initial.total_MB} MB, after edits ${afterEdits.total_MB} MB`);
  } finally { await db.close(); }
}
console.log(JSON.stringify(report, null, 2));
