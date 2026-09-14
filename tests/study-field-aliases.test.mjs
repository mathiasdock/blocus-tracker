import test from "node:test";
import assert from "node:assert/strict";
import { inferLegacyStudyField, isGenericStudyProgram, STUDY_FIELD_ALIASES } from "../lib/studyFieldAliases.mjs";
import { STUDY_FIELDS, normalizeStudyName } from "../lib/studySpaces.mjs";

test("legacy labels map by exact normalized meaning, including user examples", () => {
  for (const label of ["Gestion d’entreprise", "gestion d'entreprise", "  BUSINESS MANAGEMENT  ", "Gestion de l’entreprise"]) assert.equal(inferLegacyStudyField(label), "business");
  for (const label of ["Sciences eco", "Sciences éco", "ECONOMICS"]) assert.equal(inferLegacyStudyField(label), "economics");
  assert.equal(inferLegacyStudyField("Médecine"), "medicine");
  assert.equal(inferLegacyStudyField("DROIT"), "law");
  assert.equal(inferLegacyStudyField("Sciences Informatiques"), "computer-science");
});
test("unclear, mixed and unknown values remain unclassified", () => {
  for (const label of ["Info", "Com", "Economics and business", "Sciences économiques et de gestion", "Gfdv", "", null, "International Finance and Law"]) assert.equal(inferLegacyStudyField(label), null);
});
test("generic duplicates do not become program communities; precise degrees can", () => {
  assert.equal(isGenericStudyProgram("Gestion d'entreprise", "business"), true);
  assert.equal(isGenericStudyProgram("Business & Management", "business"), true);
  assert.equal(isGenericStudyProgram("Médecine", "medicine"), true);
  assert.equal(isGenericStudyProgram("International business", "business"), false);
  assert.equal(isGenericStudyProgram("Droit fiscal", "law"), false);
  assert.equal(isGenericStudyProgram("Mechanical Engineering", "engineering"), false);
  assert.equal(isGenericStudyProgram("Gestion", "economics"), false);
  assert.equal(isGenericStudyProgram("Gestion", null), false);
});
test("reviewed aliases are unambiguous and reference real taxonomy IDs", () => {
  const seen = new Map();
  for (const [field, aliases] of Object.entries(STUDY_FIELD_ALIASES)) {
    assert.ok(STUDY_FIELDS.some(item => item.id === field));
    for (const alias of aliases) {
      const key = normalizeStudyName(alias);
      assert.ok(!seen.has(key) || seen.get(key) === field, alias);
      seen.set(key, field);
    }
  }
});
