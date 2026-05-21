// Génère icon-192x192.png et icon-512x512.png depuis public/logo-source.png
// Supprime le fond blanc, étend au vert pour couvrir tout le carré (maskable PWA).
// node scripts/generate-icons.js
const sharp   = require("sharp");
const path    = require("path");

const src    = path.join(__dirname, "..", "public", "logo-source.png");
const outDir = path.join(__dirname, "..", "public");

async function run() {
  // 1. Recadre : retire les pixels blancs en bordure
  const trimmed = await sharp(src)
    .trim({ background: "#ffffff", threshold: 25 })
    .toBuffer();

  // 2. Génère les deux tailles — fond vert plein pour couvrir les coins (maskable)
  for (const size of [192, 512]) {
    await sharp(trimmed)
      .resize(size, size, { fit: "contain", background: "#10b981" })
      .png()
      .toFile(path.join(outDir, `icon-${size}x${size}.png`));
    console.log(`✓ public/icon-${size}x${size}.png`);
  }

  // 3. SVG de référence remplacé par la version PNG source (pour l'apple-touch-icon)
  console.log("✓ Terminé — deploy avec : npx vercel --prod");
}

run().catch(err => { console.error(err); process.exit(1); });
