// Génère toutes les icônes PNG depuis la source vectorielle unique.
// node scripts/generate-icons.js
const sharp = require("sharp");
const path = require("path");

const src = path.join(__dirname, "..", "public", "app-icon.svg");
const outDir = path.join(__dirname, "..", "public");

async function run() {
  for (const size of [64, 180, 192, 512]) {
    const name = `app-icon-v2-${size}x${size}.png`;
    await sharp(src)
      .resize(size, size)
      .png()
      .toFile(path.join(outDir, name));
    console.log(`✓ public/${name}`);
  }

  // Alias historiques conservés avec le nouveau visuel pour les installations
  // existantes ; les nouvelles installations utilisent les URLs v2 ci-dessus.
  for (const [name, size] of [
    ["icon-192x192.png", 192],
    ["icon-512x512.png", 512],
    ["app-icon-1024.png", 1024],
    ["logo-source.png", 1024],
  ]) {
    await sharp(src)
      .resize(size, size)
      .png()
      .toFile(path.join(outDir, name));
    console.log(`✓ public/${name}`);
  }

  console.log("✓ Terminé — deploy avec : npx vercel --prod");
}

run().catch(err => { console.error(err); process.exit(1); });
