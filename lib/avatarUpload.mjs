const MAX_AVATAR_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_AVATAR_UPLOAD_BYTES = 400 * 1024;

const SOURCE_EXTENSIONS = new Set(["avif", "heic", "heif", "jpeg", "jpg", "png", "webp"]);
const SOURCE_MIME_TYPES = new Set([
  "image/avif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const UPLOAD_MIME_EXTENSIONS = new Map([
  ["image/avif", "avif"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function fileExtension(file) {
  const match = String(file?.name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || "";
}

export function isHeicAvatar(file) {
  const type = String(file?.type || "").toLowerCase();
  const extension = fileExtension(file);
  return type === "image/heic" || type === "image/heif" || extension === "heic" || extension === "heif";
}

export function validateAvatarSourceFile(file) {
  if (!file) return { ok: false, errorKey: "security.fileMissing" };

  const type = String(file.type || "").toLowerCase();
  const extension = fileExtension(file);
  if (!SOURCE_MIME_TYPES.has(type) && !SOURCE_EXTENSIONS.has(extension)) {
    return { ok: false, errorKey: "profile.avatarUnsupported" };
  }
  if (file.size > MAX_AVATAR_SOURCE_BYTES) {
    return {
      ok: false,
      errorKey: "security.fileTooLarge",
      maxMb: MAX_AVATAR_SOURCE_BYTES / 1024 / 1024,
    };
  }
  return { ok: true };
}

export function validateProcessedAvatar(file) {
  if (!file) return { ok: false, errorKey: "profile.avatarProcessError" };
  const type = String(file.type || "").toLowerCase();
  if (!UPLOAD_MIME_EXTENSIONS.has(type)) {
    return { ok: false, errorKey: "profile.avatarProcessError" };
  }
  if (file.size > MAX_AVATAR_UPLOAD_BYTES) {
    return {
      ok: false,
      errorKey: "profile.avatarProcessError",
    };
  }
  return { ok: true, type, extension: UPLOAD_MIME_EXTENSIONS.get(type) };
}

export function avatarUploadErrorMessage(t, result) {
  const key = result?.errorKey || "profile.avatarUploadError";
  let message = t(key);
  if (key === "security.fileTooLarge") {
    message = message.replace("{max}", String(result.maxMb || ""));
  }
  if (key === "security.fileTooLargeAfterCompression") {
    message = message.replace("{max}", result.maxLabel || "");
  }
  return message;
}

export function avatarStoragePathFromUrl(reference) {
  const value = String(reference || "");
  if (value.startsWith("avatars:")) return value.slice("avatars:".length);

  try {
    const url = new URL(value);
    for (const visibility of ["public", "sign", "authenticated"]) {
      const marker = `/storage/v1/object/${visibility}/avatars/`;
      const index = url.pathname.indexOf(marker);
      if (index !== -1) return decodeURIComponent(url.pathname.slice(index + marker.length));
    }
  } catch {
    return null;
  }
  return null;
}

function createAvatarStoragePath(userId, file, now = Date.now()) {
  const check = validateProcessedAvatar(file);
  if (!check.ok) return check;

  const owner = String(userId || "");
  if (!owner || /[^a-zA-Z0-9_-]/.test(owner)) {
    return { ok: false, errorKey: "profile.avatarSaveError" };
  }
  const randomPart = globalThis.crypto?.randomUUID?.()
    || `${now}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    ok: true,
    contentType: check.type,
    path: `${owner}/avatars/${now}-${randomPart}.${check.extension}`,
  };
}

async function removeUploadedFile(storage, path) {
  if (!path) return;
  try {
    await storage.remove([path]);
  } catch {
    // Best effort rollback: the visible profile remains on its previous avatar.
  }
}

async function processAvatarWithTimeout(processImage, sourceFile, timeoutMs) {
  let timeoutId;
  try {
    return await Promise.race([
      processImage(sourceFile),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Avatar processing timed out")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function uploadProfileAvatar({
  client,
  userId,
  sourceFile,
  previousAvatarUrl,
  processImage,
  processingTimeoutMs = 30_000,
}) {
  const sourceCheck = validateAvatarSourceFile(sourceFile);
  if (!sourceCheck.ok) return sourceCheck;

  let processedFile;
  try {
    const result = await processAvatarWithTimeout(processImage, sourceFile, processingTimeoutMs);
    processedFile = result?.file;
  } catch {
    return { ok: false, errorKey: "profile.avatarProcessError" };
  }

  const pathInfo = createAvatarStoragePath(userId, processedFile);
  if (!pathInfo.ok) return pathInfo;

  let storage;
  try {
    storage = client.storage.from("avatars");
  } catch {
    return { ok: false, errorKey: "profile.avatarUploadError" };
  }
  try {
    const { error } = await storage.upload(pathInfo.path, processedFile, {
      cacheControl: "31536000",
      contentType: pathInfo.contentType,
      upsert: false,
    });
    if (error) return { ok: false, errorKey: "profile.avatarUploadError" };
  } catch {
    return { ok: false, errorKey: "profile.avatarUploadError" };
  }

  let publicUrl;
  try {
    const { data } = storage.getPublicUrl(pathInfo.path);
    publicUrl = data?.publicUrl;
  } catch {
    await removeUploadedFile(storage, pathInfo.path);
    return { ok: false, errorKey: "profile.avatarSaveError" };
  }
  if (!publicUrl) {
    await removeUploadedFile(storage, pathInfo.path);
    return { ok: false, errorKey: "profile.avatarSaveError" };
  }

  try {
    const { data, error } = await client
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("id", userId)
      .select("avatar_url")
      .single();
    if (error || data?.avatar_url !== publicUrl) {
      await removeUploadedFile(storage, pathInfo.path);
      return { ok: false, errorKey: "profile.avatarSaveError" };
    }
  } catch {
    await removeUploadedFile(storage, pathInfo.path);
    return { ok: false, errorKey: "profile.avatarSaveError" };
  }

  const previousPath = avatarStoragePathFromUrl(previousAvatarUrl);
  if (previousPath && previousPath !== pathInfo.path && previousPath.startsWith(`${userId}/`)) {
    await removeUploadedFile(storage, previousPath);
  }

  return { ok: true, publicUrl, path: pathInfo.path };
}

export const AVATAR_UPLOAD_LIMITS = {
  sourceBytes: MAX_AVATAR_SOURCE_BYTES,
  uploadBytes: MAX_AVATAR_UPLOAD_BYTES,
};
