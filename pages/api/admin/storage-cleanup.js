import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { getBearerToken, getClientIp, requireJson, setBaseSecurityHeaders } from "../../../lib/apiSecurity";
import { rateLimit } from "../../../lib/rateLimit";

export const config = {
  api: {
    bodyParser: { sizeLimit: "24kb" },
  },
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const BUCKETS = ["posts", "avatars", "community", "dm"];
const DELETABLE_BUCKETS = new Set(["posts", "avatars", "community"]);
const DELETABLE_CATEGORIES = new Set([
  "post_expired_48h",
  "posts_orphan",
  "avatar_orphan",
  "community_image_orphan",
]);
const ROW_LIMIT = 10000;
const STORAGE_PAGE_SIZE = 1000;
const MAX_FILES_PER_BUCKET = 2500;
const MAX_FOLDERS_PER_BUCKET = 400;
const MAX_DELETE_IDS = 100;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const POST_EXPIRY_MS = 48 * 60 * 60 * 1000;

function cleanPath(path) {
  if (typeof path !== "string") return null;
  const cleaned = path.replace(/^\/+/, "");
  if (!cleaned || cleaned.length > 500 || cleaned.includes("..") || cleaned.includes("\\")) return null;
  return cleaned;
}

function decodePath(path) {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function storagePathFromValue(value, bucket) {
  if (typeof value !== "string" || !value || value.startsWith("data:")) return null;
  if (value.startsWith(`${bucket}:`)) return cleanPath(value.slice(bucket.length + 1));
  if (bucket === "dm" && value.startsWith("dm:")) return cleanPath(value.slice(3));

  try {
    const url = new URL(value);
    for (const visibility of ["public", "sign"]) {
      const marker = `/storage/v1/object/${visibility}/${bucket}/`;
      const index = url.pathname.indexOf(marker);
      if (index >= 0) {
        return cleanPath(decodePath(url.pathname.slice(index + marker.length)));
      }
    }
  } catch {
    return null;
  }

  return null;
}

function objectSize(item) {
  const raw = item?.metadata?.size ?? item?.metadata?.contentLength ?? item?.metadata?.content_length ?? 0;
  const size = Number(raw);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

function objectType(item) {
  return item?.metadata?.mimetype || item?.metadata?.mimeType || item?.metadata?.contentType || item?.metadata?.content_type || null;
}

function isImageFile(file) {
  if (typeof file.contentType === "string" && file.contentType.toLowerCase().startsWith("image/")) return true;
  return /\.(avif|webp|jpe?g|png|gif)$/i.test(file.path || "");
}

function candidateId(candidate) {
  return crypto
    .createHmac("sha256", SERVICE_ROLE_KEY)
    .update([candidate.bucket, candidate.path, candidate.category, candidate.reasonKey].join("\n"))
    .digest("hex")
    .slice(0, 32);
}

function toPublicCandidate(candidate) {
  return {
    id: candidate.id,
    bucket: candidate.bucket,
    path: candidate.path,
    sizeBytes: candidate.sizeBytes,
    reasonKey: candidate.reasonKey,
    safeDelete: candidate.safeDelete,
    category: candidate.category,
    updatedAt: candidate.updatedAt,
  };
}

function summarize(candidates) {
  const safe = candidates.filter((candidate) => candidate.safeDelete);
  return {
    candidateCount: candidates.length,
    safeCount: safe.length,
    blockedCount: candidates.length - safe.length,
    previewSizeBytes: candidates.reduce((sum, candidate) => sum + (candidate.sizeBytes || 0), 0),
    safeSizeBytes: safe.reduce((sum, candidate) => sum + (candidate.sizeBytes || 0), 0),
    dmPreviewCount: candidates.filter((candidate) => candidate.bucket === "dm").length,
  };
}

async function requireAdmin(req, res) {
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Server misconfigured" });
    return null;
  }

  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userError || !userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile?.is_admin) {
    console.warn("admin/storage-cleanup forbidden", { user: `${userId.slice(0, 8)}...` });
    res.status(403).json({ error: "Forbidden" });
    return null;
  }

  return { admin, userId };
}

async function listBucketFiles(admin, bucket) {
  const files = [];
  const folders = [""];
  const warnings = [];
  let folderCount = 0;
  let truncated = false;

  while (folders.length && files.length < MAX_FILES_PER_BUCKET && folderCount < MAX_FOLDERS_PER_BUCKET) {
    const folder = folders.shift();
    folderCount += 1;
    let offset = 0;

    while (files.length < MAX_FILES_PER_BUCKET) {
      const { data, error } = await admin.storage.from(bucket).list(folder, {
        limit: STORAGE_PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

      if (error) {
        warnings.push(error.message || `Could not list ${bucket}`);
        break;
      }

      for (const item of data || []) {
        if (!item?.name) continue;
        const path = folder ? `${folder}/${item.name}` : item.name;
        const isFolder = !item.metadata && !item.id;
        if (isFolder) {
          folders.push(path);
        } else {
          files.push({
            bucket,
            path,
            sizeBytes: objectSize(item),
            contentType: objectType(item),
            createdAt: item.created_at || null,
            updatedAt: item.updated_at || item.last_accessed_at || null,
          });
        }
        if (files.length >= MAX_FILES_PER_BUCKET) break;
      }

      if (!data || data.length < STORAGE_PAGE_SIZE) break;
      offset += STORAGE_PAGE_SIZE;
    }
  }

  if (files.length >= MAX_FILES_PER_BUCKET || folderCount >= MAX_FOLDERS_PER_BUCKET || folders.length) {
    truncated = true;
    warnings.push(`Scan truncated for bucket ${bucket}`);
  }

  return { files, truncated, warnings };
}

function addCandidate(candidates, file, category, reasonKey, safeDelete) {
  const path = cleanPath(file.path);
  if (!path) return;
  const candidate = {
    bucket: file.bucket,
    path,
    sizeBytes: file.sizeBytes || 0,
    category,
    reasonKey,
    safeDelete,
    updatedAt: file.updatedAt || file.createdAt || null,
  };
  candidate.id = candidateId(candidate);
  candidates.push(candidate);
}

async function scanCleanupCandidates(admin) {
  const now = Date.now();
  const cutoff48Iso = new Date(now - POST_EXPIRY_MS).toISOString();
  const warnings = [];

  const [
    postsRes,
    profilesRes,
    dmRes,
    groupRes,
    communityRes,
    ...storageResults
  ] = await Promise.all([
    admin.from("posts").select("id, image_url, created_at").order("created_at", { ascending: false }).limit(ROW_LIMIT),
    admin.from("profiles").select("id, avatar_url").not("avatar_url", "is", null).limit(ROW_LIMIT),
    admin.from("private_messages").select("id, attachment_url").not("attachment_url", "is", null).limit(ROW_LIMIT),
    admin.from("group_messages").select("id, attachment_url").not("attachment_url", "is", null).limit(ROW_LIMIT),
    admin.from("community_messages").select("id, attachment_url").not("attachment_url", "is", null).limit(ROW_LIMIT),
    ...BUCKETS.map((bucket) => listBucketFiles(admin, bucket).catch((error) => ({
      files: [],
      truncated: true,
      warnings: [error?.message || `Could not list ${bucket}`],
    }))),
  ]);

  for (const result of [postsRes, profilesRes, dmRes, groupRes, communityRes]) {
    if (result.error) warnings.push(result.error.message);
  }

  const posts = postsRes.data || [];
  const profiles = profilesRes.data || [];
  const dmMessages = dmRes.data || [];
  const groupMessages = groupRes.data || [];
  const communityMessages = communityRes.data || [];

  const postRefs = new Map();
  for (const post of posts) {
    const path = storagePathFromValue(post.image_url, "posts");
    if (!path) continue;
    const refs = postRefs.get(path) || [];
    refs.push({ id: post.id, createdAt: post.created_at });
    postRefs.set(path, refs);
  }

  const avatarRefs = new Set(profiles.map((profile) => storagePathFromValue(profile.avatar_url, "avatars")).filter(Boolean));
  const dmRefs = new Set(dmMessages.map((message) => storagePathFromValue(message.attachment_url, "dm")).filter(Boolean));
  const communityRefs = new Set([
    ...groupMessages.map((message) => storagePathFromValue(message.attachment_url, "community")),
    ...communityMessages.map((message) => storagePathFromValue(message.attachment_url, "community")),
  ].filter(Boolean));

  const bucketFiles = {};
  storageResults.forEach((result, index) => {
    const bucket = BUCKETS[index];
    bucketFiles[bucket] = result.files || [];
    warnings.push(...(result.warnings || []));
  });

  const candidates = [];

  for (const file of bucketFiles.posts || []) {
    const refs = postRefs.get(file.path) || [];
    if (!refs.length) {
      addCandidate(candidates, file, "posts_orphan", "admin.cleanupReasonPostsOrphan", true);
      continue;
    }
    const onlyExpired48h = refs.every((ref) => ref.createdAt && ref.createdAt < cutoff48Iso);
    if (onlyExpired48h) {
      addCandidate(candidates, file, "post_expired_48h", "admin.cleanupReasonPostExpired", true);
    }
  }

  for (const file of bucketFiles.avatars || []) {
    if (!avatarRefs.has(file.path)) {
      addCandidate(candidates, file, "avatar_orphan", "admin.cleanupReasonAvatarOrphan", true);
    }
  }

  for (const file of bucketFiles.community || []) {
    if (!communityRefs.has(file.path) && isImageFile(file)) {
      addCandidate(candidates, file, "community_image_orphan", "admin.cleanupReasonCommunityOrphan", true);
    }
  }

  for (const file of bucketFiles.dm || []) {
    if (!dmRefs.has(file.path)) {
      addCandidate(candidates, file, "dm_manual_only", "admin.cleanupReasonDmManual", false);
    }
  }

  candidates.sort((a, b) => {
    if (a.safeDelete !== b.safeDelete) return a.safeDelete ? -1 : 1;
    return (b.sizeBytes || 0) - (a.sizeBytes || 0);
  });

  return {
    generatedAt: new Date().toISOString(),
    candidates,
    summary: summarize(candidates),
    warnings: [...new Set(warnings.filter(Boolean))],
    limits: {
      rowLimit: ROW_LIMIT,
      maxFilesPerBucket: MAX_FILES_PER_BUCKET,
      maxDeleteIds: MAX_DELETE_IDS,
    },
  };
}

function isDeletableCandidate(candidate) {
  return (
    candidate?.safeDelete === true &&
    DELETABLE_BUCKETS.has(candidate.bucket) &&
    DELETABLE_CATEGORIES.has(candidate.category) &&
    cleanPath(candidate.path) === candidate.path
  );
}

async function handleScan(admin, res) {
  const scan = await scanCleanupCandidates(admin);
  return res.status(200).json({
    ...scan,
    candidates: scan.candidates.map(toPublicCandidate),
  });
}

async function handleDelete(admin, userId, req, res) {
  if (!requireJson(req, res)) return;
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_DELETE_IDS || ids.some((id) => typeof id !== "string" || !/^[a-f0-9]{32}$/.test(id))) {
    return res.status(400).json({ error: "Invalid cleanup selection" });
  }

  const scan = await scanCleanupCandidates(admin);
  const byId = new Map(scan.candidates.map((candidate) => [candidate.id, candidate]));
  const selected = [...new Set(ids)].map((id) => byId.get(id)).filter(Boolean);
  const safe = selected.filter(isDeletableCandidate);
  const skipped = selected.length - safe.length + ids.length - selected.length;

  if (!safe.length) {
    return res.status(400).json({ error: "No safe cleanup candidate selected" });
  }

  const deleted = [];
  const errors = [];
  const byBucket = new Map();
  for (const candidate of safe) {
    const list = byBucket.get(candidate.bucket) || [];
    list.push(candidate);
    byBucket.set(candidate.bucket, list);
  }

  for (const [bucket, candidates] of byBucket.entries()) {
    const paths = candidates.map((candidate) => candidate.path);
    const { data, error } = await admin.storage.from(bucket).remove(paths);
    if (error) {
      errors.push({ bucket, message: error.message, count: paths.length });
      continue;
    }
    const removedPaths = new Set((data || []).map((item) => item.name).filter(Boolean));
    for (const candidate of candidates) {
      deleted.push({
        bucket,
        path: candidate.path,
        sizeBytes: candidate.sizeBytes,
        reasonKey: candidate.reasonKey,
        confirmed: removedPaths.size ? removedPaths.has(candidate.path.split("/").pop()) || removedPaths.has(candidate.path) : true,
      });
    }
  }

  const deletedBytes = deleted.reduce((sum, item) => sum + (item.sizeBytes || 0), 0);
  console.info("admin/storage-cleanup completed", {
    user: `${userId.slice(0, 8)}...`,
    deleted: deleted.length,
    deletedBytes,
    errors: errors.length,
  });

  return res.status(200).json({
    deletedCount: deleted.length,
    deletedBytes,
    skippedCount: skipped,
    errors,
    deleted: deleted.map((item) => ({
      bucket: item.bucket,
      path: item.path,
      sizeBytes: item.sizeBytes,
      reasonKey: item.reasonKey,
    })),
  });
}

export default async function handler(req, res) {
  setBaseSecurityHeaders(res);

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = getClientIp(req);
  const limited = rateLimit(`admin-storage-cleanup:${ip}`, req.method === "GET" ? 10 : 4, 60_000);
  if (!limited.ok) {
    return res.status(429).json({ error: "Too many requests" });
  }

  const ctx = await requireAdmin(req, res);
  if (!ctx) return;

  if (req.method === "GET") return handleScan(ctx.admin, res);
  return handleDelete(ctx.admin, ctx.userId, req, res);
}
