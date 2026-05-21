export const COUNTRIES = [
  {
    code: "BE",
    name: "Belgique 🇧🇪",
    universities: [
      { id: "ULB",    name: "ULB",          full: "Université Libre de Bruxelles",              color: "#2563eb", logo: "/logos/ulb.png"   },
      { id: "UCL",    name: "UCLouvain",     full: "Université catholique de Louvain",           color: "#1e3a5f", logo: "/logos/ucl.png"   },
      { id: "USL",    name: "Saint-Louis",   full: "UCLouvain Saint-Louis — Bruxelles",          color: "#059669", logo: "/logos/usl.png"   },
      { id: "ICHEC",  name: "ICHEC",         full: "ICHEC Brussels Management School",           color: "#1e3a8a", logo: "/logos/ichec.png" },
      { id: "EPHEC",  name: "EPHEC",         full: "Haute École EPHEC",                          color: "#ea6c00", logo: "/logos/ephec.png" },
      { id: "IHECS",  name: "IHECS",         full: "IHECS — communication & journalisme",        color: "#007b9e", logo: "/logos/ihecs.png" },
      { id: "KUL",    name: "KU Leuven",     full: "Katholieke Universiteit Leuven",             color: "#dc2626", logo: "/logos/kul.png"   },
      { id: "ULIEGE", name: "ULiège",        full: "Université de Liège",                        color: "#c2410c", logo: "/logos/uliege_logo.png" },
      { id: "UNAMUR", name: "UNamur",        full: "Université de Namur",                        color: "#7c3aed", logo: "/logos/Unamur.png"},
      { id: "SOLVAY", name: "Solvay",        full: "Solvay Brussels School",                     color: "#0284c7", logo: "/logos/Solvay.png"},
      { id: "HECLG",  name: "HEC Liège",     full: "HEC Liège — Management School",             color: "#b91c1c", logo: "/logos/HEC liege.png" },
      { id: "ECAM",   name: "ECAM",          full: "ECAM Brussels Engineering School",           color: "#065f46", logo: "/logos/logo_ECAM_entier_sansfond-2.webp" },
      { id: "VUB",    name: "VUB",           full: "Vrije Universiteit Brussel",                 color: "#003d6b", logo: "/logos/VUB.png" },
    ],
  },
  {
    code: "FR",
    name: "France 🇫🇷",
    universities: [
      { id: "HEC",    name: "HEC Paris",     full: "HEC Paris",                                  color: "#1e40af", logo: "/logos/HEC_Paris.svg.png" },
      { id: "ESSEC",  name: "ESSEC",         full: "ESSEC Business School",                      color: "#1d4ed8", logo: "/logos/Essec.png"  },
      { id: "ESCP",   name: "ESCP",          full: "ESCP Business School",                       color: "#b45309", logo: "/logos/ESCP_Business_School_2020_Logo.jpg" },
      { id: "EDHEC",  name: "EDHEC",         full: "EDHEC Business School",                      color: "#0f766e", logo: "/logos/EDHEC.jpg" },
      { id: "EMLYON", name: "EM Lyon",       full: "emlyon business school",                     color: "#7c3aed", logo: "/logos/EM lyon.png" },
      { id: "KEDGE",  name: "KEDGE",         full: "KEDGE Business School",                      color: "#0369a1", logo: "/logos/Kedge-logo.png" },
    ],
  },
  {
    code: "NL",
    name: "Pays-Bas 🇳🇱",
    universities: [
      { id: "UVA",    name: "Amsterdam",     full: "Universiteit van Amsterdam",                 color: "#dc2626", logo: "/logos/Amsterdam University.png" },
      { id: "MAAS",   name: "Maastricht",    full: "Maastricht University",                      color: "#1e3a5f", logo: "/logos/Maastricht-University.png" },
      { id: "EUR",    name: "Erasmus",       full: "Erasmus Universiteit Rotterdam",             color: "#16a34a", logo: "/logos/Erasmus_University_Rotterdam_Stacked_logo_(Colour).png" },
    ],
  },
  {
    code: "ES",
    name: "Espagne 🇪🇸",
    universities: [
      { id: "IE",     name: "IE",            full: "IE University — Madrid",                     color: "#b91c1c", logo: "/logos/IE university.jpg" },
      { id: "ESADE",  name: "ESADE",         full: "ESADE Business & Law School",                color: "#1e40af", logo: "/logos/Esade_logo_.png" },
      { id: "IESE",   name: "IESE",          full: "IESE Business School",                       color: "#92400e", logo: null               },
      { id: "UEUR",   name: "U. Europea",    full: "Universidad Europea",                        color: "#0891b2", logo: "/logos/Universidad Europea.jpg" },
      { id: "EADA",   name: "EADA",          full: "EADA Business School",                       color: "#7c3aed", logo: "/logos/eada.avif"  },
    ],
  },
  {
    code: "CH",
    name: "Suisse 🇨🇭",
    universities: [
      { id: "UNIGE",  name: "Genève",        full: "Université de Genève",                       color: "#0369a1", logo: null               },
      { id: "HECL",   name: "HEC Lausanne",  full: "HEC Lausanne — UNIL",                       color: "#b91c1c", logo: "/logos/HEC-Lausanne-.png" },
      { id: "EPFL",   name: "EPFL",          full: "École Polytechnique Fédérale de Lausanne",   color: "#dc2626", logo: "/logos/EPFL.png"  },
      { id: "EHL",    name: "EHL",           full: "EHL Hospitality Business School",            color: "#ca8a04", logo: "/logos/EHL_Logo.png" },
    ],
  },
];

// Flat map: community id → meta object
export const COMMUNITY_BY_ID = Object.fromEntries(
  COUNTRIES.flatMap(c => c.universities).map(u => [u.id, u])
);

// All display names (for profile selects / UniPicker)
export const ALL_UNIVERSITIES = COUNTRIES.flatMap(country =>
  country.universities.map(u => ({ ...u, country: country.name, countryCode: country.code }))
);
