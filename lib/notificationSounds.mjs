// In-memory sound eligibility, separate from read/unread business state.
// The inbox groups DMs by sender; its timestamp matches created_at in Realtime.
const AUDIBLE_KINDS = new Set(["private_message", "friend_request", "friend_accepted", "comment"]);
const MAX_REMEMBERED = 300;

export function createNotificationSoundTracker() {
  const seen = new Map();
  let initialized = false;
  let cutoff = -Infinity;

  function remember(key, atMs) {
    if (!key || !Number.isFinite(atMs)) return false;
    const previous = seen.get(key) ?? -Infinity;
    const fresh = atMs > previous && atMs >= cutoff;
    seen.set(key, Math.max(previous, atMs));
    if (seen.size > MAX_REMEMBERED) {
      const oldest = [...seen].sort((a, b) => a[1] - b[1])[0];
      seen.delete(oldest[0]);
      cutoff = Math.max(cutoff, oldest[1]);
    }
    return fresh;
  }

  return {
    observe(items = []) {
      const first = !initialized;
      if (first) {
        cutoff = items.reduce((latest, item) => Math.max(latest, item.atMs), -Infinity);
        initialized = true;
      }
      let audible = false;
      for (const item of items) {
        const fresh = remember(item.key, item.atMs);
        const eligible = AUDIBLE_KINDS.has(item.kind)
          || (item.kind === "announcement" && item.announcement?.type === "important");
        if (!first && fresh && !item.read && eligible) audible = true;
      }
      return audible;
    },
    noteMessage(row) {
      if (typeof row?.sender_id !== "string" || typeof row.created_at !== "string") return false;
      const atMs = Date.parse(row.created_at.replace(/(\.\d{3})\d+/, "$1"));
      return remember(`private_message:${row.sender_id}`, atMs);
    },
  };
}
