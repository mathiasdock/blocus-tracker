export const TEXT_LIMITS = {
  postCaption: 500,
  comment: 500,
  directMessage: 1000,
  groupMessage: 1000,
  communityMessage: 1000,
  adminMessage: 1000,
  announcementTitle: 120,
  announcementMessage: 500,
  announcementHref: 300,
};

export const UPLOAD_LIMITS = {
  avatar: 3 * 1024 * 1024,
  postImage: 5 * 1024 * 1024,
  chatAttachment: 8 * 1024 * 1024,
  groupPhoto: 3 * 1024 * 1024,
};

export const FINAL_UPLOAD_LIMITS = {
  avatar: 400 * 1024,
  postImage: 1 * 1024 * 1024,
};

const CHAT_IMAGE_UPLOAD_LIMIT = 2 * 1024 * 1024;

export const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

export const SAFE_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

const actionBuckets = new Map();

function uploadLimitLabel(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  const mb = bytes / 1024 / 1024;
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} Mo`;
}

export function trimmedText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

export function sanitizeFileName(name) {
  const base = String(name || "file")
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 80);
  return base || "file";
}

export function validateUploadFile(file, kind = "chatAttachment") {
  if (!file) return { ok: false, errorKey: "security.fileMissing" };

  const type = String(file.type || "").toLowerCase();
  const imageOnly = kind === "avatar" || kind === "postImage" || kind === "groupPhoto";
  const allowed = imageOnly
    ? IMAGE_MIME_TYPES
    : new Set([...IMAGE_MIME_TYPES, ...SAFE_DOCUMENT_MIME_TYPES]);

  if (!allowed.has(type)) {
    return { ok: false, errorKey: "security.fileTypeBlocked" };
  }

  const baseMaxBytes = UPLOAD_LIMITS[kind] || UPLOAD_LIMITS.chatAttachment;
  const maxBytes = kind === "chatAttachment" && IMAGE_MIME_TYPES.has(type)
    ? Math.min(baseMaxBytes, CHAT_IMAGE_UPLOAD_LIMIT)
    : baseMaxBytes;
  if (file.size > maxBytes) {
    return {
      ok: false,
      errorKey: "security.fileTooLarge",
      maxMb: Math.round(maxBytes / 1024 / 1024),
    };
  }

  return { ok: true, type, extension: MIME_EXTENSIONS[type] || "bin" };
}

export function validateFinalUploadFile(file, kind) {
  if (!file) return { ok: false, errorKey: "security.fileMissing" };
  const maxBytes = FINAL_UPLOAD_LIMITS[kind];
  if (!maxBytes || file.size <= maxBytes) {
    return { ok: true };
  }
  return {
    ok: false,
    errorKey: "security.fileTooLargeAfterCompression",
    maxLabel: uploadLimitLabel(maxBytes),
  };
}

export function uploadErrorMessage(t, result) {
  if (!result || result.ok) return "";
  if (result.errorKey === "security.fileTooLarge") {
    return t("security.fileTooLarge").replace("{max}", String(result.maxMb || ""));
  }
  if (result.errorKey === "security.fileTooLargeAfterCompression") {
    return t("security.fileTooLargeAfterCompression").replace("{max}", result.maxLabel || "");
  }
  return t(result.errorKey || "security.fileTypeBlocked");
}

export function safeStoragePath(userId, file, extraSegments = [], kind = "chatAttachment") {
  const check = validateUploadFile(file, kind);
  if (!check.ok) return check;

  const randomPart =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const safeSegments = extraSegments
    .filter(Boolean)
    .map((part) => String(part).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80))
    .filter(Boolean);

  return {
    ok: true,
    path: [userId, ...safeSegments, `${Date.now()}-${randomPart}.${check.extension}`].join("/"),
    contentType: check.type,
  };
}

export function attachmentKind(file) {
  return String(file?.type || "").startsWith("image/") ? "image" : "file";
}

export function clientRateLimit(key, max, windowMs) {
  const now = Date.now();
  const bucket = actionBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    actionBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterMs: 0 };
  }
  if (bucket.count >= max) {
    return { ok: false, retryAfterMs: bucket.resetAt - now };
  }
  bucket.count += 1;
  return { ok: true, retryAfterMs: 0 };
}

export function isSafeInternalHref(href) {
  const value = String(href || "").trim();
  if (!value) return true;
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  if (/[\r\n]/.test(value)) return false;
  if (/^\/(?:api|_next)\b/i.test(value)) return false;
  return true;
}

export function storagePathFromReference(ref, bucket) {
  const value = String(ref || "");
  const prefix = `${bucket}:`;
  if (value.startsWith(prefix)) return value.slice(prefix.length);

  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = value.indexOf(marker);
  if (idx === -1) return null;
  try {
    return decodeURIComponent(value.slice(idx + marker.length));
  } catch {
    return value.slice(idx + marker.length);
  }
}
