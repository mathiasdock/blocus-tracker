import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { createCalendarDatabase } from './fixtures/calendars/database.mjs';
import { parseCalendar, MAX_EVENTS, MAX_COMPONENTS, FIELD_BYTES } from '../lib/server/calendarParser.mjs';
import { CalendarError, validateFeedUrl, publicAddress, fetchCalendarFeed, MAX_FEED_BYTES } from '../lib/server/calendarFeed.mjs';
import { syncCalendar, createCalendarHandler } from '../lib/server/calendarSync.mjs';

const fixture = readFileSync(new URL('./fixtures/calendars/canvas.ics', import.meta.url), 'utf8');
const feedUrl = 'https://canvas.example.edu/feeds/calendars/user_secret1234567890.ics';
const userA = '00000000-0000-0000-0000-000000000001';
const userB = '00000000-0000-0000-0000-000000000002';
const courseA = '00000000-0000-0000-0000-000000000011';
const courseB = '00000000-0000-0000-0000-000000000012';
const calendar = body => `BEGIN:VCALENDAR\nVERSION:2.0\n${body}\nEND:VCALENDAR`;
const event = (body = '') => `BEGIN:VEVENT\nUID:sample\n${body}\nEND:VEVENT`;
const parse = input => parseCalendar(input, { provider: 'canvas', feedUrl, now: new Date('2026-10-01T12:00:00Z') });
const eventIdentity = row => JSON.stringify([row.source_id, row.external_uid, row.recurrence_id]);
// Move the synthetic feed with the real SQL clock for repeatable retention tests.
const today = new Date().toISOString().slice(0, 10);
const fixtureOffset = Date.parse(today) - Date.parse('2026-10-01');
const moveFixtureDate = text => text.replace(/2026(\d{2})(\d{2})/g, (_, month, day) => new Date(Date.parse(`2026-${month}-${day}`) + fixtureOffset).toISOString().slice(0, 10).replaceAll('-', ''));
let db;

before(async () => {
  db = await createCalendarDatabase();
});
after(async () => db?.close());
beforeEach(async () => {
  await db.exec(`reset role; truncate auth.users cascade;
    insert into auth.users values ('${userA}'), ('${userB}');
    insert into profiles(id) values ('${userA}'), ('${userB}');
    insert into courses values ('${courseA}','${userA}','Principles of Advertising'), ('${courseB}','${userB}','ADV 3001');`);
});

async function asUser(user, sql, params = []) {
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
}
const admin = {
  async rpc(name, args) {
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
    await db.exec('set role service_role');
    try {
      const entries = Object.entries(args);
      const result = await db.query(`select public.${name}(${entries.map(([key], i) => `${key} => $${i + 1}`).join(',')}) as result`, entries.map(([, v]) => Array.isArray(v) ? JSON.stringify(v) : v));
      return { data: result.rows[0].result, error: null };
    } catch (error) { return { data: null, error }; }
    finally { await db.exec('reset role'); }
  },
};
async function connect(user = userA) {
  const result = await admin.rpc('connect_external_calendar', { p_user_id: user, p_provider: 'canvas', p_display_name: 'University', p_feed_url: feedUrl });
  assert.equal(result.error, null);
  return result.data;
}
async function sync(id, text = fixture, user = userA) {
  await db.query("update external_calendar_sources set last_attempted_at = now() - interval '6 minutes' where id = $1", [id]);
  return syncCalendar(admin, user, id, async () => ({ text: moveFixtureDate(text), etag: '"v1"' }));
}
async function events(id) { return (await db.query('select * from external_academic_events where source_id = $1 order by external_uid', [id])).rows; }

// Tests below execute the real migration/RLS and the production sync path.
test('initial import, repeat sync and modified event keep IDs without touching local courses', async () => {
  const id = await connect();
  assert.equal((await sync(id)).event_count, 2);
  const initial = await events(id);
  assert.equal(initial[0].external_course_key, 'canvas:course:42');
  assert.equal(initial[0].external_course_label, 'ADV 3001');
  assert.equal(initial[0].description_excerpt, 'Read chapter 1, then write a brief. Bring notes; discuss in class.');
  await sync(id);
  assert.deepEqual((await events(id)).map(eventIdentity), initial.map(eventIdentity));
  await sync(id, fixture.replace('Campaign brief', 'Updated brief').replace('20261010T235900', '20261011T235900'));
  const updated = await events(id);
  assert.equal(eventIdentity(updated[0]), eventIdentity(initial[0]));
  assert.equal(updated[0].raw_title, 'Updated brief [ADV 3001]');
  assert.equal(updated[0].starts_at.toISOString(), new Date(Date.parse('2026-10-11T23:59:00Z') + fixtureOffset).toISOString());
  assert.equal((await db.query('select count(*)::int n from external_calendar_course_map')).rows[0].n, 0);
  assert.equal((await db.query('select name from courses where id=$1', [courseA])).rows[0].name, 'Principles of Advertising');
});

test('missing and cancelled events are deleted immediately; returning events restored', async () => {
  const id = await connect(); await sync(id);
  await sync(id, calendar(event('DTSTART:20261001T140000Z\nSTATUS:CANCELLED')));
  const rows = await events(id);
  assert.equal(rows.length, 0);
  await sync(id);
  assert.equal((await events(id)).filter(e => e.status === 'active').length, 2);
  await sync(id, calendar(''));
  assert.equal((await events(id)).length, 0);
});

test('same UID remains separate across two sources and two users', async () => {
  const first = await connect(); const second = await connect(userB);
  await sync(first); await sync(second, fixture, userB);
  assert.equal((await events(first)).length, 2); assert.equal((await events(second)).length, 2);
  assert.notEqual(eventIdentity((await events(first))[0]), eventIdentity((await events(second))[0]));
  const visible = await asUser(userA, 'select * from external_academic_events');
  assert.equal(visible.rows.length, 2);
  assert.ok(visible.rows.every(e => e.source_id === first));
});

test('mapping belongs only to its owner and cannot target another user course/source', async () => {
  const sourceA = await connect(); const sourceB = await connect(userB);
  const insert = 'insert into external_calendar_course_map(user_id,source_id,external_course_key,external_course_label,local_course_id) values ($1,$2,$3,$4,$5)';
  await asUser(userA, insert, [userA, sourceA, 'canvas:course:42', 'ADV 3001', courseA]);
  assert.equal((await asUser(userB, 'select * from external_calendar_course_map')).rows.length, 0);
  assert.equal((await asUser(userB, 'delete from external_calendar_course_map returning *')).rows.length, 0);
  assert.equal((await asUser(userB, 'update external_calendar_course_map set external_course_label=$1 returning *', ['stolen'])).rows.length, 0);
  await assert.rejects(asUser(userA, insert, [userA, sourceA, 'other', 'other', courseB]), /foreign key/);
  await assert.rejects(asUser(userA, insert, [userA, sourceB, 'other', 'other', courseA]), /foreign key/);
  await assert.rejects(asUser(userA, insert, [userB, sourceB, 'other', 'other', courseB]), /row-level security/);
  await assert.rejects(asUser(userA, 'update external_calendar_course_map set user_id=$1', [userB]), /row-level security/);
});

test('clients including owner cannot read secrets or invoke sync RPCs; disconnect cascades', async () => {
  const id = await connect(); await sync(id);
  for (const user of [userA, userB]) {
    await assert.rejects(asUser(user, 'select * from external_calendar_secrets'), /permission denied/);
    await assert.rejects(asUser(user, 'select begin_external_calendar_sync($1,$2)', [user, id]), /permission denied/);
    await assert.rejects(asUser(user, 'select connect_external_calendar($1,$2,$3,$4)', [user, 'ical', 'x', feedUrl]), /permission denied/);
    await assert.rejects(asUser(user, 'select finish_external_calendar_sync($1,$2,$3,$4)', [user, id, id, '[]']), /permission denied/);
  }
  await db.exec('set role anon');
  try { await assert.rejects(db.query('select * from external_calendar_secrets'), /permission denied/); }
  finally { await db.exec('reset role'); }
  const owned = (await asUser(userA, 'select * from external_calendar_sources')).rows;
  assert.equal(owned.length, 1); assert.ok(!JSON.stringify(owned).includes(feedUrl));
  assert.equal((await asUser(userB, 'select * from external_calendar_sources')).rows.length, 0);
  assert.equal((await asUser(userB, 'delete from external_calendar_sources returning *')).rows.length, 0);
  await asUser(userA, 'insert into external_calendar_course_map(user_id,source_id,external_course_key,local_course_id) values ($1,$2,$3,$4)', [userA, id, 'canvas:course:42', courseA]);
  await asUser(userA, 'delete from external_calendar_sources where id=$1', [id]);
  for (const table of ['external_calendar_secrets', 'external_academic_events', 'external_calendar_course_map']) assert.equal((await db.query(`select * from ${table}`)).rows.length, 0);
});

test('manual sync checks owner, throttles persistently, and rejects stale completion', async () => {
  const id = await connect();
  await assert.rejects(syncCalendar(admin, userB, id, () => assert.fail('must not fetch')), /calendar_not_found/);
  await sync(id);
  await assert.rejects(syncCalendar(admin, userA, id, () => assert.fail('must not fetch')), /calendar_sync_cooldown/);
  const stale = await admin.rpc('finish_external_calendar_sync', { p_user_id: userA, p_source_id: id, p_token: id, p_events: [] });
  assert.equal(stale.error.code, 'P0002');
  assert.equal((await events(id)).length, 2);
});

test('malformed snapshot or failed transaction preserves events and last successful sync', async () => {
  const id = await connect(); await sync(id);
  const initial = await events(id);
  const stamp = (await db.query('select last_synced_at from external_calendar_sources where id=$1', [id])).rows[0].last_synced_at;
  await assert.rejects(sync(id, '<html>Login</html>'), /invalid_calendar_feed/);
  assert.deepEqual(await events(id), initial);
  const source = (await db.query('select * from external_calendar_sources where id=$1', [id])).rows[0];
  assert.deepEqual(source.last_synced_at, stamp); assert.equal(source.sync_error, 'invalid_calendar_feed');
  await db.query("update external_calendar_sources set last_attempted_at=null where id=$1", [id]);
  const lease = await admin.rpc('begin_external_calendar_sync', { p_user_id: userA, p_source_id: id });
  const bad = await admin.rpc('finish_external_calendar_sync', { p_user_id: userA, p_source_id: id, p_token: lease.data.token, p_events: [{ ...parse(fixture)[0], status: 'invalid' }] });
  assert.ok(bad.error); assert.deepEqual(await events(id), initial);
});

test('304 retains snapshot and validators with no parsing or duplicate rows', async () => {
  const id = await connect(); await sync(id);
  const initial = await events(id);
  await db.query('update external_calendar_sources set last_attempted_at=null where id=$1', [id]);
  const result = await syncCalendar(admin, userA, id, async (url, validators) => {
    assert.equal(url, feedUrl); assert.equal(validators.etag, '"v1"'); return { notModified: true };
  });
  assert.equal(result.not_modified, true);
  assert.deepEqual((await events(id)).map(eventIdentity), initial.map(eventIdentity));
});

test('UTC, IANA DST, all-day, due and floating times preserve semantics', () => {
  const row = parse(calendar(event('DTSTART;TZID=America/New_York:20261001T100000\nDTEND;TZID=America/New_York:20261001T110000')))[0];
  assert.equal(row.starts_at, '2026-10-01T14:00:00.000Z');
  assert.equal(row.ends_at, undefined);
  assert.equal(parse(calendar(event('DTSTART;TZID=America/New_York:20261101T013000')))[0].starts_at, '2026-11-01T05:30:00.000Z');
  const allDay = parse(calendar(event('DTSTART;VALUE=DATE:20261001\nDTEND;VALUE=DATE:20261003')))[0];
  assert.equal(allDay.all_day, true); assert.equal(allDay.starts_at, null); assert.equal(allDay.event_date, '2026-10-01');
  const due = parse(calendar(event('DUE:20261001T140000Z')))[0]; assert.equal(due.due_at, '2026-10-01T14:00:00.000Z');
  const floating = parse(calendar(event('DTSTART:20261001T100000')))[0];
  assert.equal(floating.starts_at, null); assert.equal(floating.floating_at, '2026-10-01T10:00:00');
});

test('embedded VTIMEZONE and recurrence overrides are retained without expanding rules', () => {
  const zone = 'BEGIN:VTIMEZONE\nTZID:Custom/East\nBEGIN:STANDARD\nDTSTART:19700101T000000\nTZOFFSETFROM:+0200\nTZOFFSETTO:+0200\nEND:STANDARD\nEND:VTIMEZONE';
  const row = parse(calendar(`${zone}\n${event('DTSTART;TZID=Custom/East:20261001T100000')}`))[0];
  assert.equal(row.starts_at, '2026-10-01T08:00:00.000Z');
  const rows = parse(calendar(`${event('DTSTART:20261001T140000Z\nRRULE:FREQ=WEEKLY;COUNT=3')}\n${event('RECURRENCE-ID:20261008T140000Z\nDTSTART:20261008T150000Z')}`));
  assert.equal(rows.length, 2); assert.notEqual(rows[0].recurrence_id, rows[1].recurrence_id);
  assert.equal(rows[0].is_recurring, true);
});

test('course evidence is preserved; ambiguous titles/categories never become course identity', () => {
  const row = parse(calendar(event('DTSTART:20261001T140000Z\nSUMMARY:Exam ADV 3001 [ADV 3001]\nCATEGORIES:ADV 3001\nLOCATION:ADV 3001\nX-COURSE-ID:42')))[0];
  assert.equal(row.external_course_key, null); assert.match(row.course_hint, /ADV 3001/);
  assert.match(row.course_hint, /x-course-id:42/);
  const path = parse(fixture.replace('/calendar?include_contexts=course_42&month=10&year=2026', '/courses/42/assignments/101'))[0];
  assert.equal(path.external_course_key, 'canvas:course:42');
  assert.equal(parse(fixture.replace('course_42', 'course_42,course_43'))[0].external_course_key, null);
  assert.equal(parseCalendar(fixture, { provider: 'moodle' })[0].external_course_key, null);
});

test('bad dates, timezones, oversized records, partial and malformed calendars fail safely', () => {
  for (const input of [
    '', '<html>login</html>', fixture.slice(0, -20), fixture.replace('END:VEVENT', ''),
    calendar(event('DTSTART:20260230T140000Z')), calendar(event('DTSTART;TZID=Unknown/Zone:20261001T100000')),
    calendar(event('DTSTART;TZID=America/New_York:20260308T023000')), calendar(event('SUMMARY:no date')),
    calendar(event('DTSTART:20261001T140000Z\nUID:' + 'a'.repeat(256))).replace('UID:sample\n', ''),
    fixture.replace('METHOD:PUBLISH', 'METHOD:CANCEL'), fixture.replace('UID:event-assignment-101', 'SUMMARY:no uid'),
  ]) assert.throws(() => parse(input), /invalid_calendar_feed/);
});

test('feed secrets reflected by upstream never enter normalized payloads', () => {
  const rows = parse(calendar(event(`DTSTART:20261001T140000Z\nDESCRIPTION:${feedUrl}\nURL:${feedUrl}`)));
  assert.ok(!JSON.stringify(rows).includes(feedUrl));
  assert.ok(!JSON.stringify(rows).includes('user_secret1234567890'));
});

test('SSRF URL and IP restrictions cover IPv4, IPv6 and mapped addresses', async () => {
  for (const url of ['http://example.com/feed', 'https://user:pass@example.com', 'https://example.com:8443', 'file:///tmp/feed']) assert.throws(() => validateFeedUrl(url), /invalid_calendar_url/);
  assert.equal(validateFeedUrl('webcal://example.com/feed').protocol, 'https:');
  for (const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','100.64.0.1','0.0.0.0','::1','fc00::1','fe80::1','::ffff:127.0.0.1','2001:db8::1']) assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress('1.1.1.1'), true);
  await assert.rejects(fetchCalendarFeed(feedUrl, {}, { resolve: async () => [{ address: '127.0.0.1', family: 4 }], request: () => assert.fail('private address requested') }), /unsafe_calendar_host/);
});

function fakeNetwork(status, chunks, headers = {}) {
  return { resolve: async () => [{ address: '1.1.1.1', family: 4 }], request: (url, options, callback) => {
    assert.equal(url.href, feedUrl); assert.equal(options.agent, false);
    options.lookup('ignored', {}, (error, address) => { assert.equal(error, null); assert.equal(address, '1.1.1.1'); });
    const request = new EventEmitter();
    request.end = () => { const response = Readable.from(chunks.map(c => Buffer.from(c))); response.statusCode = status; response.headers = headers; callback(response); };
    return request;
  } };
}
test('fetch uses bounded calendar text and refuses redirects/errors/oversized responses', async () => {
  assert.equal((await fetchCalendarFeed(feedUrl, {}, fakeNetwork(200, [fixture]))).text, fixture);
  for (const status of [301,302,401,500]) await assert.rejects(fetchCalendarFeed(feedUrl, {}, fakeNetwork(status, ['private response'])), /calendar_fetch_failed/);
  await assert.rejects(fetchCalendarFeed(feedUrl, {}, fakeNetwork(200, ['a'.repeat(MAX_FEED_BYTES + 1)])), /calendar_too_large/);
  await assert.rejects(fetchCalendarFeed(feedUrl, {}, fakeNetwork(200, [], { 'content-encoding': 'gzip' })), /unsupported_calendar_encoding/);
});

test('API strips raw errors and ignores supplied user identity on connection', async () => {
  let captured;
  const handler = createCalendarHandler({
    authenticate: async () => ({ userId: userA, admin: { rpc: async (name, args) => { captured = args; return { error: { message: feedUrl, code: 'XX000' } }; } } }),
    setHeaders: res => res.setHeader('Cache-Control', 'no-store'), rateLimit: () => ({ ok: true }), getIp: () => 'test',
  });
  const res = { headers: {}, setHeader(k,v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ method: 'POST', headers: { 'content-type': 'application/json' }, body: { action: 'connect', user_id: userB, provider: 'canvas', display_name: 'School', feed_url: feedUrl } }, res);
  assert.equal(captured.p_user_id, userA); assert.equal(res.code, 502); assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.ok(!JSON.stringify(res).includes(feedUrl));
  const denied = createCalendarHandler({ authenticate: async () => { throw new CalendarError('unauthorized', 401); }, setHeaders: () => {}, rateLimit: () => ({ ok: true }), getIp: () => 'test' });
  await denied({ method: 'GET', headers: {} }, res); assert.equal(res.code, 401);
});

test('source cap is enforced in the DB and account deletion erases all calendar data', async () => {
  const id = await connect(); await connect(); await connect(); await sync(id);
  const fourth = await admin.rpc('connect_external_calendar', { p_user_id: userA, p_provider: 'ical', p_display_name: 'Extra', p_feed_url: feedUrl });
  assert.equal(fourth.error.code, 'P0001');
  await db.query('delete from auth.users where id=$1', [userA]);
  for (const table of ['external_calendar_sources', 'external_calendar_secrets', 'external_academic_events', 'external_calendar_course_map']) assert.equal((await db.query(`select * from ${table}`)).rows.length, 0);
});

test('failure messages stay fixed and a disconnect during fetch cannot resurrect imports', async () => {
  const id = await connect();
  await assert.rejects(syncCalendar(admin, userA, id, async () => { throw new Error(feedUrl); }), error => error.message === 'calendar_sync_failed');
  assert.equal((await db.query('select sync_error from external_calendar_sources where id=$1', [id])).rows[0].sync_error, 'calendar_sync_failed');
  await db.query('update external_calendar_sources set last_attempted_at=null where id=$1', [id]);
  await assert.rejects(syncCalendar(admin, userA, id, async () => {
    await asUser(userA, 'delete from external_calendar_sources where id=$1', [id]);
    return { text: fixture };
  }), /calendar_sync_failed/);
  assert.equal((await events(id)).length, 0);
});

test('lease recovery remains bounded without retaining tombstones', async () => {
  const id = await connect(); await sync(id);
  await sync(id, calendar(''));
  await sync(id, calendar('')); assert.equal((await events(id)).length, 0);
  await db.query('update external_calendar_sources set last_attempted_at=null where id=$1', [id]);
  const first = await admin.rpc('begin_external_calendar_sync', { p_user_id: userA, p_source_id: id });
  await db.query("update external_calendar_sources set last_attempted_at=now()-interval '6 minutes' where id=$1", [id]);
  const second = await admin.rpc('begin_external_calendar_sync', { p_user_id: userA, p_source_id: id });
  assert.notEqual(first.data.token, second.data.token);
  const stale = await admin.rpc('finish_external_calendar_sync', { p_user_id: userA, p_source_id: id, p_token: first.data.token, p_events: parse(fixture) });
  assert.equal(stale.error.code, 'P0002'); assert.equal((await events(id)).length, 0);
});

test('duplicate revisions select newest sequence and provider timestamp within a snapshot', () => {
  const rows = parse(calendar([
    event('DTSTART:20261001T140000Z\nSUMMARY:Newest\nSEQUENCE:2\nDTSTAMP:20261001T120000Z'),
    event('DTSTART:20261001T140000Z\nSUMMARY:Old\nSEQUENCE:1\nDTSTAMP:20261001T130000Z'),
    event('DTSTART:20261001T140000Z\nSUMMARY:Earlier\nSEQUENCE:2\nDTSTAMP:20261001T110000Z'),
  ].join('\n')));
  assert.equal(rows.length, 1); assert.equal(rows[0].raw_title, 'Newest');
});

test('schema access review: RLS on every table, no definer functions or browser secret privileges', async () => {
  const tables = await db.query("select relname, relrowsecurity from pg_class where relname in ('external_calendar_sources','external_calendar_secrets','external_academic_events','external_calendar_course_map')");
  assert.equal(tables.rows.length, 4); assert.ok(tables.rows.every(row => row.relrowsecurity));
  const functions = await db.query("select proname, prosecdef, proconfig from pg_proc where proname in ('connect_external_calendar','begin_external_calendar_sync','finish_external_calendar_sync','touch_calendar_map')");
  assert.equal(functions.rows.length, 4);
  assert.ok(functions.rows.every(row => !row.prosecdef && row.proconfig.some(c => c.startsWith('search_path='))));
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await db.query("select has_table_privilege($1,'external_calendar_secrets','SELECT') as allowed", [role])).rows[0].allowed, false);
  }
});

test('existing suspension boundary blocks client mappings and service-backed connection/sync', async () => {
  const id = await connect();
  await db.query('update profiles set locked=true where id=$1', [userA]);
  await assert.rejects(asUser(userA, 'insert into external_calendar_course_map(user_id,source_id,external_course_key,local_course_id) values ($1,$2,$3,$4)', [userA,id,'key',courseA]), /Account suspended/);
  await assert.rejects(syncCalendar(admin, userA, id, () => assert.fail('suspended fetch')), /calendar_account_suspended/);
  const connection = await admin.rpc('connect_external_calendar', { p_user_id: userA, p_provider: 'ical', p_display_name: 'School', p_feed_url: feedUrl });
  assert.equal(connection.error.code, '42501');
});

test('retention includes only the 45-day past / 365-day future UTC window', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  const day = offset => new Date(Date.parse('2026-10-01') + offset * 86400000).toISOString().slice(0, 10).replaceAll('-', '');
  const input = calendar([-46, -45, 0, 365, 366].map(offset => event(`DTSTART;VALUE=DATE:${day(offset)}`).replace('UID:sample', `UID:offset-${offset}`)).join('\n'));
  assert.deepEqual(parseCalendar(input, { now }).map(row => row.external_uid), ['offset--45', 'offset-0', 'offset-365']);
});

test('excerpts and labels are UTF-8 bounded plain text; large optional URLs are discarded', () => {
  const input = fixture.replace('Campaign brief', 'é🧑'.repeat(200))
    .replace('DESCRIPTION:Read chapter 1', 'DESCRIPTION:<script>secret()</script><style>body{}</style><p>é🧑'.repeat(200) + '</p> Read chapter 1')
    .replace('ADV 3001', 'é🧑'.repeat(100));
  const row = parse(input)[0];
  for (const [field, limit] of [['raw_title', FIELD_BYTES.title], ['description_excerpt', FIELD_BYTES.excerpt], ['external_course_label', FIELD_BYTES.courseLabel]]) {
    assert.ok(Buffer.byteLength(row[field]) <= limit);
    assert.ok(!row[field].includes('\uFFFD'));
  }
  assert.doesNotMatch(row.description_excerpt, /<|>|secret|body\{/);
  const huge = parse(calendar(event('DTSTART:20261001T140000Z\nURL:https://example.com/' + 'x'.repeat(500))))[0];
  assert.equal(huge.external_url, null);
  assert.equal(parse(calendar(event('DTSTART:20261001T140000Z\nDESCRIPTION:' + 'x'.repeat(100000))))[0].description_excerpt.length, 120);
});

test('feed/component/accepted event limits reject whole snapshots, not a partial import', () => {
  const generate = (count, date = '20261001') => calendar(Array.from({ length: count }, (_, i) => event(`DTSTART;VALUE=DATE:${date}`).replace('UID:sample', `UID:${i}`)).join('\n'));
  assert.equal(parse(generate(MAX_EVENTS)).length, 300);
  assert.throws(() => parse(generate(MAX_EVENTS + 1)), /calendar_event_limit/);
  assert.equal(parse(generate(MAX_EVENTS + 1, '20200101')).length, 0);
  assert.throws(() => parse(generate(MAX_COMPONENTS + 1, '20200101')), /invalid_calendar_feed/);
  assert.throws(() => parse(' '.repeat(MAX_FEED_BYTES + 1)), /invalid_calendar_feed/);
});

test('identical full syncs and 304s leave event tuples physically unchanged', async () => {
  const id = await connect(); await sync(id);
  const tuples = async () => (await db.query('select ctid::text, xmin::text, updated_at from external_academic_events where source_id=$1 order by external_uid', [id])).rows;
  const initial = await tuples(); await sync(id); assert.deepEqual(await tuples(), initial);
  await db.query('update external_calendar_sources set last_attempted_at=null where id=$1', [id]);
  await syncCalendar(admin, userA, id, async () => ({ notModified: true }));
  assert.deepEqual(await tuples(), initial);
});

test('304 prunes expired rows; a new UTC day clears validators to admit newly eligible events', async () => {
  const id = await connect(); await sync(id);
  await db.query("update external_academic_events set event_date=(now() at time zone 'UTC')::date - 46 where source_id=$1", [id]);
  await db.query('update external_calendar_sources set last_attempted_at=null where id=$1', [id]);
  await syncCalendar(admin, userA, id, async () => ({ notModified: true }));
  assert.equal((await events(id)).length, 0);
  await db.query("update external_calendar_secrets set snapshot_date=(now() at time zone 'UTC')::date - 1 where source_id=$1", [id]);
  await db.query('update external_calendar_sources set last_attempted_at=null where id=$1', [id]);
  await syncCalendar(admin, userA, id, async (_url, validators) => {
    assert.equal(validators.etag, null); assert.equal(validators.last_modified, null);
    return { text: moveFixtureDate(fixture) };
  });
  assert.equal((await events(id)).length, 2);
});

test('SQL enforces field sizes, date retention and aggregate 300-event budget across sources', async () => {
  const id = await connect(); const second = await connect();
  const many = calendar(Array.from({ length: 299 }, (_, i) => event('DTSTART:20261001T140000Z').replace('UID:sample', `UID:bulk-${i}`)).join('\n'));
  await sync(id, many); await sync(second, calendar(event('DTSTART:20261001T140000Z')));
  assert.equal((await events(id)).length, 299); assert.equal((await events(second)).length, 1);
  await assert.rejects(sync(second), /calendar_event_limit/);
  assert.equal((await events(second)).length, 1);
  await db.query('update external_calendar_sources set last_attempted_at=null where id=$1', [second]);
  const lease = await admin.rpc('begin_external_calendar_sync', { p_user_id: userA, p_source_id: second });
  const row = parseCalendar(moveFixtureDate(fixture))[0];
  for (const [field, limit] of [['raw_title',160],['external_uid',255],['description_excerpt',120],['external_url',384],['external_course_label',80],['course_hint',96]]) {
    const result = await admin.rpc('finish_external_calendar_sync', { p_user_id: userA, p_source_id: second, p_token: lease.data.token, p_events: [{ ...row, [field]: 'x'.repeat(limit + 1) }] });
    assert.ok(result.error, field); assert.equal((await events(second)).length, 1);
  }
  const expired = await admin.rpc('finish_external_calendar_sync', { p_user_id: userA, p_source_id: second, p_token: lease.data.token, p_events: [{ ...row, event_date: '2000-01-01' }] });
  assert.equal(expired.error, null); assert.equal((await events(second)).length, 0);
});

test('newer cancelled revision wins before retention filtering; no raw metadata persists', () => {
  const input = calendar([
    event('DTSTART:20261001T140000Z\nSEQUENCE:1'),
    event('DTSTART:20261001T140000Z\nSEQUENCE:2\nSTATUS:CANCELLED'),
  ].join('\n'));
  assert.equal(parse(input).length, 0);
  const row = parse(fixture)[0];
  for (const key of ['metadata','description','location','provider_updated_at','sequence','last_seen_at','removed_at','user_id','id','ends_at','end_date']) assert.equal(row[key], undefined, key);
});

test('sync persists classification without a mapped course and never writes local exams/objectives', async () => {
  // Sentinel local tables: the new layer must never turn imports into local work.
  await db.exec('create table if not exists exams(id uuid); create table if not exists objectives(id uuid)');
  const id = await connect();
  await sync(id, calendar(event('DTSTART:20261001T140000Z\nSUMMARY:Final Exam')));
  const row = (await events(id))[0];
  assert.equal(row.event_type, 'exam'); assert.equal(row.confidence, 'high'); assert.equal(row.importance, 'critical');
  assert.equal(row.external_course_key, null);
  for (const table of ['external_calendar_course_map','exams','objectives']) assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n, 0);
});

test('owner override wins and survives unchanged, modified and conditional syncs', async () => {
  const id = await connect();
  const initial = calendar(event('DTSTART:20261001T140000Z\nSUMMARY:Final Exam'));
  await sync(id, initial);
  await asUser(userA, 'update external_academic_events set user_override=$1 where source_id=$2', ['quiz',id]);
  let row = (await events(id))[0];
  assert.equal(row.event_type, 'quiz'); assert.equal(row.confidence, 'high'); assert.equal(row.importance, 'normal');
  assert.equal(row.automatic_type, 'exam');
  await sync(id, initial); row = (await events(id))[0];
  assert.equal(row.user_override, 'quiz'); assert.equal(row.event_type, 'quiz');
  await sync(id, initial.replace('Final Exam', 'Group Project')); row = (await events(id))[0];
  assert.equal(row.automatic_type, 'project'); assert.equal(row.automatic_importance, 'major');
  assert.equal(row.user_override, 'quiz'); assert.equal(row.event_type, 'quiz'); assert.equal(row.importance, 'normal');
  await db.query('update external_calendar_sources set last_attempted_at=null where id=$1', [id]);
  await syncCalendar(admin, userA, id, async () => ({ notModified: true }));
  row = (await events(id))[0]; assert.equal(row.user_override, 'quiz');
  await asUser(userA, 'update external_academic_events set user_override=null where source_id=$1', [id]);
  row = (await events(id))[0]; assert.equal(row.event_type, 'project'); assert.equal(row.importance, 'major');
});

test('override writes are owner-only, column-limited, validated and blocked for suspended users', async () => {
  const id = await connect(); await sync(id);
  assert.equal((await asUser(userB, "update external_academic_events set user_override='exam' returning *")).rows.length, 0);
  for (const [column, val] of [['automatic_type','exam'],['automatic_confidence','high'],['automatic_importance','critical'],['raw_title','Exam']]) {
    await assert.rejects(asUser(userA, `update external_academic_events set ${column}=$1`, [val]), /permission denied/);
  }
  await assert.rejects(asUser(userA, "update external_academic_events set event_type='exam'"), /can only be updated to DEFAULT/);
  await assert.rejects(asUser(userA, 'update external_academic_events set event_type=DEFAULT'), /permission denied/);
  await assert.rejects(asUser(userA, "update external_academic_events set source_id=gen_random_uuid()"), /permission denied/);
  await assert.rejects(asUser(userA, "update external_academic_events set user_override='made-up-type'"), /invalid input value for enum/);
  await db.exec('set role anon');
  try { await assert.rejects(db.query("update external_academic_events set user_override='exam'"), /permission denied/); }
  finally { await db.exec('reset role'); }
  await db.query('update profiles set locked=true where id=$1', [userA]);
  await assert.rejects(asUser(userA, "update external_academic_events set user_override='exam'"), /Account suspended/);
});

test('service sync ignores override fields in its payload, including null, without resetting corrections', async () => {
  const id = await connect(); await sync(id);
  await asUser(userA, "update external_academic_events set user_override='presentation' where source_id=$1", [id]);
  const snapshot = await events(id);
  for (const incoming of [null, 'exam']) {
    await db.query('update external_calendar_sources set last_attempted_at=null where id=$1', [id]);
    const lease = await admin.rpc('begin_external_calendar_sync', { p_user_id: userA, p_source_id: id });
    const result = await admin.rpc('finish_external_calendar_sync', { p_user_id: userA, p_source_id: id, p_token: lease.data.token,
      p_events: snapshot.map(row => ({ ...row, user_override: incoming })) });
    assert.equal(result.error, null);
    assert.ok((await events(id)).every(row => row.user_override === 'presentation' && row.event_type === 'presentation'));
  }
});

test('database and pure resolver agree for every automatic type / confidence / override combination', async () => {
  const { ACADEMIC_EVENT_TYPES, resolveAcademicEventClassification } = await import('../lib/academicEventClassification.mjs');
  const id = await connect(); await sync(id, calendar(event('DTSTART:20261001T140000Z\nSUMMARY:Assessment 1')));
  for (const type of ACADEMIC_EVENT_TYPES) for (const confidence of ['high','medium','low']) for (const override of [null, ...ACADEMIC_EVENT_TYPES]) {
    const importance = type === 'exam' && confidence === 'high' ? 'critical' : ['project','presentation','assignment'].includes(type) ? 'major' : 'normal';
    const { rows: [row] } = await db.query('update external_academic_events set automatic_type=$1,automatic_confidence=$2,automatic_importance=$3,user_override=$4 where source_id=$5 returning *', [type,confidence,importance,override,id]);
    const resolved = resolveAcademicEventClassification(row);
    assert.deepEqual([row.event_type,row.confidence,row.importance], [resolved.event_type,resolved.confidence,resolved.importance]);
    assert.equal(resolved.exam_proposal_eligible, row.event_type === 'exam' && row.confidence === 'high');
  }
});

test('a correction belongs to its exact source/UID/recurrence and ends when the event is removed', async () => {
  const one = await connect(); const two = await connect();
  const input = calendar(event('DTSTART:20261001T140000Z\nSUMMARY:Test 1'));
  await sync(one,input); await sync(two,input);
  await asUser(userA, "update external_academic_events set user_override='exam' where source_id=$1 and external_uid='sample' and recurrence_id=''", [one]);
  assert.equal((await events(one))[0].confidence,'high');
  assert.equal((await events(two))[0].confidence,'medium');
  await sync(one,calendar('')); assert.equal((await events(one)).length,0);
  await sync(one,input); assert.equal((await events(one))[0].user_override,null);
});

test('classification migration safely upgrades retained Step 1 rows and invalidates validators', async () => {
  const legacy = await createCalendarDatabase({ classification: false });
  try {
    await legacy.exec(`insert into auth.users values ('${userA}');
      insert into external_calendar_sources(id,user_id,provider,display_name) values ('${courseA}','${userA}','canvas','School');
      insert into external_calendar_secrets(source_id,feed_url,etag,snapshot_date) values ('${courseA}','https://example.edu/private.ics','old-etag',current_date);
      insert into external_academic_events(source_id,external_uid,raw_title,event_date,status) values ('${courseA}','old','Final Exam',current_date,'active');`);
    await legacy.exec(readFileSync(new URL('../supabase/migrations/20261001212530_classify_external_academic_events.sql', import.meta.url), 'utf8'));
    const row = (await legacy.query('select * from external_academic_events')).rows[0];
    assert.equal(row.raw_title,'Final Exam'); assert.equal(row.event_type,'other'); assert.equal(row.confidence,'low');
    assert.equal(row.importance,'normal'); assert.equal(row.user_override,null);
    assert.equal((await legacy.query('select etag from external_calendar_secrets')).rows[0].etag,null);
    assert.equal((await legacy.query("select count(*)::int n from pg_indexes where tablename='external_academic_events'")).rows[0].n,2);
  } finally { await legacy.close(); }
});

test('database refuses inconsistent critical importance on quizzes and uncertain exams', async () => {
  const id = await connect(); await sync(id);
  for (const type of ['quiz','exam']) {
    await assert.rejects(db.query("update external_academic_events set automatic_type=$1,automatic_confidence='medium',automatic_importance='critical' where source_id=$2", [type,id]), /academic_event_automatic_importance_consistent/);
  }
});
