import { normalizeStudyName, STUDY_FIELDS } from "./studySpaces.mjs";

// Exact, reviewed aliases only. Mixed disciplines and unclear abbreviations
// deliberately stay unclassified. Never override an explicit broad_field.
export const STUDY_FIELD_ALIASES = {
  "computer-science": ["informatique", "sciences informatiques", "computer science"],
  "business": [
    "gestion d'entreprise",
    "gestion de l'entreprise",
    "gestion entreprise",
    "gestion",
    "business management",
    "business and management",
    "business & management",
    "management",
    "business",
    "sciences commerciales",
    "science commercial",
    "science de gestion",
    "sciences de gestion",
    "commercial sciences",
    "international business",
    "business international",
    "international business management",
    "commerce international",
    "ingénieur de gestion",
    "ingé gestion",
    "igénieur de gestion",
    "ingénieur commercial",
    "ingénieur commerciale",
    "ingénieur commerical",
    "business engineering",
    "handelsingenieur",
    "diplome complementaire en gestion",
    "e-business",
    "e-commerce",
    "compta & gestion"
  ],
  "economics": [
    "sciences éco",
    "sciences économiques",
    "science économique",
    "sciences economiques",
    "économie",
    "economics",
    "economy",
    "econometrics"
  ],
  "medicine": [
    "médecine",
    "medicine",
    "médecins",
    "medical studies"
  ],
  "law": [
    "droit",
    "law",
    "legal studies"
  ],
  "marketing": [
    "marketing"
  ],
  "finance": [
    "finance",
    "comptabilité",
    "accounting"
  ],
  "engineering": [
    "ingénieur civil",
    "ingé civil",
    "inge civ",
    "ingénieur civil - MAP-MECA",
    "ingé civil - MAP-MECA",
    "ingénieur civil - FYKI-ELEC",
    "ingénieur civil - Maths appliquées",
    "ingénieur industriel",
    "ingenieur",
    "ingénierie",
    "ingéniérie",
    "engineering",
    "electronic engineering",
    "mechanical engineering",
    "bioingénieur",
    "bio ingénieur",
    "bio-ing",
    "bioingenieur",
    "polytech",
    "polytechnique"
  ],
  "health": [
    "kiné",
    "kinésithérapie",
    "pharmacie",
    "pharmacy",
    "infirmière",
    "infirmier",
    "nursing",
    "dentaire",
    "dentistry",
    "diététique",
    "ergothérapie",
    "technologue orthopédique"
  ],
  "psychology": [
    "psychologie",
    "psychology",
    "sciences psychologiques"
  ],
  "communication": [
    "communication",
    "communication & journalisme",
    "relation publique",
    "relations publiques",
    "journalism"
  ],
  "social-sciences": [
    "science politique",
    "sciences politiques",
    "science po",
    "sciences po",
    "sciences sociales",
    "sociologie",
    "socio",
    "political science",
    "social sciences"
  ],
  "science": [
    "biologie",
    "biology",
    "physique",
    "physics"
  ],
  "education": [
    "enseignement",
    "enseignement préscolaire",
    "enseignement EPS : Section 3",
    "education",
    "teaching"
  ],
  "humanities": [
    "langues et littératures romanes",
    "humanities"
  ],
  "architecture": [
    "architecture"
  ]
};
export const GENERIC_PROGRAM_ALIASES = {
  "computer-science": ["informatique", "sciences informatiques", "computer science"],
  "business": [
    "gestion d'entreprise",
    "gestion de l'entreprise",
    "gestion entreprise",
    "gestion",
    "business management",
    "business and management",
    "business & management",
    "management",
    "business",
    "science de gestion",
    "sciences de gestion",
    "sciences commerciales",
    "science commercial",
    "commercial sciences"
  ],
  "economics": [
    "sciences éco",
    "sciences économiques",
    "science économique",
    "sciences economiques",
    "économie",
    "economics",
    "economy"
  ],
  "medicine": [
    "médecine",
    "medicine",
    "médecins",
    "medical studies"
  ],
  "law": [
    "droit",
    "law",
    "legal studies"
  ],
  "marketing": [
    "marketing"
  ],
  "finance": [
    "finance"
  ],
  "engineering": [
    "ingenieur",
    "ingénierie",
    "ingéniérie",
    "engineering",
    "polytech",
    "polytechnique"
  ],
  "health": [
    "health",
    "health and nursing",
    "santé"
  ],
  "psychology": [
    "psychologie",
    "psychology",
    "sciences psychologiques"
  ],
  "communication": [
    "communication"
  ],
  "social-sciences": [
    "sciences sociales",
    "social sciences"
  ],
  "science": [
    "natural sciences",
    "sciences naturelles"
  ],
  "education": [
    "education",
    "enseignement",
    "teaching"
  ],
  "humanities": [
    "humanities"
  ],
  "architecture": [
    "architecture"
  ]
};
const fieldMap = new Map(STUDY_FIELDS.flatMap(field => [field.en, field.fr, ...(STUDY_FIELD_ALIASES[field.id] || [])].map(name => [normalizeStudyName(name), field.id])));
export function inferLegacyStudyField(value) { return fieldMap.get(normalizeStudyName(value || "")) || null; }
export function isGenericStudyProgram(value, fieldId) {
  const field = STUDY_FIELDS.find(item => item.id === fieldId);
  return !!field && [field.en, field.fr, ...(GENERIC_PROGRAM_ALIASES[fieldId] || [])].some(name => normalizeStudyName(name) === normalizeStudyName(value || ""));
}
