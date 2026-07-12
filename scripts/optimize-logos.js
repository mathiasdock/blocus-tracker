// Optimise tous les logos d'écoles (public/logos-commu/) : redimensionne à une
// taille raisonnable (affichés à 20-40px dans les listes, ~190px max en
// filigrane) et convertit en WebP. Renomme aussi chaque fichier vers
// "<id-ecole>.webp" (propre, sans espace/accent/parenthèse) pour éviter tout
// souci d'encodage d'URL et pour que le nom du fichier dise directement à
// quelle école il correspond.
//
//   node scripts/optimize-logos.js
//
// Source de vérité pour le mapping id -> fichier original : ce script (les
// fichiers sources viennent de public/logos-commu/, déposés à la main).
// Après exécution, lib/universities.js doit pointer vers /logos-commu/<id>.webp
// (déjà fait dans ce commit — à refaire à la main si de nouveaux logos sont
// ajoutés plus tard).
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const DIR = path.join(__dirname, "..", "public", "logos-commu");
const MAX_SIZE = 320; // px sur le plus grand côté — largement suffisant en 2x/3x pour un affichage max ~190px

// id d'école -> fichier source déposé par l'utilisateur dans public/logos-commu/
const SOURCES = {
  // Déjà en place avant cette passe (juste ré-optimisés + renommés proprement)
  UVA: "Amsterdam University.png",
  EDHEC: "EDHEC.jpg",
  EHL: "EHL_Logo.png",
  EMLYON: "EM lyon.png",
  EPFL: "EPFL.png",
  ESCP: "ESCP_Business_School_2020_Logo.jpg",
  EUR: "Erasmus_University_Rotterdam_Stacked_logo_(Colour).png",
  ESADE: "Esade_logo_.png",
  ESSEC: "Essec.png",
  HECLG: "HEC liege.png",
  HECL: "HEC-Lausanne-.png",
  HEC: "HEC_Paris.svg.png",
  IE: "IE university.jpg",
  KEDGE: "Kedge-logo.png",
  MAAS: "Maastricht-University.png",
  SOLVAY: "Solvay.png",
  UNAMUR: "Unamur.png",
  UEUR: "Universidad Europea.jpg",
  VUB: "VUB.png",
  EADA: "eada.avif",
  EPHEC: "ephec.png",
  ICHEC: "ichec.png",
  IHECS: "ihecs.png",
  KUL: "kul.png",
  ECAM: "logo_ECAM_entier_sansfond-2.webp",
  UCL: "ucl.png",
  ULB: "ulb.png",
  ULIEGE: "uliege_logo.png",
  USL: "usl.png",
  // Nouveaux logos ajoutés par l'utilisateur dans cette passe
  AUDENCIA: "Audencia.png",
  CAD: "CAD.png",
  DAUPHINE: "Dauphine.jpg",
  GEM: "GEM.png.webp",
  HE2B: "HE2B-Logo-DEF-300.jpg",
  HELHA: "HELha.jpeg",
  HELDV: "HEVinci.jpeg",
  GALILEE: "HauteÉcoleGalilée.jpeg",
  ISFSC: "ISFSC.png",
  CAMBRE: "LaCambre.png",
  NEOMA: "NEOMA.jpg",
  SACLAY: "PARIS-SACLAY.png",
  TSE: "TSE.png",
  UMONS: "UMONS.png",
  HEFF: "heferrer_logo.jpeg",
  INSEAD: "insead.jpeg",
  SORBONNE: "logo_sorbonne_universite_0.png",
  SCIENCESPO: "sciencespo.png",
  SKEMA: "skema.png",
};

async function run() {
  let totalBefore = 0;
  let totalAfter = 0;
  const outputs = [];

  for (const [id, srcName] of Object.entries(SOURCES)) {
    const srcPath = path.join(DIR, srcName);
    if (!fs.existsSync(srcPath)) {
      console.warn(`⚠ manquant, ignoré : ${srcName} (${id})`);
      continue;
    }
    const before = fs.statSync(srcPath).size;
    totalBefore += before;

    const outName = `${id.toLowerCase()}.webp`;
    const outPath = path.join(DIR, outName);
    await sharp(srcPath)
      .resize(MAX_SIZE, MAX_SIZE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(outPath);

    const after = fs.statSync(outPath).size;
    totalAfter += after;
    outputs.push({ id, outName, srcName, before, after });
    console.log(
      `✓ ${id.padEnd(11)} ${srcName.padEnd(45)} ${(before / 1024).toFixed(0).padStart(4)}KB → ${outName.padEnd(16)} ${(after / 1024).toFixed(0).padStart(3)}KB`
    );
  }

  console.log(
    `\nTotal : ${(totalBefore / 1024).toFixed(0)}KB → ${(totalAfter / 1024).toFixed(0)}KB (${outputs.length} logos)`
  );

  // Supprime les fichiers sources originaux désormais superflus (uniquement
  // ceux qu'on vient de traiter avec succès, jamais .DS_Store ou un fichier
  // qu'on n'a pas pu lire).
  for (const { srcName, outName } of outputs) {
    if (srcName.toLowerCase() === outName.toLowerCase()) continue; // même nom improbable ici
    fs.unlinkSync(path.join(DIR, srcName));
  }
  console.log(`${outputs.length} fichiers sources originaux supprimés (remplacés par les .webp optimisés).`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
