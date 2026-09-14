import { ALL_UNIVERSITIES } from "./universities";
import { STUDY_FIELDS, normalizeStudyName, parseStudyPost } from "./studySpaces.mjs";
import { isGenericStudyProgram } from "./studyFieldAliases.mjs";

// Development fixture only. No sample content is ever inserted into Supabase.
export function prepareOfflineSpaces(db) {
  if (!db.study_spaces) {
    db.study_spaces = [
      { id: "study-hub", kind: "hub", name: "All students", parent_id: null },
      ...ALL_UNIVERSITIES.map(uni => ({ id: uni.id, kind: "university", name: uni.full, parent_id: "study-hub" })),
      ...STUDY_FIELDS.map(field => ({ id: `field-${field.id}`, kind: "field", name: field.en, field_id: field.id, parent_id: "study-hub" })),
      { id: "demo-ucf-business", kind: "field", name: "Business & Management", field_id: "business", university_id: "UCF", parent_id: "UCF", broader_id: "field-business" },
      { id: "demo-ucf-marketing", kind: "program", name: "Marketing", field_id: "business", university_id: "UCF", parent_id: "demo-ucf-business", broader_id: "field-business" },
      { id: "demo-adv3008", kind: "course", name: "ADV3008", field_id: "business", university_id: "UCF", parent_id: "demo-ucf-marketing", broader_id: "field-business" },
      { id: "demo-adv3008-exam", kind: "exam", name: "Exam 2 · Fall 2026", field_id: "business", university_id: "UCF", parent_id: "demo-adv3008", broader_id: "field-business", exam_date: "2026-10-12" },
    ];
    db.study_space_members = [];
    db.study_space_preferences = [];
    const userId = "offline-user-mathias";
    ["UCF", "demo-ucf-business", "demo-ucf-marketing", "demo-adv3008", "demo-adv3008-exam"].forEach(space_id => db.study_space_members.push({ id: `${userId}:${space_id}`, user_id: userId, space_id }));
    const author = db.profiles.find(row => row.id !== userId)?.id || userId;
    const demos = [
      ["demo-adv3008", "question", "Does anyone have a clear example of the difference between reach and frequency?"],
      ["demo-adv3008", "resource", "I made a short revision checklist for chapters 4–6. Start with the definitions, then work through the campaign examples."],
      ["demo-adv3008", "exam", "Exam 2 · Chapters 4–6"],
      ["demo-adv3008", "discussion", "Anyone revising ADV3008 this afternoon? I’m working through the practice questions."],
      ["field-business", "discussion", "What helps you remember a framework: flashcards or applying it to a real company?"],
      ["study-hub", "question", "How do you plan revision when several exams fall in the same week?"],
    ];
    demos.forEach(([community, content_type, content], index) => db.community_messages.push({
      id: `study-demo-${index}`, community, user_id: author, content_type, content, parent_id: null,
      exam_date: content_type === "exam" ? "2026-10-12" : null, created_at: new Date(Date.now() - index * 3600000).toISOString(),
    }));
  }
  db.community_messages = (db.community_messages || []).map(row => ({ ...row, parent_id: row.parent_id || null, content_type: parseStudyPost(row).type }));
  db.study_space_directory = db.study_spaces.map(space => {
    const parent = db.study_spaces.find(row => row.id === space.parent_id);
    const uni = db.study_spaces.find(row => row.id === space.university_id);
    const field = STUDY_FIELDS.find(row => row.id === space.field_id);
    const posts = db.community_messages.filter(row => row.community === space.id);
    return { ...space, search_text: [space.name, parent?.name, uni?.name, field?.fr, field?.en, space.id].filter(Boolean).join(" "),
      member_count: db.study_space_members.filter(row => row.space_id === space.id).length,
      recent_posts: posts.filter(row => !row.parent_id && Date.parse(row.created_at) > Date.now() - 14 * 86400000).length,
      last_activity: posts.map(row => row.created_at).sort().pop() || null };
  });
  return db;
}
export function ensureOfflineSpace(db, params, userId) {
  const kind = params.p_kind, parent = db.study_spaces.find(row => row.id === (params.p_parent || "study-hub"));
  const name = params.p_kind === "field" ? STUDY_FIELDS.find(row => row.id === params.p_field)?.en : params.p_name.trim();
  const university = parent?.kind === "university" ? parent.id : parent?.university_id;
  const field = kind === "field" ? params.p_field : parent?.field_id;
  const key = normalizeStudyName(name);
  const existing = db.study_spaces.find(row => row.kind === kind && normalizeStudyName(row.name) === key &&
    (kind === "university" || (kind === "course" ? row.university_id === university : row.parent_id === parent?.id)) &&
    (kind !== "exam" || (row.exam_date || null) === (params.p_exam_date || null)));
  if (existing) return existing.id;
  const id = `space-${crypto.randomUUID()}`;
  db.study_spaces.push({ id, kind, name, parent_id: parent?.id, university_id: kind === "university" ? null : university,
    field_id: field, broader_id: field ? `field-${field}` : university || "study-hub", exam_date: params.p_exam_date || null, created_by: userId });
  return id;
}
export function syncOfflineSpaces(db, userId) {
  const profile = db.profiles.find(row => row.id === userId);
  if (!profile) return;
  const signature = [profile.university, profile.study_field, profile.broad_field].join("|");
  const preference = db.study_space_preferences.find(row => row.user_id === userId);
  if (preference?.profile_signature === signature) return;
  const join = id => { if (!db.study_space_members.some(row => row.user_id === userId && row.space_id === id)) db.study_space_members.push({ id: `${userId}:${id}`, user_id: userId, space_id: id }); };
  if (profile.university) {
    const uni = ensureOfflineSpace(db, { p_kind: "university", p_name: profile.university }, userId); join(uni);
    let parent = uni;
    if (profile.broad_field) {
      parent = ensureOfflineSpace(db, { p_kind: "field", p_name: profile.broad_field, p_field: profile.broad_field, p_parent: uni }, userId); join(parent); join(`field-${profile.broad_field}`);
    }
    if (profile.study_field && !isGenericStudyProgram(profile.study_field, profile.broad_field)) join(ensureOfflineSpace(db, { p_kind: "program", p_name: profile.study_field, p_parent: parent }, userId));
  }
  if (preference) preference.profile_signature = signature;
  else db.study_space_preferences.push({ user_id: userId, profile_signature: signature });
}
