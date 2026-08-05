import { createClient } from "@supabase/supabase-js";
import { getBearerToken, getClientIp, setBaseSecurityHeaders } from "../../../lib/apiSecurity";
import { rateLimit } from "../../../lib/rateLimit";

export const config = {
  api: {
    bodyParser: false,
  },
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ROW_LIMIT = 10000;
const PAGE_SIZE = 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function uniqueCount(rows, key) {
  return new Set((rows || []).map((row) => row?.[key]).filter(Boolean)).size;
}

function safeProfile(profile) {
  return {
    id: profile.id,
    pseudo: profile.pseudo || "membre",
    firstName: profile.first_name || null,
    lastName: profile.last_name || null,
    university: profile.university || null,
    createdAt: profile.created_at,
  };
}

async function fetchPagedRows(makeQuery) {
  const rows = [];
  for (let from = 0; from < ROW_LIMIT; from += PAGE_SIZE) {
    const { data, error } = await makeQuery().range(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows, error, truncated: false };
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { data: rows, error: null, truncated: false };
  }
  return { data: rows, error: null, truncated: true };
}

export default async function handler(req, res) {
  setBaseSecurityHeaders(res);

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const limited = rateLimit(`admin-insights:${getClientIp(req)}`, 15, 60_000);
  if (!limited.ok) {
    return res.status(429).json({ error: "Too many requests" });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userError || !userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: adminProfile, error: profileError } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !adminProfile?.is_admin) {
    console.warn("admin/insights forbidden", { user: `${userId.slice(0, 8)}...` });
    return res.status(403).json({ error: "Forbidden" });
  }

  const [
    profilesRes,
    sessionsRes,
    objectivesRes,
    badgesRes,
    friendshipsRes,
    missionsRes,
    feedbackRes,
    inactiveAnnouncementsRes,
  ] = await Promise.all([
    fetchPagedRows(() => admin.from("profiles").select("id, pseudo, first_name, last_name, university, created_at, locked")),
    fetchPagedRows(() => admin.from("sessions").select("user_id, started_at").order("started_at", { ascending: false })),
    fetchPagedRows(() => admin.from("objectives").select("user_id")),
    fetchPagedRows(() => admin.from("user_badges").select("user_id")),
    fetchPagedRows(() => admin.from("friendships").select("requester, addressee").eq("status", "accepted")),
    fetchPagedRows(() => admin.from("daily_mission_assignments").select("user_id, completed_at")),
    admin.from("app_feedback").select("id", { count: "exact", head: true }).eq("status", "new"),
    admin.from("app_announcements").select("id", { count: "exact", head: true }).eq("is_active", false),
  ]);

  if (profilesRes.error || sessionsRes.error) {
    console.error("admin/insights core query failed", {
      profiles: profilesRes.error?.code || null,
      sessions: sessionsRes.error?.code || null,
    });
    return res.status(502).json({ error: "Unable to load admin insights" });
  }

  const optionalSources = [
    ["objectives", objectivesRes],
    ["badges", badgesRes],
    ["friendships", friendshipsRes],
    ["missions", missionsRes],
    ["feedback", feedbackRes],
    ["announcements", inactiveAnnouncementsRes],
  ];
  const warnings = optionalSources
    .filter(([, result]) => result.error)
    .map(([source]) => `${source} unavailable`);
  optionalSources.forEach(([source, result]) => {
    if (result.error) console.warn("admin/insights optional query failed", { source, code: result.error.code || null });
  });

  const profiles = profilesRes.data || [];
  const sessions = sessionsRes.data || [];
  const objectives = objectivesRes.data || [];
  const badges = badgesRes.data || [];
  const friendships = friendshipsRes.data || [];
  const missions = missionsRes.data || [];
  const now = Date.now();
  const stalledCutoff = now - 48 * HOUR_MS;
  const dormantCutoff = now - 30 * DAY_MS;

  const timerUsers = new Set();
  const lastSessionByUser = new Map();
  sessions.forEach((session) => {
    if (!session.user_id) return;
    timerUsers.add(session.user_id);
    const stamp = session.started_at ? new Date(session.started_at).getTime() : 0;
    if (stamp > (lastSessionByUser.get(session.user_id) || 0)) lastSessionByUser.set(session.user_id, stamp);
  });

  const friendUsers = new Set();
  friendships.forEach((friendship) => {
    if (friendship.requester) friendUsers.add(friendship.requester);
    if (friendship.addressee) friendUsers.add(friendship.addressee);
  });

  const stalledProfiles = profiles
    .filter((profile) => {
      const createdAt = profile.created_at ? new Date(profile.created_at).getTime() : now;
      return createdAt <= stalledCutoff && !timerUsers.has(profile.id);
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const dormantProfiles = profiles.filter((profile) => {
    const lastSession = lastSessionByUser.get(profile.id);
    return lastSession && lastSession < dormantCutoff;
  });

  const completedMissions = missions.filter((mission) => mission.completed_at);
  const truncated = {
    profiles: profilesRes.truncated,
    sessions: sessionsRes.truncated,
    objectives: objectivesRes.truncated,
    badges: badgesRes.truncated,
    friendships: friendshipsRes.truncated,
    missions: missionsRes.truncated,
  };

  return res.status(200).json({
    generatedAt: new Date(now).toISOString(),
    members: profiles.length,
    adoption: {
      timer: { users: timerUsers.size, available: true },
      planning: { users: uniqueCount(objectives, "user_id"), available: !objectivesRes.error },
      badges: { users: uniqueCount(badges, "user_id"), available: !badgesRes.error },
      social: { users: friendUsers.size, available: !friendshipsRes.error },
      missions: { users: uniqueCount(missions, "user_id"), available: !missionsRes.error },
      missionsCompleted: { users: uniqueCount(completedMissions, "user_id"), available: !missionsRes.error },
    },
    queue: {
      stalledAfter48h: stalledProfiles.length,
      dormant30d: dormantProfiles.length,
      lockedAccounts: profiles.filter((profile) => profile.locked).length,
      newFeedback: feedbackRes.count || 0,
      inactiveAnnouncements: inactiveAnnouncementsRes.count || 0,
    },
    stalledUsers: stalledProfiles.slice(0, 8).map(safeProfile),
    warnings,
    truncated,
  });
}
