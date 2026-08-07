// Remove responses that older service-worker versions cached without varying
// on the Supabase Authorization header. Activation waits for the deletion so
// a newly signed-in account cannot observe an earlier account's responses.
self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.delete("cross-origin"),
    // Community files used to be public and shared this cache with avatars.
    // Clearing it once prevents a private object from surviving the migration.
    caches.delete("supabase-storage"),
  ]));
});
