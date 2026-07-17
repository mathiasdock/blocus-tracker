import { createClient } from "@supabase/supabase-js";
import { getBearerToken, getClientIp, requireJson, setBaseSecurityHeaders } from "../../../lib/apiSecurity";
import { rateLimit } from "../../../lib/rateLimit";
import { storagePathFromReference } from "../../../lib/security";

export const config = {
  api: {
    bodyParser: { sizeLimit: "8kb" },
  },
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SIGNABLE_BUCKETS = new Set(["dm", "posts", "group"]);

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

async function userCanAccessPostImage(admin, userId, path, originalRef) {
  const post = await findReferencedRow(
    admin,
    "posts",
    "id, user_id, visibility",
    "image_url",
    referenceVariants("posts", path, originalRef)
  );
  if (!post || !pathBelongsTo(path, post.user_id)) return false;
  if (post.user_id === userId || !post.visibility || post.visibility === "public") return true;
  if (post.visibility !== "friends") return false;

  const { data, error } = await admin
    .from("friendships")
    .select("id")
    .eq("status", "accepted")
    .or(
      `and(requester.eq.${userId},addressee.eq.${post.user_id}),and(requester.eq.${post.user_id},addressee.eq.${userId})`
    )
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
  if (!message || !pathBelongsTo(path, message.user_id)) return false;

  const { data, error } = await admin
    .from("group_members")
    .select("id")
    .eq("group_id", message.group_id)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  return !error && !!data?.id;
}

async function canAccessAttachment(admin, bucket, userId, path, originalRef) {
  if (bucket === "dm") return userCanAccessDmAttachment(admin, userId, path, originalRef);
  if (bucket === "posts") return userCanAccessPostImage(admin, userId, path, originalRef);
  if (bucket === "group") return userCanAccessGroupAttachment(admin, userId, path, originalRef);
  return false;
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

  const allowed = await canAccessAttachment(admin, bucket, userId, path, ref);
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
