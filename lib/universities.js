export const COUNTRIES = [
  {
    code: "BE",
    name: "Belgique 🇧🇪",
    universities: [
      { id: "ULB",    name: "ULB",          full: "Université Libre de Bruxelles",              color: "#2563eb", logo: "/logos-commu/ulb.webp"   },
      { id: "UCL",    name: "UCLouvain",     full: "Université catholique de Louvain",           color: "#1e3a5f", logo: "/logos-commu/ucl.webp"   },
      { id: "USL",    name: "Saint-Louis",   full: "UCLouvain Saint-Louis — Bruxelles",          color: "#059669", logo: "/logos-commu/usl.webp"   },
      { id: "ICHEC",  name: "ICHEC",         full: "ICHEC Brussels Management School",           color: "#1e3a8a", logo: "/logos-commu/ichec.webp" },
      { id: "EPHEC",  name: "EPHEC",         full: "Haute École EPHEC",                          color: "#ea6c00", logo: "/logos-commu/ephec.webp" },
      { id: "IHECS",  name: "IHECS",         full: "IHECS — communication & journalisme",        color: "#007b9e", logo: "/logos-commu/ihecs.webp" },
      { id: "KUL",    name: "KU Leuven",     full: "Katholieke Universiteit Leuven",             color: "#dc2626", logo: "/logos-commu/kul.webp"   },
      { id: "ULIEGE", name: "ULiège",        full: "Université de Liège",                        color: "#c2410c", logo: "/logos-commu/uliege.webp" },
      { id: "UNAMUR", name: "UNamur",        full: "Université de Namur",                        color: "#7c3aed", logo: "/logos-commu/unamur.webp"},
      { id: "SOLVAY", name: "Solvay",        full: "Solvay Brussels School",                     color: "#0284c7", logo: "/logos-commu/solvay.webp"},
      { id: "HECLG",  name: "HEC Liège",     full: "HEC Liège — Management School",             color: "#b91c1c", logo: "/logos-commu/heclg.webp" },
      { id: "ECAM",   name: "ECAM",          full: "ECAM Brussels Engineering School",           color: "#065f46", logo: "/logos-commu/ecam.webp" },
      { id: "VUB",    name: "VUB",           full: "Vrije Universiteit Brussel",                 color: "#003d6b", logo: "/logos-commu/vub.webp" },
      { id: "HELDV",  name: "HE Vinci",           full: "HE Vinci — Haute École Léonard de Vinci", color: "#1d4ed8", logo: "/logos-commu/heldv.webp" },
      { id: "HE2B",   name: "HE2B",          full: "HE2B",                                       color: "#0891b2", logo: "/logos-commu/he2b.webp" },
      { id: "UMONS",  name: "UMONS",         full: "UMONS",                                      color: "#b45309", logo: "/logos-commu/umons.webp" },
      { id: "HELHA",  name: "HELHa",         full: "HELHa",                                      color: "#be123c", logo: "/logos-commu/helha.webp" },
      { id: "ISFSC",  name: "ISFSC",         full: "ISFSC",                                      color: "#0f766e", logo: "/logos-commu/isfsc.webp" },
      { id: "HEFF",   name: "Francisco Ferrer", full: "Haute École Francisco Ferrer",            color: "#6d28d9", logo: "/logos-commu/heff.webp" },
      { id: "GALILEE",name: "Galilée",       full: "Haute École Galilée",                        color: "#c2410c", logo: "/logos-commu/galilee.webp" },
      { id: "CAMBRE", name: "La Cambre",     full: "La Cambre",                                  color: "#15803d", logo: "/logos-commu/cambre.webp" },
      { id: "CAD",    name: "CAD",           full: "CAD — College of Art and Design",            color: "#9d174d", logo: "/logos-commu/cad.webp" },
    ],
  },
  {
    code: "FR",
    name: "France 🇫🇷",
    universities: [
      { id: "HEC",    name: "HEC Paris",     full: "HEC Paris",                                  color: "#1e40af", logo: "/logos-commu/hec.webp" },
      { id: "ESSEC",  name: "ESSEC",         full: "ESSEC Business School",                      color: "#1d4ed8", logo: "/logos-commu/essec.webp"  },
      { id: "ESCP",   name: "ESCP",          full: "ESCP Business School",                       color: "#b45309", logo: "/logos-commu/escp.webp" },
      { id: "EDHEC",  name: "EDHEC",         full: "EDHEC Business School",                      color: "#0f766e", logo: "/logos-commu/edhec.webp" },
      { id: "EMLYON", name: "EM Lyon",       full: "emlyon business school",                     color: "#7c3aed", logo: "/logos-commu/emlyon.webp" },
      { id: "KEDGE",  name: "KEDGE",         full: "KEDGE Business School",                      color: "#0369a1", logo: "/logos-commu/kedge.webp" },
      { id: "SCIENCESPO", name: "Sciences Po",       full: "Sciences Po Paris",                    color: "#9d174d", logo: "/logos-commu/sciencespo.webp" },
      { id: "DAUPHINE",   name: "Dauphine",          full: "Université Paris-Dauphine",            color: "#1e3a8a", logo: "/logos-commu/dauphine.webp" },
      { id: "SORBONNE",   name: "Sorbonne",          full: "Sorbonne Université",                  color: "#6d28d9", logo: "/logos-commu/sorbonne.webp" },
      { id: "SACLAY",     name: "Paris-Saclay",      full: "Université Paris-Saclay",              color: "#0284c7", logo: "/logos-commu/saclay.webp" },
      { id: "INSEAD",     name: "INSEAD",            full: "INSEAD",                               color: "#003d82", logo: "/logos-commu/insead.webp" },
      { id: "SKEMA",      name: "SKEMA",              full: "SKEMA Business School",                color: "#dc2626", logo: "/logos-commu/skema.webp" },
      { id: "NEOMA",      name: "NEOMA",              full: "NEOMA Business School",                color: "#059669", logo: "/logos-commu/neoma.webp" },
      { id: "AUDENCIA",   name: "Audencia",          full: "Audencia Business School",             color: "#d97706", logo: "/logos-commu/audencia.webp" },
      { id: "TSE",        name: "TSE",                full: "Toulouse School of Economics",         color: "#be123c", logo: "/logos-commu/tse.webp" },
      { id: "GEM",        name: "GEM",                full: "Grenoble École de Management",         color: "#0e7490", logo: "/logos-commu/gem.webp" },
    ],
  },
  {
    code: "NL",
    name: "Pays-Bas 🇳🇱",
    universities: [
      { id: "UVA",    name: "Amsterdam",     full: "Universiteit van Amsterdam",                 color: "#dc2626", logo: "/logos-commu/uva.webp" },
      { id: "MAAS",   name: "Maastricht",    full: "Maastricht University",                      color: "#1e3a5f", logo: "/logos-commu/maas.webp" },
      { id: "EUR",    name: "Erasmus",       full: "Erasmus Universiteit Rotterdam",             color: "#16a34a", logo: "/logos-commu/eur.webp" },
      { id: "TUDELFT",   name: "TU Delft",      full: "Delft University of Technology",           color: "#1d4ed8", logo: null },
      { id: "LEIDEN",    name: "Leiden",        full: "Leiden University",                        color: "#7c2d12", logo: null },
      { id: "UTRECHT",   name: "Utrecht",       full: "Utrecht University",                        color: "#b91c1c", logo: null },
      { id: "GRONINGEN", name: "Groningen",     full: "University of Groningen",                   color: "#7c3aed", logo: null },
      { id: "VUA",       name: "VU Amsterdam",  full: "Vrije Universiteit Amsterdam",              color: "#0369a1", logo: null },
      { id: "TILBURG",   name: "Tilburg",       full: "Tilburg University",                        color: "#b45309", logo: null },
      { id: "TUE",       name: "TU Eindhoven",  full: "Eindhoven University of Technology",        color: "#dc2626", logo: null },
      { id: "WUR",       name: "Wageningen",    full: "Wageningen University & Research",          color: "#16a34a", logo: null },
      { id: "RADBOUD",   name: "Radboud",       full: "Radboud University",                        color: "#0f766e", logo: null },
      { id: "TWENTE",    name: "Twente",        full: "University of Twente",                      color: "#ea580c", logo: null },
    ],
  },
  {
    code: "ES",
    name: "Espagne 🇪🇸",
    universities: [
      { id: "IE",     name: "IE",            full: "IE University — Madrid",                     color: "#b91c1c", logo: "/logos-commu/ie.webp" },
      { id: "ESADE",  name: "ESADE",         full: "ESADE Business & Law School",                color: "#1e40af", logo: "/logos-commu/esade.webp" },
      { id: "IESE",   name: "IESE",          full: "IESE Business School",                       color: "#92400e", logo: null               },
      { id: "UEUR",   name: "U. Europea",    full: "Universidad Europea",                        color: "#0891b2", logo: "/logos-commu/ueur.webp" },
      { id: "EADA",   name: "EADA",          full: "EADA Business School",                       color: "#7c3aed", logo: "/logos-commu/eada.webp"  },
      { id: "UCM",  name: "Complutense Madrid",     full: "Universidad Complutense de Madrid",   color: "#1e3a8a", logo: null },
      { id: "UAM",  name: "Autónoma Madrid",        full: "Universidad Autónoma de Madrid",      color: "#059669", logo: null },
      { id: "UB",   name: "U. Barcelona",           full: "Universitat de Barcelona",             color: "#b91c1c", logo: null },
      { id: "UAB",  name: "Autònoma Barcelona",     full: "Universitat Autònoma de Barcelona",    color: "#0369a1", logo: null },
      { id: "UC3M", name: "Carlos III",             full: "Universidad Carlos III de Madrid",     color: "#7c3aed", logo: null },
      { id: "UNAV", name: "Navarra",                full: "Universidad de Navarra",               color: "#b45309", logo: null },
      { id: "UPF",  name: "Pompeu Fabra",           full: "Universitat Pompeu Fabra",             color: "#dc2626", logo: null },
      { id: "UPM",  name: "Politécnica Madrid",     full: "Universidad Politécnica de Madrid",    color: "#0f766e", logo: null },
      { id: "UPC",  name: "Politécnica Cataluña",   full: "Universidad Politécnica de Cataluña",  color: "#be123c", logo: null },
      { id: "EAE",  name: "EAE",                    full: "EAE Business School",                  color: "#d97706", logo: null },
    ],
  },
  {
    code: "CH",
    name: "Suisse 🇨🇭",
    universities: [
      { id: "UNIGE",  name: "Genève",        full: "Université de Genève",                       color: "#0369a1", logo: null               },
      { id: "HECL",   name: "HEC Lausanne",  full: "HEC Lausanne — UNIL",                       color: "#b91c1c", logo: "/logos-commu/hecl.webp" },
      { id: "EPFL",   name: "EPFL",          full: "École Polytechnique Fédérale de Lausanne",   color: "#dc2626", logo: "/logos-commu/epfl.webp"  },
      { id: "EHL",    name: "EHL",           full: "EHL Hospitality Business School",            color: "#ca8a04", logo: "/logos-commu/ehl.webp" },
      { id: "ETHZ",       name: "ETH Zurich",  full: "ETH Zurich",                                color: "#1e3a8a", logo: null },
      { id: "UZH",        name: "Zurich",      full: "University of Zurich",                      color: "#0284c7", logo: null },
      { id: "HSG",        name: "St. Gallen",  full: "University of St. Gallen",                  color: "#059669", logo: null },
      { id: "BASEL",      name: "Basel",       full: "University of Basel",                       color: "#7c3aed", logo: null },
      { id: "BERN",       name: "Bern",        full: "University of Bern",                         color: "#b45309", logo: null },
      { id: "FRIBOURG",   name: "Fribourg",    full: "University of Fribourg",                     color: "#be123c", logo: null },
      { id: "NEUCHATEL",  name: "Neuchâtel",   full: "University of Neuchâtel",                    color: "#0f766e", logo: null },
      { id: "USI",        name: "USI",         full: "Università della Svizzera italiana",         color: "#d97706", logo: null },
      { id: "IMD",        name: "IMD",         full: "IMD Business School",                        color: "#1d4ed8", logo: null },
      { id: "ZHAW",       name: "ZHAW",        full: "ZHAW Zurich University of Applied Sciences", color: "#16a34a", logo: null },
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

// profiles.university stores the `full` name. Resolve it to a community id.
export function communityIdForUniversity(full) {
  if (!full) return null;
  const match = ALL_UNIVERSITIES.find(u => u.full === full);
  return match ? match.id : null;
}
