import { ALL_UNIVERSITIES } from "../../lib/universities";
import { normalizeStudyName, qualifyUniversityNames } from "../../lib/studySpaces.mjs";
import { getClientIp, setBaseSecurityHeaders } from "../../lib/apiSecurity";
import { rateLimit } from "../../lib/rateLimit";

// Server-side cache keeps the worldwide directory out of the app bundle and
// avoids sending a student's search terms to a third-party API.
const SOURCE = "https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json";
let cached = [], loadedAt = 0, pending = null;
async function directory() {
  if (Date.now() - loadedAt < 86400000) return cached;
  if (!pending) pending = (async () => {
    const response = await fetch(SOURCE, { signal: AbortSignal.timeout(4500) });
    if (!response.ok) throw new Error("directory_unavailable");
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("invalid_directory");
    cached = qualifyUniversityNames(rows.filter(row => typeof row.name === "string" && row.name.length <= 180)).filter(row => row.full.length <= 180).map(row => ({
      id: `directory:${row.alpha_two_code}:${row.name}`,
      name: row.name, full: row.full,
      countryCode: row.alpha_two_code || "", countryName: row.country || "",
      search: normalizeStudyName([row.name, row.country, ...(row.domains || [])].join(" ")),
    }));
    loadedAt = Date.now();
    return cached;
  })().finally(() => { pending = null; });
  try { return await pending; } catch { return cached; }
}

export default async function handler(req, res) {
  setBaseSecurityHeaders(res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!rateLimit(`universities:${getClientIp(req)}`, 80, 60000).ok) return res.status(429).json({ error: "Too many requests" });
  const query = normalizeStudyName(String(req.query.q || "").slice(0, 120));
  if (query.length < 2) return res.json({ universities: [], partial: false });
  const worldwide = await directory();
  const curated = ALL_UNIVERSITIES.map(row => ({ ...row, countryName: row.country, search: normalizeStudyName(`${row.full} ${row.name} ${row.country}`) }));
  const seen = new Set();
  const universities = [...curated, ...worldwide].filter(row => {
    const key = `${row.countryCode}:${normalizeStudyName(row.full)}`;
    if (seen.has(key) || !query.split(" ").every(term => row.search.includes(term))) return false;
    seen.add(key); return true;
  }).slice(0, 30).map(({ search, ...row }) => row);
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return res.json({ universities, partial: worldwide.length === 0 });
}
