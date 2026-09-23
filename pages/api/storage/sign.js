import { createClient } from "@supabase/supabase-js";
import { getBearerToken, getClientIp, requireJson, setBaseSecurityHeaders } from "../../../lib/apiSecurity";
import { rateLimit } from "../../../lib/rateLimit";
import { storagePathFromReference } from "../../../lib/security";
import { isUuid } from "../../../lib/adminModeration.mjs";
import { logAdminAction, requireAdmin } from "../../../lib/server/adminAuth";

export const config = {
  api: {
    bodyParser: { sizeLimit: "8kb" },
  },
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SIGNABLE_BUCKETS = new Set(["dm", "posts", "group", "community"]);

function publicUrlFor(bucket, path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function referenceVariants(bucket, path, originalRef) {
  return [...new Set([originalRef, `${bucket}:${path}`, publicUrlFor(bucket, path)].filter(Boolean))];
}

function pathBelongsTo(path, ownerId) {
  return path.split("/")[0] === ownerId;
}

async function findReferencedRow(admin, table, columns, field, refs) {
  for (const ref of refs) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .eq(field, ref)
      .limit(1)
      .maybeSingle();

    if (error) return null;
    if (data) return data;
  }
  return null;
}

async function userCanAccessDmAttachment(admin, userId, path, originalRef) {
  const message = await findReferencedRow(
    admin,
    "private_messages",
    "id, sender_id, receiver_id",
    "attachment_url",
    referenceVariants("dm", path, originalRef)
  );

  return !!message
    && pathBelongsTo(path, message.sender_id)
    && (message.sender_id === userId || message.receiver_id === userId);
}

// A feed photo is readable exactly when its post is: the check runs AS THE
// STUDENT, so the posts_read policy decides — audience (public / friends),
// blocks in either direction, and a suspended author (v57), whose posts are
// hidden from everyone else.
async function userCanAccessPostImage(admin, path, originalRef, userScoped) {
  const post = await findReferencedRow(
    admin,
    "posts",
    "id, user_id",
    "image_url",
    referenceVariants("posts", path, originalRef)
  );
  if (!post || !pathBelongsTo(path, post.user_id)) return false;

  const { data, error } = await userScoped
    .from("posts")
    .select("id")
    .eq("id", post.id)
    .limit(1)
    .maybeSingle();
  return !error && !!data?.id;
}

async function userCanAccessGroupAttachment(admin, userId, path, originalRef) {
  const message = await findReferencedRow(
    admin,
    "group_messages",
    "id, user_id, group_id",
    "attachment_url",
    referenceVariants("group", path, originalRef)
  );
  if (message && pathBelongsTo(path, message.user_id)) {
    const { data, error } = await admin
      .from("group_members")
      .select("id")
      .eq("group_id", message.group_id)
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    return !error && !!data?.id;
  }

  return userCanAccessGroupPhoto(admin, userId, "group", path, originalRef);
}

async function userCanAccessGroupPhoto(admin, userId, bucket, path, originalRef) {
  const group = await findReferencedRow(
    admin,
    "study_groups",
    "id, created_by",
    "photo_url",
    referenceVariants(bucket, path, originalRef)
  );
  // The creator can change after the succession trigger runs, while the
  // existing photo remains stored under the previous creator's folder. The
  // exact study_groups.photo_url relationship is therefore the authority.
  if (!group) return false;

  const { data, error } = await admin
    .from("group_members")
    .select("id")
    .eq("group_id", group.id)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  return !error && !!data?.id;
}

// A course-room attachment is readable exactly when its message is: the
// check runs AS THE STUDENT, so the community_messages RLS decides — room
// members and the author; never a hidden message, a blocked or suspended
// author or a retired academic-space post of someone else. Admins no longer
// read rooms (v59): they open a reported attachment through the separate
// report path below. Before course spaces, any signed-in account could sign
// any community file.
async function userCanAccessCommunityAttachment(admin, userId, path, originalRef, userScoped) {
  const message = await findReferencedRow(
    admin,
    "community_messages",
    "id, user_id",
    "attachment_url",
    referenceVariants("community", path, originalRef)
  );
  if (message && pathBelongsTo(path, message.user_id)) {
    const { data, error } = await userScoped
      .from("community_messages")
      .select("id")
      .eq("id", message.id)
      .limit(1)
      .maybeSingle();
    return !error && !!data?.id;
  }

  // Older versions stored private group photos in the community bucket.
  return userCanAccessGroupPhoto(admin, userId, "community", path, originalRef);
}

async function canAccessAttachment(admin, bucket, userId, path, originalRef, userScoped) {
  if (bucket === "dm") return userCanAccessDmAttachment(admin, userId, path, originalRef);
  if (bucket === "posts") return userCanAccessPostImage(admin, path, originalRef, userScoped);
  if (bucket === "group") return userCanAccessGroupAttachment(admin, userId, path, originalRef);
  if (bucket === "community") return userCanAccessCommunityAttachment(admin, userId, path, originalRef, userScoped);
  return false;
}

// Moderation of a reported course-room message (v59): an admin may open the
// attachment of a message that has an OPEN report — and only that one, not
// the rest of the room. Each opening is written to the audit log.
async function signReportedAttachment(req, res, messageId) {
  if (!isUuid(messageId)) return res.status(400).json({ error: "Invalid file reference" });

  const ctx = await requireAdmin(req, res, "storage/sign report");
  if (!ctx) return undefined;

  const { data: report, error: reportError } = await ctx.admin
    .from("course_message_reports")
    .select("message_id")
    .eq("message_id", messageId)
    .is("resolved_at", null)
    .limit(1)
    .maybeSingle();
  if (reportError || !report) return res.status(403).json({ error: "Forbidden" });

  const { data: message, error: messageError } = await ctx.admin
    .from("community_messages")
    .select("id, user_id, attachment_url")
    .eq("id", messageId)
    .not("room_id", "is", null)
    .maybeSingle();
  if (messageError || !message?.attachment_url) return res.status(404).json({ error: "No attachment" });

  const path = storagePathFromReference(message.attachment_url, "community");
  if (!path || path.includes("..") || !pathBelongsTo(path, message.user_id)) {
    return res.status(404).json({ error: "No attachment" });
  }

  await logAdminAction(ctx.admin, ctx.userId, "report_attachment_viewed", {
    targetUserId: message.user_id, targetType: "community_message", targetId: messageId,
  });

  const { data, error } = await ctx.admin.storage.from("community").createSignedUrl(path, 5 * 60);
  if (error || !data?.signedUrl) return res.status(500).json({ error: "Could not sign file" });
  return res.status(200).json({ signedUrl: data.signedUrl });
}

export default async function handler(req, res) {
  setBaseSecurityHeaders(res);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!requireJson(req, res)) return;

  const ip = getClientIp(req);
  const limited = rateLimit(`storage-sign:${ip}`, 60, 60_000);
  if (!limited.ok) {
    return res.status(429).json({ error: "Too many requests" });
  }

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.body?.reportMessageId !== undefined) {
    return signReportedAttachment(req, res, req.body.reportMessageId);
  }

  const { bucket, ref } = req.body || {};
  if (!SIGNABLE_BUCKETS.has(bucket) || typeof ref !== "string" || ref.length > 500) {
    return res.status(400).json({ error: "Invalid file reference" });
  }

  const path = storagePathFromReference(ref, bucket);
  if (
    !path
    || path.length > 400
    || path.includes("..")
    || path.includes("\\")
    || path.startsWith("/")
    || !/^[0-9a-f-]{36}\//i.test(path)
  ) {
    return res.status(400).json({ error: "Invalid file reference" });
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

  const userScoped = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const allowed = await canAccessAttachment(admin, bucket, userId, path, ref, userScoped);
  if (!allowed) {
    console.warn("storage/sign forbidden attachment request", {
      user: `${userId.slice(0, 8)}...`,
      bucket,
    });
    return res.status(403).json({ error: "Forbidden" });
  }

  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, 5 * 60);
  if (error || !data?.signedUrl) {
    console.warn("storage/sign failed", { bucket, code: error?.statusCode || null });
    return res.status(500).json({ error: "Could not sign file" });
  }

  return res.status(200).json({ signedUrl: data.signedUrl });
}
