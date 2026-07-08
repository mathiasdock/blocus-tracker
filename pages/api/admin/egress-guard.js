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

const BUCKETS = ["posts", "avatars", "dm", "community"];
const ROW_LIMIT = 10000;
const STORAGE_PAGE_SIZE = 1000;
const MAX_FILES_PER_BUCKET = 2500;
const MAX_FOLDERS_PER_BUCKET = 400;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const KB = 1024;
const MB = 1024 * 1024;

function cleanPath(path) {
  if (typeof path !== "string") return null;
  const cleaned = path.replace(/^\/+/, "");
  if (!cleaned || cleaned.includes("..")) return null;
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

function percentile(values, pct) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] || 0;
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

function bucketSummary(bucket, files, references, referencesComplete) {
  const sizes = files.map((file) => file.sizeBytes || 0);
  const totalBytes = sizes.reduce((sum, size) => sum + size, 0);
  const recentCutoff = Date.now() - ONE_DAY_MS;
  const orphanCount = referencesComplete
    ? files.filter((file) => !references.has(file.path)).length
    : null;

  return {
    bucket,
    count: files.length,
    totalBytes,
    averageBytes: files.length ? Math.round(totalBytes / files.length) : 0,
    p90Bytes: percentile(sizes, 90),
    maxBytes: Math.max(0, ...sizes),
    over500Kb: files.filter((file) => file.sizeBytes > 500 * KB).length,
    over1Mb: files.filter((file) => file.sizeBytes > MB).length,
    recent24h: files.filter((file) => {
      const stamp = file.createdAt || file.updatedAt;
      return stamp && new Date(stamp).getTime() >= recentCutoff;
    }).length,
    orphanCount,
    referencesComplete,
  };
}

function statusForObject(file, references, referencesComplete) {
  if (!referencesComplete) return references.has(file.path) ? "referenced" : "unknown";
  return references.has(file.path) ? "referenced" : "orphan";
}

export default async function handler(req, res) {
  setBaseSecurityHeaders(res);

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = getClientIp(req);
  const limited = rateLimit(`admin-egress-guard:${ip}`, 10, 60_000);
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
    console.warn("admin/egress-guard forbidden", { user: `${userId.slice(0, 8)}...` });
    return res.status(403).json({ error: "Forbidden" });
  }

  const now = Date.now();
  const cutoffIso = new Date(now - ONE_DAY_MS).toISOString();
  const warnings = [];

  const [
    activePostsCount,
    expiredPostsCount,
    postsRes,
    profilesRes,
    dmRes,
    groupRes,
    communityRes,
    ...storageResults
  ] = await Promise.all([
    admin.from("posts").select("id", { count: "exact", head: true }).gte("created_at", cutoffIso),
    admin.from("posts").select("id", { count: "exact", head: true }).lt("created_at", cutoffIso),
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

  for (const result of [activePostsCount, expiredPostsCount, postsRes, profilesRes, dmRes, groupRes, communityRes]) {
    if (result.error) warnings.push(result.error.message);
  }

  const posts = postsRes.data || [];
  const profiles = profilesRes.data || [];
  const dmMessages = dmRes.data || [];
  const groupMessages = groupRes.data || [];
  const communityMessages = communityRes.data || [];

  const references = {
    posts: new Set(posts.map((post) => storagePathFromValue(post.image_url, "posts")).filter(Boolean)),
    avatars: new Set(profiles.map((profile) => storagePathFromValue(profile.avatar_url, "avatars")).filter(Boolean)),
    dm: new Set(dmMessages.map((message) => storagePathFromValue(message.attachment_url, "dm")).filter(Boolean)),
    community: new Set([
      ...groupMessages.map((message) => storagePathFromValue(message.attachment_url, "community")),
      ...communityMessages.map((message) => storagePathFromValue(message.attachment_url, "community")),
    ].filter(Boolean)),
  };

  const referenceScanComplete = {
    posts: posts.length < ROW_LIMIT,
    avatars: profiles.length < ROW_LIMIT,
    dm: dmMessages.length < ROW_LIMIT,
    community: groupMessages.length < ROW_LIMIT && communityMessages.length < ROW_LIMIT,
  };

  const bucketFiles = {};
  const bucketTruncated = {};
  storageResults.forEach((result, index) => {
    const bucket = BUCKETS[index];
    bucketFiles[bucket] = result.files || [];
    bucketTruncated[bucket] = !!result.truncated;
    warnings.push(...(result.warnings || []));
  });

  const activeWithImage = posts.filter((post) =>
    post.created_at >= cutoffIso && storagePathFromValue(post.image_url, "posts")
  ).length;
  const expiredWithImage = posts.filter((post) =>
    post.created_at < cutoffIso && storagePathFromValue(post.image_url, "posts")
  ).length;

  const buckets = Object.fromEntries(BUCKETS.map((bucket) => [
    bucket,
    {
      ...bucketSummary(bucket, bucketFiles[bucket] || [], references[bucket], referenceScanComplete[bucket]),
      truncated: bucketTruncated[bucket],
      referencedCount: references[bucket].size,
    },
  ]));

  const allFiles = BUCKETS.flatMap((bucket) =>
    (bucketFiles[bucket] || []).map((file) => ({
      ...file,
      status: statusForObject(file, references[bucket], referenceScanComplete[bucket]),
    }))
  );

  const over500Kb = allFiles.filter((file) => file.sizeBytes > 500 * KB).length;
  const over1Mb = allFiles.filter((file) => file.sizeBytes > MB).length;

  return res.status(200).json({
    generatedAt: new Date().toISOString(),
    limits: {
      rowLimit: ROW_LIMIT,
      maxFilesPerBucket: MAX_FILES_PER_BUCKET,
      storagePageSize: STORAGE_PAGE_SIZE,
    },
    scan: {
      warnings: [...new Set(warnings.filter(Boolean))],
      referenceScanComplete,
    },
    posts: {
      active: activePostsCount.count ?? 0,
      expired: expiredPostsCount.count ?? 0,
      activeWithImage,
      expiredWithImage,
      scanned: posts.length,
      complete: posts.length < ROW_LIMIT,
    },
    buckets,
    heavy: {
      over500Kb,
      over1Mb,
      top: allFiles
        .sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0))
        .slice(0, 10)
        .map((file) => ({
          bucket: file.bucket,
          path: file.path,
          sizeBytes: file.sizeBytes,
          contentType: file.contentType,
          updatedAt: file.updatedAt,
          status: file.status,
        })),
    },
  });
}
