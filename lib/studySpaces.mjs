export const STUDY_FIELDS = [
  ["business", "Business & Management", "Gestion & management"],
  ["finance", "Finance", "Finance"], ["marketing", "Marketing", "Marketing"],
  ["economics", "Economics", "Économie"], ["law", "Law", "Droit"],
  ["computer-science", "Computer Science", "Informatique"],
  ["engineering", "Engineering", "Ingénierie"], ["medicine", "Medicine", "Médecine"],
  ["health", "Health & Nursing", "Santé & soins infirmiers"],
  ["psychology", "Psychology", "Psychologie"], ["science", "Natural Sciences", "Sciences naturelles"],
  ["mathematics", "Mathematics & Statistics", "Mathématiques & statistiques"],
  ["education", "Education", "Éducation"], ["social-sciences", "Social Sciences", "Sciences sociales"],
  ["humanities", "Humanities & Languages", "Lettres & langues"],
  ["arts", "Arts & Design", "Arts & design"], ["architecture", "Architecture", "Architecture"],
  ["communication", "Communication & Media", "Communication & médias"],
  ["environment", "Environment & Agriculture", "Environnement & agronomie"],
  ["hospitality", "Hospitality & Tourism", "Hôtellerie & tourisme"],
  ["sport", "Sport Sciences", "Sciences du sport"], ["other", "Other studies", "Autres études"],
].map(([id, en, fr]) => ({ id, en, fr }));

export const SPACE_KINDS = ["university", "field", "program", "course", "exam"];
export const CONTENT_TYPES = ["discussion", "question", "resource", "exam"];
export function normalizeStudyName(value = "") {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
// Keep same-named institutions in different countries distinct while retaining
// the existing text-based profile contract. Most names need no suffix.
export function qualifyUniversityNames(rows) {
  const countries = new Map();
  for (const row of rows) {
    const key = normalizeStudyName(row.name);
    if (!countries.has(key)) countries.set(key, new Set());
    countries.get(key).add(row.alpha_two_code || row.country || "");
  }
  return rows.map(row => ({ ...row, full: countries.get(normalizeStudyName(row.name)).size > 1
    ? `${row.name} · ${row.country || row.alpha_two_code}` : row.name }));
}
export function fieldLabel(id, lang = "en") {
  const field = STUDY_FIELDS.find(item => item.id === id);
  return field?.[lang === "fr" ? "fr" : "en"] || id || "";
}
export function spaceLabel(space, lang = "en") {
  if (space?.kind === "hub") return lang === "fr" ? "Tous les étudiants" : "All students";
  return space?.kind === "field" ? fieldLabel(space.field_id, lang) : space?.name || "";
}
export function parseStudyPost(message) {
  const raw = message.content || "";
  const match = raw.match(/^\[(Question|Ressource|Examen)\]\s/);
  const legacy = { Question: "question", Ressource: "resource", Examen: "exam" };
  return { type: match ? legacy[match[1]] : message.content_type || "discussion", text: match ? raw.slice(match[0].length) : raw };
}
export function ancestorSpaces(space, spaces) {
  const map = new Map(spaces.map(item => [item.id, item]));
  const result = [], seen = new Set([space?.id]);
  let current = map.get(space?.parent_id);
  while (current && !seen.has(current.id) && result.length < 6) {
    seen.add(current.id); result.unshift(current); current = map.get(current.parent_id);
  }
  return result;
}
export function broaderSpaces(space, spaces) {
  if (!space) return [];
  const candidates = new Set(ancestorSpaces(space, spaces).map(item => item.id));
  if (space.field_id) candidates.add(`field-${space.field_id}`);
  return spaces.filter(item => candidates.has(item.id) && item.id !== space.id)
    .sort((a, b) => Number(b.recent_posts || 0) - Number(a.recent_posts || 0) || Number(b.member_count || 0) - Number(a.member_count || 0));
}
