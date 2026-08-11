const FALLBACK_SITE_URL = "https://www.blocus-tracker.com";

function asOrigin(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function getSiteUrl() {
  const configured = asOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured) return configured;

  if (typeof window !== "undefined") {
    const current = asOrigin(window.location.origin);
    if (current) return current;
  }

  return FALLBACK_SITE_URL;
}
