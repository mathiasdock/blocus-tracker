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
