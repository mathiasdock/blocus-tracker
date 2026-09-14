import test from "node:test";
import assert from "node:assert/strict";
import { parseStudyPost, normalizeStudyName, qualifyUniversityNames, ancestorSpaces, broaderSpaces, STUDY_FIELDS } from "../lib/studySpaces.mjs";

test("legacy tagged posts retain their text and content type", () => {
  assert.deepEqual(parseStudyPost({ content: "[Question] Chapter 4?", content_type: "discussion" }), { type: "question", text: "Chapter 4?" });
  assert.deepEqual(parseStudyPost({ content: "[Ressource] My notes" }), { type: "resource", text: "My notes" });
  assert.deepEqual(parseStudyPost({ content: "Exam 2", content_type: "exam" }), { type: "exam", text: "Exam 2" });
  assert.deepEqual(parseStudyPost({ content: null, attachment_url: "file" }), { type: "discussion", text: "" });
});
test("normalization preserves non-Latin names and handles accents and whitespace", () => {
  assert.equal(normalizeStudyName("  Université   de Liège "), normalizeStudyName("universite de liege"));
  assert.notEqual(normalizeStudyName("東京大学"), "");
  assert.equal(new Set(STUDY_FIELDS.map(field => field.id)).size, STUDY_FIELDS.length);
});
test("breadcrumbs retain the academic hierarchy and broader recommendations use activity", () => {
  const spaces = [
    { id: "hub", kind: "hub", recent_posts: 2 },
    { id: "UCF", kind: "university", parent_id: "hub", recent_posts: 5 },
    { id: "business-ucf", kind: "field", parent_id: "UCF", field_id: "business" },
    { id: "marketing", kind: "program", parent_id: "business-ucf", field_id: "business" },
    { id: "ADV3008", kind: "course", parent_id: "marketing", field_id: "business" },
    { id: "exam-2", kind: "exam", parent_id: "ADV3008", field_id: "business" },
    { id: "field-business", kind: "field", parent_id: "hub", recent_posts: 20 },
    { id: "unrelated", kind: "field", recent_posts: 1000 },
  ];
  assert.deepEqual(ancestorSpaces(spaces[5], spaces).map(space => space.id), ["hub", "UCF", "business-ucf", "marketing", "ADV3008"]);
  assert.equal(broaderSpaces(spaces[5], spaces)[0].id, "field-business");
  assert.ok(!broaderSpaces(spaces[5], spaces).some(space => ["exam-2", "unrelated"].includes(space.id)));
});
test("malformed cyclic parent chains do not hang the interface", () => {
  const spaces = [{ id: "a", parent_id: "b" }, { id: "b", parent_id: "a" }];
  assert.equal(ancestorSpaces(spaces[0], spaces).length, 1);
});
test("worldwide universities with the same name keep separate country identities", () => {
  const rows = qualifyUniversityNames([
    { name: "National University", country: "Philippines", alpha_two_code: "PH" },
    { name: "National University", country: "United States", alpha_two_code: "US" },
    { name: "Stanford University", country: "United States", alpha_two_code: "US" },
  ]);
  assert.notEqual(rows[0].full, rows[1].full);
  assert.equal(rows[2].full, "Stanford University");
});
