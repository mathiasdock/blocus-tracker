export const STUDY_YEARS = [
  { value: "high_school", key: "onboarding.year.highSchool" },
  { value: "vocational", key: "onboarding.year.vocational" },
  { value: "BAC 1", key: "onboarding.year.bac1" },
  { value: "BAC 2", key: "onboarding.year.bac2" },
  { value: "BAC 3", key: "onboarding.year.bac3" },
  { value: "undergraduate_4", key: "onboarding.year.undergraduate4" },
  { value: "undergraduate_5_plus", key: "onboarding.year.undergraduate5Plus" },
  { value: "Année préparatoire", key: "onboarding.year.prep" },
  { value: "Année passerelle", key: "onboarding.year.bridge" },
  { value: "Master 1", key: "onboarding.year.master1" },
  { value: "Master 2", key: "onboarding.year.master2" },
  { value: "masters_3_plus", key: "onboarding.year.masters3Plus" },
  { value: "Année de spécialisation", key: "onboarding.year.spec" },
  { value: "Certificat / formation courte", key: "onboarding.year.cert" },
  { value: "Doctorat", key: "onboarding.year.phd" },
  { value: "Formation continue", key: "onboarding.year.continuing" },
  { value: "Autre", key: "onboarding.year.other" },
];

// Keep historical stored values for compatibility with profiles and cohort
// filters. Localized labels, never these storage values, belong in the UI.
export function studyYearLabel(value, t) {
  const option = STUDY_YEARS.find(year => year.value === value);
  return option ? t(option.key) : value || "";
}

// The short form a profile line uses ("Bac 2", "Master 1"). The onboarding
// labels are sentences written for a picker — "Premier cycle (Bachelor /
// Licence) · année 2" — and wrapped the profile header onto three lines. A
// value without a short form keeps its full localized label.
const SHORT_KEYS = {
  "BAC 1": "profile.yearShort.bac1",
  "BAC 2": "profile.yearShort.bac2",
  "BAC 3": "profile.yearShort.bac3",
  undergraduate_4: "profile.yearShort.bac4",
  undergraduate_5_plus: "profile.yearShort.bac5",
  "Master 1": "profile.yearShort.master1",
  "Master 2": "profile.yearShort.master2",
  masters_3_plus: "profile.yearShort.master3",
};

export function studyYearShortLabel(value, t) {
  if (!value) return "";
  return SHORT_KEYS[value] ? t(SHORT_KEYS[value]) : studyYearLabel(value, t);
}
