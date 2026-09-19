import test from "node:test";
import assert from "node:assert/strict";
import { STUDY_YEARS, studyYearLabel, studyYearShortLabel } from "../lib/studyYears.js";
import { STRINGS, translate } from "../lib/i18n.js";

test("all study levels have explicit French and English labels", () => {
  assert.equal(new Set(STUDY_YEARS.map(year => year.value)).size, STUDY_YEARS.length);
  for (const { key } of STUDY_YEARS) {
    assert.ok(STRINGS.fr[key], key);
    assert.ok(STRINGS.en[key], key);
    assert.ok(!STRINGS.en[key].includes("BAC"));
  }
});

test("secondary school and longer international degree paths are available", () => {
  for (const value of ["high_school", "vocational", "undergraduate_4", "undergraduate_5_plus", "masters_3_plus"]) {
    assert.ok(STUDY_YEARS.some(year => year.value === value));
  }
  assert.match(studyYearLabel("high_school", key => translate("en", key)), /High school/);
});

test("legacy saved values and custom levels remain intact", () => {
  for (const value of ["BAC 1", "BAC 2", "BAC 3", "Master 1", "Master 2", "Doctorat", "Autre"]) {
    assert.ok(STUDY_YEARS.some(year => year.value === value));
  }
  assert.match(studyYearLabel("BAC 2", key => translate("en", key)), /Undergraduate.*Year 2/);
  assert.equal(studyYearLabel("My custom degree", key => translate("en", key)), "My custom degree");
  assert.equal(studyYearLabel(null, key => translate("fr", key)), "");
});

test("the profile line uses the short year form, in both languages, and falls back to the full label", () => {
  const fr = (key) => translate("fr", key);
  const en = (key) => translate("en", key);
  assert.equal(studyYearShortLabel("BAC 2", fr), "Bac 2");
  assert.equal(studyYearShortLabel("BAC 2", en), "Bachelor 2");
  assert.equal(studyYearShortLabel("Master 1", fr), "Master 1");
  // No short form: the localized label, never the stored value.
  assert.equal(studyYearShortLabel("Doctorat", en), studyYearLabel("Doctorat", en));
  // Free text typed by a student stays as written.
  assert.equal(studyYearShortLabel("3e année ingénieur", fr), "3e année ingénieur");
  assert.equal(studyYearShortLabel("", fr), "");
});
