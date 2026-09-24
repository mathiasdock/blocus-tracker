import test from "node:test";
import assert from "node:assert/strict";
import {
  cohortCell,
  csvCell,
  describeRate,
  formatAgo,
  formatBytes,
  formatCount,
  formatDate,
  formatDuration,
  formatPercent,
  membersQueryString,
  parseMembersQuery,
  shortSha,
  toCsv,
  todayAttention,
} from "../lib/adminFormat.mjs";

// Intl insère des espaces insécables (fines ou non) : on les normalise pour
// comparer au texte lu à l'écran.
const plain = (text) => String(text).replace(/[\u00a0\u202f]/g, " ");

const t = (key) => ({
  "adm.common.nOfM": key === "adm.common.nOfM" ? "{n} sur {m}" : key,
}[key] || key);

test("durations keep the app format, then switch to whole hours", () => {
  assert.equal(formatDuration(null, "fr"), "—");
  assert.equal(formatDuration(0, "fr"), "0 min");
  assert.equal(formatDuration(20, "fr"), "< 1 min");
  assert.equal(formatDuration(45 * 60, "fr"), "45 min");
  assert.equal(formatDuration(85522, "fr"), "23h45");
  assert.equal(formatDuration(8 * 3600, "en"), "8h");
  // 3 593,6 h plafonnées : au-delà de 100 h, des heures entières.
  assert.equal(plain(formatDuration(12937000, "fr")), "3 594 h");
  assert.equal(formatDuration(12937000, "en"), "3,594 h");
});

test("counts and percentages follow the language", () => {
  assert.equal(plain(formatCount(1234, "fr")), "1 234");
  assert.equal(formatCount(1234, "en"), "1,234");
  assert.equal(formatCount(null, "fr"), "—");
  assert.equal(plain(formatPercent(0.3559, "fr")), "35,6 %");
  assert.equal(formatPercent(0.3559, "en"), "35.6%");
  assert.equal(formatPercent(null, "en"), "—");
});

test("a missing rate is never recomputed: it is written as n of m", () => {
  const withRate = describeRate({ count: 100, base: 281, rate: 0.3559 }, "fr", t);
  assert.equal(plain(withRate.value), "35,6 %");
  assert.equal(withRate.detail, "100 sur 281");
  assert.equal(withRate.hasRate, true);

  const small = describeRate({ count: 1, base: 2, rate: null }, "fr", t);
  assert.deepEqual(small, { value: "1 sur 2", detail: null, hasRate: false });
});

test("cohort cells describe pending, empty, small and complete weeks", () => {
  assert.deepEqual(cohortCell(null, 3, 1), { state: "none" });
  assert.deepEqual(
    cohortCell({ complete: false, complete_at: "2026-09-28T22:00:00Z", rate: null }, 4, 1),
    { state: "pending", until: "2026-09-28T22:00:00Z" },
  );
  assert.deepEqual(cohortCell({ complete: true, rate: null }, 0, 0), { state: "empty" });
  assert.deepEqual(cohortCell({ complete: true, rate: null }, 6, null), { state: "unknown" });
  assert.deepEqual(cohortCell({ complete: true, rate: null }, 2, 1), { state: "small", count: 1, base: 2 });
  assert.deepEqual(cohortCell({ complete: true, rate: 0.344 }, 218, 75), { state: "rate", rate: 0.344, count: 75, base: 218 });
});

test("dates are written in Brussels time; civil dates never shift", () => {
  // 23:30 UTC le 6 septembre = 1:30 le 7 à Bruxelles.
  assert.equal(formatDate("2026-09-06T23:30:00Z", "en", "day"), "7 Sept 2026");
  assert.equal(formatDate("2026-09-07", "en", "dayShort"), "7 Sept");
  assert.equal(formatDate("2026-09-07", "fr", "dayShort"), "7 sept.");
  assert.equal(formatDate(null, "fr"), "—");
  assert.equal(formatDate("not a date", "fr"), "—");
});

test("relative ages read naturally", () => {
  const now = new Date("2026-09-24T12:00:00Z");
  assert.equal(formatAgo("2026-09-21T12:00:00Z", now, "en"), "3 days ago");
  assert.equal(formatAgo("2026-09-24T11:00:00Z", now, "fr"), "il y a 1 heure");
  assert.equal(formatAgo(null, now, "fr"), "—");
});

test("today only flags fields the server already computed", () => {
  assert.deepEqual(todayAttention(null), []);
  const calm = {
    queue: { open_reports: 0, new_feedback: 0, push_failures_7d: 0, push_failure_members_7d: 0 },
    jobs: [{ job: "purge_posts", overdue: false, last_status: "ok", last_started_at: "2026-09-24T03:30:00Z" }],
    study_seconds: { long_sessions_current: 0 },
  };
  assert.deepEqual(todayAttention(calm), []);

  const busy = {
    queue: { open_reports: 2, new_feedback: 3, push_failures_7d: 5, push_failure_members_7d: 1 },
    jobs: [
      { job: "purge_posts", overdue: true, last_status: "ok", last_started_at: "2026-09-21T03:30:00Z" },
      { job: "push_daily", overdue: false, last_status: "error", last_started_at: "2026-09-23T18:00:00Z" },
    ],
    study_seconds: { long_sessions_current: 1 },
  };
  assert.deepEqual(todayAttention(busy).map((item) => item.key), [
    "reports", "feedback", "jobOverdue", "jobFailed", "pushFailures", "longSessions",
  ]);
  assert.equal(todayAttention(busy)[4].members, 1);

  const neverRan = { queue: {}, jobs: [{ job: "push_daily", overdue: false, last_status: null, last_started_at: null }] };
  assert.deepEqual(todayAttention(neverRan).map((item) => [item.key, item.tone]), [["jobNever", "info"]]);
});

test("CSV cells neutralise formulas and escape separators", () => {
  assert.equal(csvCell(null), "");
  assert.equal(csvCell("lina"), "lina");
  assert.equal(csvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(csvCell("+32"), "'+32");
  assert.equal(csvCell("@me"), "'@me");
  assert.equal(csvCell("a,b"), "\"a,b\"");
  assert.equal(csvCell("ligne\nsuivante"), "\"ligne\nsuivante\"");
  const csv = toCsv([{ p: "lina", n: 3 }], [{ header: "Pseudo", value: (r) => r.p }, { header: "Sessions", value: (r) => r.n }]);
  assert.equal(csv, "\uFEFFPseudo,Sessions\r\nlina,3\r\n");
});

test("the members URL round-trips and rejects unknown values", () => {
  assert.deepEqual(parseMembersQuery({}), { segment: "all", sort: "signup_desc", page: 1, search: "", id: null });
  const parsed = parseMembersQuery({
    seg: "dormant", sort: "time_30d_desc", page: "3", q: "lina", id: "0b8f3c1e-6c0d-4d59-9a57-3f0c2f7b9a11",
  });
  assert.deepEqual(parsed, {
    segment: "dormant", sort: "time_30d_desc", page: 3, search: "lina", id: "0b8f3c1e-6c0d-4d59-9a57-3f0c2f7b9a11",
  });
  assert.equal(membersQueryString(parsed), "?q=lina&seg=dormant&sort=time_30d_desc&page=3&id=0b8f3c1e-6c0d-4d59-9a57-3f0c2f7b9a11");
  assert.equal(membersQueryString(parseMembersQuery({})), "");
  assert.deepEqual(parseMembersQuery({ seg: "admins", sort: "email", page: "-2", id: "x" }),
    { segment: "all", sort: "signup_desc", page: 1, search: "", id: null });
});

test("bytes and commit hashes", () => {
  assert.equal(formatBytes(512, "en"), "512 B");
  assert.equal(formatBytes(1536, "en"), "1.5 KB");
  assert.equal(plain(formatBytes(5 * 1024 * 1024, "fr")), "5 MB");
  assert.equal(shortSha("b7af983c0ffee1234567890abcdef1234567890a"), "b7af983");
  assert.equal(shortSha(""), null);
  assert.equal(shortSha("main"), null);
});

test("admin date fields are read in Brussels time, whatever the admin's computer says", async () => {
  const { adminInputToIso, isoToAdminInput } = await import("../lib/adminFormat.mjs");
  // Heure d'été (UTC+2), heure d'hiver (UTC+1).
  assert.equal(adminInputToIso("2026-10-04T18:00"), "2026-10-04T16:00:00.000Z");
  assert.equal(adminInputToIso("2026-12-04T18:00"), "2026-12-04T17:00:00.000Z");
  // Aller-retour : ce que l'admin a tapé est ce qu'il relit.
  assert.equal(isoToAdminInput(adminInputToIso("2026-10-04T18:00")), "2026-10-04T18:00");
  assert.equal(isoToAdminInput(adminInputToIso("2026-03-29T12:30")), "2026-03-29T12:30");
  assert.equal(adminInputToIso(""), null);
  assert.equal(adminInputToIso("04/10/2026 18:00"), null);
  assert.equal(isoToAdminInput(null), "");
});
