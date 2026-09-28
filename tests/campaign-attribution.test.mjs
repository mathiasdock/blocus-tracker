import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CAMPAIGN_DAYS_KEY, CAMPAIGN_PENDING_KEY, claimCampaignForUser,
  cleanCampaignSlug, clearCampaignStorage, pendingCampaignVisit,
  recordCampaignLanding, pruneCampaignStorage,
} from "../lib/campaignAttribution.mjs";
import { buildSignupMetadata } from "../lib/onboarding.mjs";

function storage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

function rpcMock() {
  const visits = new Map();
  const claims = new Map();
  const calls = [];
  const supabase = {
    rpc: async (name, args) => {
      calls.push(name);
      if (name === "record_acquisition_visit") {
        if (!["ucf-poster", "ucf-library", "ucf-business"].includes(args.p_campaign)) return { data: false, error: null };
        if (!visits.has(args.p_visit_id)) visits.set(args.p_visit_id, args.p_campaign);
        return { data: true, error: null };
      }
      if (name === "claim_acquisition_first_touch") {
        if (!visits.has(args.p_visit_id)) return { data: false, error: null };
        claims.set("current", visits.get(args.p_visit_id));
        return { data: true, error: null };
      }
      throw new Error("Unexpected RPC");
    },
    auth: { updateUser: async () => ({ error: null }) },
  };
  return { supabase, visits, claims, calls };
}

test("campaign route keys are short, local and normalized", () => {
  assert.equal(cleanCampaignSlug("ucf-library"), "ucf-library");
  assert.equal(cleanCampaignSlug("/evil"), null);
  assert.equal(cleanCampaignSlug("UCF"), null);
  assert.equal(cleanCampaignSlug("a".repeat(65)), null);
});

test("refused analytics creates neither browser state nor a visit", async () => {
  const browser = storage();
  const api = rpcMock();
  assert.equal(await recordCampaignLanding(api.supabase, browser, "ucf-poster", Date.now(), false), null);
  assert.equal(api.calls.length, 0);
  assert.equal(browser.getItem(CAMPAIGN_PENDING_KEY), null);
  assert.equal(await recordCampaignLanding(api.supabase, null, "ucf-poster", Date.now(), true), null);
  assert.equal(api.calls.length, 0);
});

test("refresh and A → B → A count once per campaign/day while first touch stays A", async () => {
  const browser = storage();
  const api = rpcMock();
  const now = Date.UTC(2026, 8, 27, 12);
  const first = await recordCampaignLanding(api.supabase, browser, "ucf-poster", now, true);
  await recordCampaignLanding(api.supabase, browser, "ucf-library", now + 1, true);
  const again = await recordCampaignLanding(api.supabase, browser, "ucf-poster", now + 2, true);
  assert.equal(first, again);
  assert.equal(api.visits.size, 2);
  assert.equal(pendingCampaignVisit(browser, now + 2).slug, "ucf-poster");
  assert.equal(Object.keys(JSON.parse(browser.getItem(CAMPAIGN_DAYS_KEY))).length, 2);
});

test("email signup ticket survives another browser; Google callback uses the same local ticket", async () => {
  const browser = storage();
  const api = rpcMock();
  const id = await recordCampaignLanding(api.supabase, browser, "ucf-library", Date.now(), true);
  const newDevice = storage();
  assert.equal(buildSignupMetadata({ campaignVisitId: id }).pending_campaign_visit_id, id);
  assert.equal(buildSignupMetadata({}).pending_campaign_visit_id, undefined);
  const user = { id: "new-user", user_metadata: { pending_campaign_visit_id: id } };
  assert.equal(await claimCampaignForUser(api.supabase, newDevice, user, false), true);
  assert.equal(api.claims.get("current"), "ucf-library");

  assert.equal(await claimCampaignForUser(api.supabase, browser, { id: "google-user", user_metadata: {} }, true), true);
  assert.equal(browser.getItem(CAMPAIGN_PENDING_KEY), null);
  assert.ok(browser.getItem(CAMPAIGN_DAYS_KEY));
});

test("explicit denial, no campaign and expired first touch do not claim", async () => {
  const browser = storage();
  const api = rpcMock();
  const user = { id: "new-user", user_metadata: {} };
  assert.equal(await claimCampaignForUser(api.supabase, browser, user, true), null);
  const now = Date.now();
  await recordCampaignLanding(api.supabase, browser, "ucf-business", now, true);
  assert.equal(await claimCampaignForUser(api.supabase, browser, user, true, true), null);
  assert.equal(api.claims.size, 0);
  assert.equal(pendingCampaignVisit(browser, now + 31 * 24 * 60 * 60 * 1000), null);
  pruneCampaignStorage(browser, now + 31 * 24 * 60 * 60 * 1000);
  assert.equal(browser.getItem(CAMPAIGN_PENDING_KEY), null);
  clearCampaignStorage(browser);
  assert.equal(browser.getItem(CAMPAIGN_PENDING_KEY), null);
});

test("campaign outcomes reuse the canonical Admin facts and closed windows", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260928033649_campaign_attribution.sql", import.meta.url), "utf8");
  assert.match(sql, /join public\.admin_member_facts\(v_now\)/);
  assert.match(sql, /f\.real_sessions > 0/);
  assert.match(sql, /f\.activation_window_ends_at <= v_now and f\.activation_status = 'activated'/);
  assert.match(sql, /f\.return_window_ends_at <= v_now and f\.returned_week2/);
  assert.doesNotMatch(sql, /duration_seconds\s*>=/);
});
