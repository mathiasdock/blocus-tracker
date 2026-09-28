# Campaign acquisition (v1)

Small first-party measurement for campus QR codes. No third-party analytics,
IP storage, device fingerprint, page-view stream or polling.

## URLs and campaign registry

`/c/<slug>` is a short, non-indexable redirect to the canonical homepage with
`?campaign=<slug>`. The slug must exist and be active in
`public.acquisition_campaigns` to count. Initial examples:

- `/c/ucf-poster` — general campus poster
- `/c/ucf-library` — library poster
- `/c/ucf-business` — business building poster

Future placements need one registry row, not a new route. Use a stable lowercase
hyphenated slug; never rename a slug after printing a QR code. The Admin reads
its human name and medium. There is no CRM or campaign-creation UI.

## Privacy and attribution

Measurement starts only after the existing `analytics` consent is granted.
Without it, no campaign storage or RPC is used. GPC forces refusal. A campaign
query can remain briefly in page memory while the visitor decides; no data is
persisted before agreement. The new purpose reset the consent model version.

One **visit** is one consenting browser for one campaign per UTC day, not one
person or one page view. A random UUID in first-party local storage makes
refreshes, navigation and OAuth retries idempotent. It is not derived from the
device. Clearing storage or using another browser can count again. Bots that
only preview links never call the browser RPC; deliberate API abuse cannot be
fully prevented without collecting more data. Treat visits as directional.

The first successfully recorded campaign is held for 30 days. Subsequent
campaigns may count visits but cannot replace that pending first touch. A new
account claims the visit once; the database rejects a visit later than the
account's creation, so existing users cannot be reattributed. Email signup
also places the random visit ticket in auth metadata for confirmation on a
second device; Google uses the same browser's pending ticket after OAuth.
Neither route changes the referral or onboarding logic. Explicit analytics
withdrawal clears browser keys and deletes account attribution. Account
deletion cascades to the attribution row.

`acquisition_visits` contains UUID, campaign and time only. The existing daily
Vercel cleanup removes IDs older than 30 days; `acquisition_daily_visits`
retains anonymous counts. `member_acquisition` retains only first campaign and
date per account. All tables have RLS and no direct anon/member access; the
public visit RPC writes only, and Admin RPCs check `assert_admin()`.

## Admin definitions

Admin → Activation reads `admin_acquisition_campaigns()`. The member drawer
reads `admin_member_acquisition()`. The campaign RPC joins the existing
`admin_member_facts()`—the **same** real-session threshold, activation window
and week-2 return as the other Admin sections. An activation/return rate uses
only accounts whose respective windows are closed. Rates are hidden below the
existing minimum cohort size; raw counts remain visible. Visit → signup is an
observed conversion among consenting browsers, never a total-campaign claim.
Historical accounts are not backfilled or guessed.

## Release and verification

Apply `20260928033649_campaign_attribution.sql` and its follow-up
`20260928041022_acquisition_visit_campaign_index.sql` before deploying client code.
The release can be checked with zero production test users: verify the three
registry rows, RLS/grants, empty Admin metrics, and the short-route redirect.
Node tests cover consent refusal, daily deduplication, first-touch order,
expiry, OAuth/email ticket handoff and withdrawal. Do not create test members
in production just to populate the report.
