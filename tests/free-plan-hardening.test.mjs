// Plan gratuit Supabase : trafic de fond, temps réel, médias, garde-fous et
// isolation d'Expose (v80–v82). Les règles des migrations sont testées en base
// par supabase/tests/{expose_isolation,media_guardrails,conversation_summaries}.sql ;
// ici, la logique pure et le câblage de l'app.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { profileNeedsReload, sameAuthUser } from "../lib/authUserIdentity.mjs";
import { createSignedMediaCache, REUSE_MARGIN_MS } from "../lib/signedMediaCache.mjs";
import { MEDIA_BLOCUS_CAP_BYTES, MEDIA_BYTES_PER_MEMBER, MEDIA_UPLOADS_PER_HOUR, refusalKey } from "../lib/mediaUploadRules.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const code = (path) => read(path).replace(/^\s*\/\/.*$/gm, "");
const sql = (path) => read(path).replace(/--[^\n]*/g, "");

const user = {
  id: "u1", email: "a@b.c", phone: "", updated_at: "2026-09-26T10:00:00Z", email_confirmed_at: "2026-09-01T00:00:00Z",
  user_metadata: { pseudo: "mathias" }, app_metadata: { provider: "email" },
};

test("auth : un renouvellement de jeton ou un retour sur l'onglet garde le même utilisateur", () => {
  // supabase-js renvoie un NOUVEL objet identique (JSON relu du stockage).
  assert.equal(sameAuthUser(user, JSON.parse(JSON.stringify(user))), true);
  assert.equal(sameAuthUser(null, null), true);
  // Une vraie différence remplace l'objet.
  assert.equal(sameAuthUser(user, { ...user, email: "x@y.z" }), false);
  assert.equal(sameAuthUser(user, { ...user, updated_at: "2026-09-26T11:00:00Z" }), false);
  assert.equal(sameAuthUser(user, { ...user, user_metadata: { pseudo: "autre" } }), false);
  assert.equal(sameAuthUser(user, { ...user, id: "u2" }), false);
  assert.equal(sameAuthUser(user, null), false);
});

test("auth : la fiche n'est relue qu'en cas de besoin", () => {
  const base = { userId: "u1", readyForUserId: "u1", accountChanged: false };
  assert.equal(profileNeedsReload({ ...base, event: "TOKEN_REFRESHED" }), false);
  assert.equal(profileNeedsReload({ ...base, event: "SIGNED_IN" }), false);
  assert.equal(profileNeedsReload({ ...base, event: "USER_UPDATED" }), true);
  assert.equal(profileNeedsReload({ ...base, accountChanged: true, event: "SIGNED_IN" }), true);
  // Fiche jamais chargée (échec réseau) : l'événement suivant la répare.
  assert.equal(profileNeedsReload({ ...base, readyForUserId: null, event: "TOKEN_REFRESHED" }), true);
  assert.equal(profileNeedsReload({ ...base, userId: null, event: "SIGNED_OUT" }), false);
  // Câblage du contexte.
  const auth = code("../contexts/AuthContext.js");
  assert.match(auth, /setUser\(\(previous\) => \(sameAuthUser\(previous, nextUser\) \? previous : nextUser\)\)/);
  assert.match(auth, /if \(!profileNeedsReload\(\{ event, accountChanged,/);
  assert.match(auth, /forgetSignedMedia\(\);/);
});

test("fond : plus de sondage permanent ni de temps réel dans le veilleur de niveau", () => {
  const app = code("../pages/_app.js");
  assert.doesNotMatch(app, /setInterval\(/, "aucun intervalle dans _app.js");
  assert.doesNotMatch(app, /supabase\.channel\(/, "aucun canal temps réel global pour le niveau");
  assert.doesNotMatch(app, /loadAutoShare\(/, "plus de relecture des réglages de partage");
  assert.match(app, /window\.addEventListener\("online", flush\)/);
  assert.match(app, /window\.addEventListener\("bt-xp-changed", onXpChanged\)/);
  assert.match(app, /Date\.now\(\) - lastCheckRef\.current < LEVEL_STALE_AFTER_MS/);
  // Les corrections de session annoncent elles-mêmes le changement d'XP.
  assert.match(code("../pages/historique.js"), /notifyXPChanged\(\);/);
});

test("notifications : une seule boucle, visible uniquement, canal temps réel fermé onglet caché", () => {
  const notif = code("../contexts/NotificationContext.js");
  assert.doesNotMatch(notif, /POLL_HIDDEN_MS/);
  assert.match(notif, /if \(stopped \|\| document\.hidden\) return;/);
  assert.match(notif, /Date\.now\(\) - lastPollAtRef\.current >= POLL_WAKE_AFTER_MS/);
  assert.match(notif, /if \(ch \|\| document\.hidden\) return;/);
  assert.match(notif, /document\.hidden \? close\(\) : open\(\)/);
  // Plus aucun canal temps réel ailleurs dans l'app que sur la page Social et la cloche.
  const socialOnly = code("../pages/messages.js");
  assert.match(socialOnly, /if \(channel \|\| document\.hidden\) return;/);
});

test("Social : une requête pour la liste, les 50 DERNIERS messages, pas de cascade", () => {
  const src = code("../pages/messages.js");
  assert.match(src, /supabase\.rpc\("get_my_conversations"\)/);
  // Fini la requête par ami (…limit(1) par conversation).
  assert.doesNotMatch(src, /friendIds\.filter\(id => !lastBy\[id\]\)/);
  assert.doesNotMatch(src, /\.order\("created_at", \{ ascending: true \}\)\.limit\(50\)/);
  assert.match(src, /\.order\("created_at", \{ ascending: false \}\)\.limit\(50\);\s+const rows = \(data \|\| \[\]\)\.reverse\(\);/);
  assert.match(src, /\.order\("created_at", \{ ascending: false \}\)\.limit\(100\);\s+const rows = \(data \|\| \[\]\)\.reverse\(\);/);
  const loadMessages = src.slice(src.indexOf("const loadMessages = useCallback"), src.indexOf("const loadGroups = useCallback"));
  assert.doesNotMatch(loadMessages, /loadFriends\(\)/, "ouvrir une conversation ne relit plus toute la liste");
  assert.match(loadMessages, /rows\.some\(m => m\.sender_id === dmActiveId && !m\.read\)/);
  // Supprimer son message de groupe supprime son fichier.
  assert.match(src, /supabase\.storage\.from\("group"\)\.remove\(\[path\]\)/);
});

test("salons : seulement les nouveaux messages, rythme qui s'espace, rien onglet caché", () => {
  const room = code("../components/course-spaces/CourseRoom.js");
  assert.doesNotMatch(room, /setInterval\(poll, POLL_MS\)/);
  assert.match(room, /fetchRoomMessagesAfter\(roomId, newest\)/);
  assert.match(room, /delay = fresh > 0 \? POLL_MS : Math\.min\(delay \* 2, POLL_MAX_MS\)/);
  assert.match(room, /if \(stopped \|\| document\.hidden\) return;/);
  const client = code("../lib/courseSpacesClient.js");
  assert.match(client, /created_at\.gt\.\$\{newest\.created_at\},and\(created_at\.eq\.\$\{newest\.created_at\},id\.gt\.\$\{newest\.id\}\)/);
});

test("liens signés : même lien réutilisé pendant sa validité, une seule signature concurrente", async () => {
  let clock = 1_000_000;
  const cache = createSignedMediaCache({ now: () => clock });
  let signatures = 0;
  const sign = async () => { signatures += 1; return { signedUrl: `https://x/sign?token=${signatures}`, expiresIn: 3600 }; };
  const [a, b] = await Promise.all([cache.resolve("dm", "dm:u/1.jpg", sign), cache.resolve("dm", "dm:u/1.jpg", sign)]);
  assert.equal(a, b);
  assert.equal(signatures, 1, "deux rendus simultanés, une signature");
  clock += 30 * 60 * 1000; // 30 min plus tard : même adresse → cache navigateur
  assert.equal(await cache.resolve("dm", "dm:u/1.jpg", sign), a);
  assert.equal(signatures, 1);
  clock += 30 * 60 * 1000 - REUSE_MARGIN_MS + 1; // moins de 5 min de validité restante
  assert.notEqual(await cache.resolve("dm", "dm:u/1.jpg", sign), a);
  assert.equal(signatures, 2);
  cache.forget();
  assert.equal(cache.get("dm", "dm:u/1.jpg"), null, "rien ne survit à un changement de compte");
  // Serveur : 1 h, et la durée est renvoyée.
  const api = code("../pages/api/storage/sign.js");
  assert.match(api, /const SIGNED_URL_TTL_S = 60 \* 60;/);
  assert.match(api, /json\(\{ signedUrl: data\.signedUrl, expiresIn: SIGNED_URL_TTL_S \}\)/);
  for (const path of ["../pages/messages.js", "../pages/feed.js", "../lib/courseSpacesClient.js"]) {
    assert.doesNotMatch(code(path), /fetch\("\/api\/storage\/sign"/, `${path} passe par le cache`);
  }
});

test("médias : photo compressée avant l'envoi, limites après, caches cohérents avec la durée de vie", () => {
  const compression = read("../lib/imageCompression.js");
  assert.match(compression, /export const MAX_IMAGE_SIDE = 1280;/);
  assert.match(compression, /export const IMAGE_QUALITY = 0\.8;/);
  assert.match(compression, /export const MAX_AVATAR_SIDE = 512;/);
  const security = read("../lib/security.js");
  assert.match(security, /export const SOURCE_IMAGE_LIMIT = 20 \* 1024 \* 1024;/);
  assert.match(security, /export function validateUploadSource/);
  // Le fichier CHOISI est contrôlé largement ; le fichier ENVOYÉ strictement.
  assert.match(code("../pages/messages.js"), /validateUploadSource\(f, "chatAttachment"\)/);
  assert.match(code("../pages/feed.js"), /validateUploadSource\(file, "postImage"\)/);
  assert.match(code("../lib/courseSpacesClient.js"), /validateUploadSource\(file, "chatAttachment"\)/);
  assert.match(code("../components/course-spaces/CourseRoom.js"), /validateUploadSource\(selected, "chatAttachment"\)/);
  // Publications éphémères et pièces jointes privées : 1 jour, pas 1 an.
  assert.match(code("../pages/feed.js"), /cacheControl: "86400"/);
  assert.match(code("../lib/courseSpacesClient.js"), /cacheControl: "86400"/);
  assert.match(code("../pages/messages.js"), /const PRIVATE_MEDIA_CACHE = "86400";/);
  assert.doesNotMatch(code("../pages/messages.js") + code("../pages/feed.js") + code("../lib/courseSpacesClient.js"), /31536000/);
  // Avatars : chemin versionné + cache long (inchangé).
  assert.match(read("../lib/avatarUpload.mjs"), /cacheControl: "31536000"/);
});

test("garde-fous : refus expliqué, balayage de nuit des photos de publication", () => {
  assert.equal(MEDIA_UPLOADS_PER_HOUR, 30);
  assert.equal(MEDIA_BYTES_PER_MEMBER, 104857600);
  assert.equal(refusalKey("disabled"), "media.uploadsPaused");
  assert.equal(refusalKey("rate_limited"), "media.uploadRateLimited");
  assert.equal(refusalKey("quota_full"), "media.uploadQuotaFull");
  assert.equal(refusalKey("storage_full"), "media.uploadStorageFull");
  assert.equal(MEDIA_BLOCUS_CAP_BYTES, 734003200);
  assert.equal(refusalKey("ok"), null);
  assert.equal(refusalKey(null), null);
  const cron = code("../pages/api/cron/purge-posts.js");
  assert.match(cron, /const SWEEP_AFTER_MS = 72 \* 60 \* 60 \* 1000;/);
  assert.match(cron, /admin\.rpc\("post_files_older_than"/);
  assert.match(cron, /admin\.storage\.from\("posts"\)\.remove\(chunk\)/);
  assert.match(code("../components/admin/StoragePanel.js"), /adminRpc\("admin_set_media_uploads", \{ p_enabled: confirm === "resume"/);
});

test("migrations v80–v82 : isolation d'Expose, règles restrictives, conversations en une requête", () => {
  const v80 = sql("../supabase/migration_v80_expose_isolation.sql");
  assert.match(v80, /revoke all on table public\.%I from public, anon, authenticated, service_role/);
  assert.match(v80, /alter publication supabase_realtime drop table public\.exposed_rooms;/);
  assert.match(v80, /set allowed_mime_types = array\['application\/x-expose-disabled'\]/);
  assert.doesNotMatch(v80, /^\s*(delete\s+from|drop\s+table|truncate)\b/im, "rien n'est supprimé");
  const v81 = sql("../supabase/migration_v81_media_guardrails.sql");
  assert.match(v81, /as restrictive\s+for insert\s+to authenticated/);
  assert.match(v81, /as restrictive\s+for update\s+to authenticated/);
  assert.match(v81, /if v_recent >= 30 then/);
  assert.match(v81, /if v_bytes >= 104857600 then/);
  assert.match(v81, /set file_size_limit = 1048576,[\s\S]*where id = 'avatars';/);
  assert.match(v81, /set file_size_limit = 2097152,[\s\S]*where id = 'posts';/);
  assert.doesNotMatch(v81, /drop policy if exists (?!media_upload_guard)/, "aucune règle existante touchée");
  assert.match(v81, /perform public\.assert_admin\(\);/);
  const v83 = sql("../supabase/migration_v83_media_global_cap.sql");
  // Plafond global : seulement les 5 buckets de Blocus (pas Expose), vérifié
  // à l'envoi (après l'interrupteur), jamais sur la suppression.
  assert.match(v83, /where o\.bucket_id in \('avatars', 'posts', 'dm', 'community', 'group'\);/);
  assert.match(v83, /if not public\.media_uploads_enabled\(\) then\s+return 'disabled';\s+end if;\s+if public\.media_blocus_bytes\(\) >= 734003200 then\s+return 'storage_full';/);
  assert.match(v83, /revoke all on function public\.media_blocus_bytes\(\) from public, anon, authenticated;/);
  assert.doesNotMatch(v83, /policy/i, "aucune règle d'accès modifiée : même garde-fou");
  const v82 = sql("../supabase/migration_v82_conversation_summaries.sql");
  assert.match(v82, /security invoker/);
  assert.match(v82, /left\(l\.content, 160\)/);
});

test("textes FR + EN", () => {
  const i18n = read("../lib/i18n.js");
  for (const key of ["media.uploadsPaused", "media.uploadRateLimited", "media.uploadQuotaFull", "media.uploadStorageFull", "adm.media.usage", "adm.media.title", "adm.media.pause",
    "adm.media.resume", "adm.media.hint", "adm.media.limits", "adm.media.confirmPause", "adm.media.confirmResume",
    "adm.media.pauseBody", "adm.media.resumeBody", "adm.media.reasonLabel", "adm.media.on", "adm.media.off", "adm.media.since"]) {
    assert.equal((i18n.match(new RegExp(`"${key.replace(/\./g, "\\.")}": "`, "g")) || []).length, 2, key);
  }
});
