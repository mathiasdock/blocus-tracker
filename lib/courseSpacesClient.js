import { supabase, isOfflineDev } from "./supabaseClient";
import { attachmentKind, safeStoragePath, sanitizeFileName, storagePathFromReference, validateUploadFile } from "./security";
import { optimizeFeedImage } from "./imageCompression";
import { isSharedExamPlanned } from "./courseSpaces.mjs";

// Every read and write of course spaces goes through this file (see
// docs/course-spaces.md). Cross-user data only ever comes from SECURITY
// DEFINER functions: the client can read its own course links, its own
// memberships and the messages of rooms it belongs to — nothing else.
export const ROOM_PAGE_SIZE = 40;
export const MESSAGE_COLUMNS = "id,room_id,user_id,content,attachment_url,attachment_type,attachment_name,exam_date,created_at";
const AUTHOR_COLUMNS = "id,pseudo,first_name,last_name,avatar_url";

export function requireData(result) {
  if (result?.error) throw result.error;
  return result?.data;
}

// Opening the page resolves the student's own courses first (Phase 1
// matching) and syncs the two default spaces of their profile, then asks only
// about the offerings those links name.
export async function loadCourseSpaceOverview(userId) {
  const [courses, links, defaults] = await Promise.all([
    supabase.from("courses").select("id,name,color,archived_at").eq("user_id", userId),
    supabase.rpc("resolve_my_course_links"),
    supabase.rpc("ensure_my_default_rooms"),
  ]);
  const courseRows = requireData(courses) || [];
  const linkRows = requireData(links) || [];
  const defaultRows = requireData(defaults) || [];
  const offeringIds = [...new Set(linkRows.filter((row) => row.status !== "suggested").map((row) => row.offering_id))];
  const summaries = requireData(await supabase.rpc("course_space_summaries", { p_offering_ids: offeringIds })) || [];
  return { courses: courseRows, links: linkRows, summaries, defaults: defaultRows };
}

export async function searchCourseSpaces(query) {
  return requireData(await supabase.rpc("search_course_spaces", { p_query: String(query || "").slice(0, 120) })) || [];
}

export async function answerCourseMatch(courseId, offeringId, accept) {
  return requireData(await supabase.rpc(accept ? "confirm_course_link" : "reject_course_link", { p_course_id: courseId, p_offering_id: offeringId }));
}

export async function joinCourseSpace(offeringId) {
  return requireData(await supabase.rpc("join_course_room", { p_offering_id: offeringId }));
}

// Joining an institution or program space again after leaving it. The server
// only accepts the caller's own two default spaces.
export async function joinDefaultSpace(roomId) {
  requireData(await supabase.rpc("join_default_room", { p_room_id: roomId }));
  return roomId;
}

export async function leaveCourseSpace(roomId) {
  requireData(await supabase.rpc("leave_course_room", { p_room_id: roomId }));
}

// Newest page first from the server, returned oldest → newest.
export async function fetchRoomMessages(roomId, before = null) {
  let query = supabase.from("community_messages").select(MESSAGE_COLUMNS).eq("room_id", roomId)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(ROOM_PAGE_SIZE);
  if (before) query = query.or(`created_at.lt.${before.created_at},and(created_at.eq.${before.created_at},id.lt.${before.id})`);
  return (requireData(await query) || []).reverse();
}

export async function fetchAuthors(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  return requireData(await supabase.from("profiles").select(AUTHOR_COLUMNS).in("id", unique)) || [];
}

// The attachment is uploaded first under the author's own folder and the
// room id; post_course_room_message refuses any other path. A refused post
// removes the orphan file again.
export async function postRoomMessage({ userId, roomId, content, file, examDate }) {
  let attachment = null;
  if (file) {
    const check = validateUploadFile(file, "chatAttachment");
    if (!check.ok) throw Object.assign(new Error("upload"), { upload: check });
    const optimized = await optimizeFeedImage(file).catch(() => null);
    const finalFile = optimized?.file || file;
    const info = safeStoragePath(userId, finalFile, [roomId], "chatAttachment");
    if (!info.ok) throw Object.assign(new Error("upload"), { upload: info });
    requireData(await supabase.storage.from("community").upload(info.path, finalFile, { contentType: info.contentType, cacheControl: "31536000" }));
    attachment = { path: info.path, url: `community:${info.path}`, type: attachmentKind(finalFile), name: sanitizeFileName(file.name) };
  }
  try {
    return requireData(await supabase.rpc("post_course_room_message", {
      p_room_id: roomId,
      p_content: content || "",
      p_attachment_url: attachment?.url || null,
      p_attachment_type: attachment?.type || null,
      p_attachment_name: attachment?.name || null,
      p_exam_date: examDate || null,
    }));
  } catch (error) {
    if (attachment) await removeStoredAttachment(attachment.url);
    throw error;
  }
}

async function removeStoredAttachment(ref) {
  const path = storagePathFromReference(ref, "community");
  if (!path) return;
  try { await supabase.storage.from("community").remove([path]); } catch { /* orphan cleanup in /admin covers it */ }
}

// Authors delete their own messages; admins any (RLS cmsg_delete). Only an
// author's own file can be removed from storage by the browser.
export async function deleteRoomMessage(message, viewerId) {
  requireData(await supabase.from("community_messages").delete().eq("id", message.id));
  if (message.attachment_url && message.user_id === viewerId) await removeStoredAttachment(message.attachment_url);
}

export async function reportRoomMessage(messageId, reason) {
  requireData(await supabase.rpc("report_course_message", { p_message_id: messageId, p_reason: reason }));
}

export async function fetchBlockedIds(userId) {
  const rows = requireData(await supabase.from("user_blocks").select("blocked_id").eq("blocker_id", userId)) || [];
  return rows.map((row) => row.blocked_id);
}

export async function blockStudent(userId, blockedId) {
  const result = await supabase.from("user_blocks").insert({ blocker_id: userId, blocked_id: blockedId });
  // Already blocked is the state the student asked for.
  if (result.error && result.error.code !== "23505") throw result.error;
}

export async function unblockStudent(userId, blockedId) {
  requireData(await supabase.from("user_blocks").delete().eq("blocker_id", userId).eq("blocked_id", blockedId));
}

// Signed on demand, for five minutes, by /api/storage/sign — which checks
// room membership. Nothing is downloaded until the student asks.
export async function signRoomAttachment(ref) {
  const path = storagePathFromReference(ref, "community");
  if (!path) throw new Error("attachment");
  if (isOfflineDev) return `/offline-upload/community/${path}`;
  const session = requireData(await supabase.auth.getSession());
  const response = await fetch("/api/storage/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.session?.access_token}` },
    body: JSON.stringify({ bucket: "community", ref }),
  });
  if (!response.ok) throw new Error("attachment");
  const { signedUrl } = await response.json();
  if (!signedUrl) throw new Error("attachment");
  return signedUrl;
}

export async function findPlannedExams(userId, dates) {
  if (!dates.length) return [];
  return requireData(await supabase.from("exams").select("exam_date,course_id,name").eq("user_id", userId).in("exam_date", dates)) || [];
}

// "Ajouter à mon planning": the exam lands on the reader's OWN course when
// one is linked (its color follows in Planning), never on the author's.
export async function addSharedExamToPlanning({ userId, courseId, name, examDate }) {
  if (isSharedExamPlanned(await findPlannedExams(userId, [examDate]), { examDate, courseId, name })) return { added: false };
  requireData(await supabase.from("exams").insert({ user_id: userId, course_id: courseId || null, name, exam_date: examDate }));
  return { added: true };
}
