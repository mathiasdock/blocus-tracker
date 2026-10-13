import { normalizeStudyName } from "./studySpaces.mjs";

// Keep the existing text-based profile/academic-space contract (2–180 chars).
export function institutionNameForSelection(value, known = []) {
  const name = String(value || "").normalize("NFC").replace(/\s+/gu, " ").trim();
  if ([...name].length < 2 || [...name].length > 180 || !/[\p{L}\p{N}]/u.test(name)
    || /[\p{Cc}\p{Cf}]/u.test(name)) return null;

  const key = normalizeStudyName(name);
  const fullMatch = known.find(row => normalizeStudyName(row.full) === key);
  if (fullMatch) return fullMatch.full;

  // Only explicit catalogue IDs (e.g. UCF), not a shortened display name:
  // "New College" must not be guessed to mean "New College of Florida".
  const aliases = [...new Set(known.filter(row => row.id && normalizeStudyName(row.id) === key).map(row => row.full))];
  return aliases.length === 1 ? aliases[0] : name;
}

export function mergeInstitutionOptions(local, remote) {
  const seen = new Set();
  return [...local, ...remote].filter(row => {
    if (typeof row?.full !== "string" || typeof row.name !== "string") return false;
    const key = normalizeStudyName(row.full);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
