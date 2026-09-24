import test from "node:test";
import assert from "node:assert/strict";
import {
  avatarStoragePathFromUrl,
  uploadProfileAvatar,
  validateAvatarSourceFile,
} from "../lib/avatarUpload.mjs";

const USER_ID = "user-1";

function fileLike(name, type, size) {
  return { name, type, size, lastModified: 1 };
}

function fakeClient({ uploadError = null, saveError = null, publicUrl = null, storageFromThrows = false } = {}) {
  const calls = { uploads: [], removals: [], profileUpdates: [] };
  let savedAvatarUrl = "https://example.test/storage/v1/object/public/avatars/user-1/avatars/old.webp";

  const storage = {
    async upload(path, file, options) {
      calls.uploads.push({ path, file, options });
      return { data: uploadError ? null : { path }, error: uploadError };
    },
    async remove(paths) {
      calls.removals.push(paths);
      return { data: paths, error: null };
    },
    getPublicUrl(path) {
      return { data: { publicUrl: publicUrl || `https://cdn.test/storage/v1/object/public/avatars/${path}` } };
    },
  };

  const client = {
    storage: {
      from: () => {
        if (storageFromThrows) throw new Error("Storage unavailable");
        return storage;
      },
    },
    from() {
      const query = {
        update(payload) {
          calls.profileUpdates.push(payload);
          if (!saveError) savedAvatarUrl = payload.avatar_url;
          return query;
        },
        eq() { return query; },
        select() { return query; },
        async single() {
          return {
            data: saveError ? null : { avatar_url: savedAvatarUrl },
            error: saveError,
          };
        },
      };
      return query;
    },
  };

  return {
    calls,
    client,
    reload: () => ({ avatar_url: savedAvatarUrl }),
  };
}

test("common iPhone JPEG and HEIC source files reach processing", () => {
  assert.deepEqual(validateAvatarSourceFile(fileLike("IMG_0001.JPG", "image/jpeg", 4 * 1024 * 1024)), { ok: true });
  assert.deepEqual(validateAvatarSourceFile(fileLike("IMG_0002.HEIC", "image/heic", 6 * 1024 * 1024)), { ok: true });
  assert.deepEqual(validateAvatarSourceFile(fileLike("IMG_0003.heif", "", 2 * 1024 * 1024)), { ok: true });
});

test("oversized and non-image source files fail before processing", () => {
  assert.equal(validateAvatarSourceFile(fileLike("huge.jpg", "image/jpeg", 16 * 1024 * 1024)).errorKey, "security.fileTooLarge");
  assert.equal(validateAvatarSourceFile(fileLike("notes.pdf", "application/pdf", 1000)).errorKey, "profile.avatarUnsupported");
});

test("choose → process → upload → save → reload preserves the avatar", async () => {
  const { calls, client, reload } = fakeClient();
  const source = fileLike("IMG_0001.HEIC", "image/heic", 5 * 1024 * 1024);
  const processed = fileLike("IMG_0001.webp", "image/webp", 120 * 1024);

  const result = await uploadProfileAvatar({
    client,
    userId: USER_ID,
    sourceFile: source,
    previousAvatarUrl: "https://example.test/storage/v1/object/public/avatars/user-1/avatars/old.webp",
    processImage: async () => ({ file: processed, optimized: true }),
  });

  assert.equal(result.ok, true);
  assert.equal(calls.uploads.length, 1);
  assert.equal(calls.uploads[0].options.upsert, false);
  assert.equal(calls.uploads[0].options.contentType, "image/webp");
  assert.match(calls.uploads[0].path, /^user-1\/avatars\/.+\.webp$/);
  assert.equal(calls.profileUpdates[0].avatar_url, result.publicUrl);
  assert.equal(reload().avatar_url, result.publicUrl);
  assert.deepEqual(calls.removals, [["user-1/avatars/old.webp"]]);
});

test("an upload failure keeps the existing profile untouched", async () => {
  const { calls, client, reload } = fakeClient({ uploadError: { message: "network" } });
  const previous = reload().avatar_url;
  const result = await uploadProfileAvatar({
    client,
    userId: USER_ID,
    sourceFile: fileLike("photo.jpg", "image/jpeg", 500_000),
    previousAvatarUrl: previous,
    processImage: async () => ({ file: fileLike("photo.webp", "image/webp", 100_000) }),
  });

  assert.equal(result.errorKey, "profile.avatarUploadError");
  assert.equal(calls.profileUpdates.length, 0);
  assert.equal(reload().avatar_url, previous);
});

test("an unavailable Storage client returns an explicit upload error", async () => {
  const { calls, client } = fakeClient({ storageFromThrows: true });
  const result = await uploadProfileAvatar({
    client,
    userId: USER_ID,
    sourceFile: fileLike("photo.jpg", "image/jpeg", 500_000),
    processImage: async () => ({ file: fileLike("photo.webp", "image/webp", 100_000) }),
  });

  assert.equal(result.errorKey, "profile.avatarUploadError");
  assert.equal(calls.uploads.length, 0);
  assert.equal(calls.profileUpdates.length, 0);
});

test("a profile-save failure rolls back the new object and keeps the old URL", async () => {
  const { calls, client, reload } = fakeClient({ saveError: { message: "denied" } });
  const previous = reload().avatar_url;
  const result = await uploadProfileAvatar({
    client,
    userId: USER_ID,
    sourceFile: fileLike("photo.jpg", "image/jpeg", 500_000),
    previousAvatarUrl: previous,
    processImage: async () => ({ file: fileLike("photo.webp", "image/webp", 100_000) }),
  });

  assert.equal(result.errorKey, "profile.avatarSaveError");
  assert.equal(reload().avatar_url, previous);
  assert.equal(calls.removals.length, 1);
  assert.equal(calls.removals[0][0], calls.uploads[0].path);
});

test("processing failures are explicit and never touch Storage", async () => {
  const { calls, client } = fakeClient();
  const result = await uploadProfileAvatar({
    client,
    userId: USER_ID,
    sourceFile: fileLike("broken.heic", "image/heic", 500_000),
    processImage: async () => { throw new Error("decode failed"); },
  });

  assert.equal(result.errorKey, "profile.avatarProcessError");
  assert.equal(calls.uploads.length, 0);
});

test("a stalled image decoder times out instead of leaving the picker busy forever", async () => {
  const { calls, client } = fakeClient();
  const result = await uploadProfileAvatar({
    client,
    userId: USER_ID,
    sourceFile: fileLike("stalled.heic", "image/heic", 500_000),
    processImage: () => new Promise(() => {}),
    processingTimeoutMs: 5,
  });

  assert.equal(result.errorKey, "profile.avatarProcessError");
  assert.equal(calls.uploads.length, 0);
});

test("only avatar bucket URLs are considered for old-file cleanup", () => {
  assert.equal(
    avatarStoragePathFromUrl("https://cdn.test/storage/v1/object/public/avatars/user-1/avatars/a.webp"),
    "user-1/avatars/a.webp"
  );
  assert.equal(avatarStoragePathFromUrl("https://cdn.test/storage/v1/object/public/posts/user-1/a.webp"), null);
});
