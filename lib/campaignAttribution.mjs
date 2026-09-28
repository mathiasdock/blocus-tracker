// Consent-gated, first-party campaign attribution. The caller checks the
// existing analytics consent before using ANY of these storage/RPC methods.
// UUIDs are random claim tickets, not browser fingerprints or auth tokens.

export const CAMPAIGN_PENDING_KEY = "bt_campaign_first_touch_v1";
export const CAMPAIGN_DAYS_KEY = "bt_campaign_days_v1";
export const CAMPAIGN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function cleanCampaignSlug(raw) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && value.length <= 64
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? value : null;
}

function readJson(storage, key) {
  try { return JSON.parse(storage?.getItem(key) || "null"); } catch { return null; }
}

function writeJson(storage, key, value) {
  try {
    if (typeof storage?.setItem !== "function") return false;
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch { return false; }
}

export function validVisitId(value) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function pendingCampaignVisit(storage, now = Date.now()) {
  const item = readJson(storage, CAMPAIGN_PENDING_KEY);
  if (!cleanCampaignSlug(item?.slug) || !validVisitId(item?.visitId)
    || !Number.isFinite(item?.at) || item.at > now || now - item.at > CAMPAIGN_MAX_AGE_MS) return null;
  return item;
}

export function clearCampaignStorage(storage) {
  try {
    storage?.removeItem(CAMPAIGN_PENDING_KEY);
    storage?.removeItem(CAMPAIGN_DAYS_KEY);
  } catch {}
}

function clearPendingCampaign(storage) {
  try { storage?.removeItem(CAMPAIGN_PENDING_KEY); } catch {}
}

export function pruneCampaignStorage(storage, now = Date.now()) {
  try {
    if (storage?.getItem(CAMPAIGN_PENDING_KEY) && !pendingCampaignVisit(storage, now)) {
      storage.removeItem(CAMPAIGN_PENDING_KEY);
    }
    const day = new Date(now).toISOString().slice(0, 10);
    const days = readJson(storage, CAMPAIGN_DAYS_KEY);
    if (days && Object.keys(days).some(key => !key.endsWith(`:${day}`))) {
      storage.removeItem(CAMPAIGN_DAYS_KEY);
    }
  } catch {}
}

function newVisitId() {
  if (typeof crypto === "undefined") return null;
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  if (typeof crypto.getRandomValues !== "function") return null;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// One recorded visit per campaign/browser/UTC day. This is an approximation,
// not unique people: clearing storage or using another browser counts again.
export async function recordCampaignLanding(supabase, storage, rawSlug, now = Date.now(), allowed = false) {
  if (!allowed) return null;
  const slug = cleanCampaignSlug(rawSlug);
  if (!slug) return null;
  const day = new Date(now).toISOString().slice(0, 10);
  const key = `${slug}:${day}`;
  const previous = readJson(storage, CAMPAIGN_DAYS_KEY);
  const days = previous && typeof previous === "object" && !Array.isArray(previous) ? previous : {};
  const visitId = validVisitId(days[key]) ? days[key] : newVisitId();
  if (!visitId) return null;
  // Keep only this UTC day's campaign IDs. Revisiting A after B on the same
  // day still reuses A's UUID, rather than creating a second counted visit.
  const today = Object.fromEntries(Object.entries(days).filter(([itemKey, id]) =>
    itemKey.endsWith(`:${day}`) && validVisitId(id)));
  if (!writeJson(storage, CAMPAIGN_DAYS_KEY, { ...today, [key]: visitId })) return null;
  const { data, error } = await supabase.rpc("record_acquisition_visit", {
    p_campaign: slug, p_visit_id: visitId,
  });
  if (error || data !== true) return null;
  if (!pendingCampaignVisit(storage, now)) {
    writeJson(storage, CAMPAIGN_PENDING_KEY, { slug, visitId, at: now });
  }
  return visitId;
}

export async function claimCampaignForUser(supabase, storage, user, allowed, explicitlyDenied = false) {
  // The metadata ticket exists only when an explicitly consented visit was
  // recorded before email signup; it allows confirmation on another device.
  const metadataId = validVisitId(user?.user_metadata?.pending_campaign_visit_id)
    ? user.user_metadata.pending_campaign_visit_id : null;
  const localId = allowed ? pendingCampaignVisit(storage)?.visitId : null;
  const visitId = metadataId || localId;
  if (!user?.id || !visitId || explicitlyDenied) return null;
  const { data, error } = await supabase.rpc("claim_acquisition_first_touch", { p_visit_id: visitId });
  if (error) return null; // retry after a transient network failure
  if (localId) clearPendingCampaign(storage);
  if (metadataId) {
    // Clear only this transient hint, preserving all existing auth metadata.
    await supabase.auth.updateUser({ data: { pending_campaign_visit_id: null } });
  }
  return data === true;
}
