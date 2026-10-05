import { validActivity } from "./activityFeed.mjs";
import { normalizeStudyName } from "./studySpaces.mjs";

const PROFILE_FIELDS = "id,pseudo,first_name,last_name,avatar_url,university,broad_field,study_field,study_year,bio,locked";
const COURSE_FIELDS = "id,name,color,study_institution_id";

const quantity = value => value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) >= 0
  ? Number(value) : null;

export function publicProfileProgression(row) {
  if (!row) return null;
  return { totalXP: quantity(row.total_xp), streak: quantity(row.streak), badgeCount: quantity(row.badge_count) };
}

// Same name alone is not a shared course: institution matters, including
// the saved affiliation of an exchange course. Missing affiliation is not
// guessed from another student's academic context.
export function profileCourses(courses = [], mine = [], profile = {}, viewer = {}, friends = false) {
  const key = (course, owner) => {
    const institution = course.study_institution_id
      ? `id:${course.study_institution_id}` : owner.university ? `name:${normalizeStudyName(owner.university)}` : "";
    const name = normalizeStudyName(course.name || "");
    return institution && name ? `${institution}:${name}` : "";
  };
  const ownKeys = new Set(mine.map(course => key(course, viewer)).filter(Boolean));
  const sorted = courses.filter(course => course.name?.trim()).map(course => ({
    ...course, shared: friends && !!key(course, profile) && ownKeys.has(key(course, profile)),
  })).sort((a, b) => Number(b.shared) - Number(a.shared) || a.name.localeCompare(b.name));
  return { visible: sorted.slice(0, 3), remaining: Math.max(0, sorted.length - 3), sharedCount: sorted.filter(course => course.shared).length };
}

// Only explicitly shared, structured badge events. Never reconstruct an
// earned badge from XP, a streak, a caption, or inaccessible user_badges.
export function sharedBadgeHighlights(posts = [], catalog = [], friends = false) {
  const allowed = new Set(catalog);
  const seen = new Set();
  return posts.filter(post => {
    if (post.visibility !== "public" && !(friends && post.visibility === "friends")) return false;
    const event = post.activity;
    if (!validActivity("badge_unlocked", event) || !allowed.has(event.badgeId) || seen.has(event.badgeId)) return false;
    seen.add(event.badgeId);
    return true;
  }).slice(0, 3).map(post => post.activity.badgeId);
}

export async function loadSocialProfile(client, viewerId, userId) {
  if (!viewerId || !userId) throw new Error("Profile unavailable");
  const self = viewerId === userId;
  const [profileResult, relationshipResult, progressionResult] = await Promise.all([
    client.from("profiles").select(PROFILE_FIELDS).eq("id", userId).maybeSingle(),
    self ? { data: null } : client.from("friendships").select("id,requester,addressee,status")
      .or(`and(requester.eq.${viewerId},addressee.eq.${userId}),and(requester.eq.${userId},addressee.eq.${viewerId})`).maybeSingle(),
    client.rpc("get_gamification_levels", { p_user_ids: [userId] }),
  ]);
  if (profileResult.error || relationshipResult.error || !profileResult.data || profileResult.data.locked) {
    throw new Error("Profile unavailable");
  }
  const profile = profileResult.data;
  const relationship = relationshipResult.data;
  const friends = relationship?.status === "accepted";
  const canReadStudy = self || friends;
  const [statsResult, coursesResult, mineResult, viewerResult, highlightsResult] = await Promise.all([
    // The existing RPC is friends/self/admin only. This social surface does
    // not use administrative access to show a stranger's private aggregate.
    canReadStudy ? client.rpc("get_user_profile_stats", { p_user_id: userId }) : { data: null },
    canReadStudy ? client.from("courses").select(COURSE_FIELDS).eq("user_id", userId).is("archived_at", null).order("name") : { data: null },
    friends ? client.from("courses").select(COURSE_FIELDS).eq("user_id", viewerId).is("archived_at", null) : { data: [] },
    friends ? client.from("profiles").select("university").eq("id", viewerId).maybeSingle() : { data: null },
    client.from("posts").select("activity,visibility").eq("user_id", userId)
      .eq("activity->>type", "badge_unlocked").in("visibility", friends || self ? ["public", "friends"] : ["public"])
      .order("created_at", { ascending: false }).limit(24),
  ]);
  const stats = !statsResult.error && (Array.isArray(statsResult.data) ? statsResult.data[0] : statsResult.data);
  return {
    profile, relationship,
    progression: progressionResult.error ? null : publicProfileProgression(progressionResult.data?.[0]),
    seconds30d: canReadStudy && stats ? quantity(stats.seconds_30d) : null,
    courses: coursesResult.error ? null : coursesResult.data,
    mine: mineResult.error ? [] : mineResult.data || [],
    viewer: viewerResult.data || {},
    sharedPosts: highlightsResult.error ? [] : highlightsResult.data || [],
    partial: !!(progressionResult.error || (canReadStudy && (statsResult.error || coursesResult.error)) || highlightsResult.error),
  };
}

export async function changeProfileFriendship(client, { viewerId, userId, relationship, action }) {
  if (!viewerId || !userId || viewerId === userId) throw new Error("Invalid friendship action");
  if (action === "add" && !relationship) {
    const result = await client.from("friendships").insert({ requester: viewerId, addressee: userId, status: "pending" })
      .select("id,requester,addressee,status").single();
    if (result.error || !result.data) throw new Error("Friendship could not be updated");
    return result.data;
  }
  if (!relationship?.id || ![relationship.requester, relationship.addressee].includes(viewerId)
    || ![relationship.requester, relationship.addressee].includes(userId)) throw new Error("Invalid friendship action");
  if (action === "accept" && relationship.status === "pending" && relationship.addressee === viewerId) {
    const result = await client.from("friendships").update({ status: "accepted" }).eq("id", relationship.id)
      .eq("addressee", viewerId).eq("status", "pending").select("id,requester,addressee,status").single();
    if (result.error || !result.data) throw new Error("Friendship could not be updated");
    return result.data;
  }
  if (action === "remove" && ["pending", "accepted"].includes(relationship.status)) {
    const result = await client.from("friendships").delete().eq("id", relationship.id)
      .or(`requester.eq.${viewerId},addressee.eq.${viewerId}`);
    if (result.error) throw new Error("Friendship could not be updated");
    return null;
  }
  throw new Error("Invalid friendship action");
}
