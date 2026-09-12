// Génère les écrans de lancement iOS depuis la source vectorielle unique.
//   node scripts/generate-splash.mjs
//
// Un écran = un aplat du vert de marque + le logo centré. Pas de texte, pas
// d'indicateur de chargement : c'est un écran de MARQUE, pas une page d'attente.
//
// Le logo est rendu depuis public/app-icon.svg, dont le fond est déjà
// exactement le vert du splash — la tuile se fond donc dans l'aplat et seul le
// « b » chronomètre apparaît. Rien à redécouper à la main, et le jour où le
// logo change, cette commande suffit à tout régénérer.

import sharp from "sharp";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appleSplashEntries, splashLogoSize, SPLASH_BACKGROUND } from "../lib/splashScreens.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const logoSrc = path.join(here, "..", "public", "app-icon.svg");
const outDir = path.join(here, "..", "public", "splash");

function hexToRgb(hex) {
  const v = hex.replace("#", "");
  return { r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16), b: parseInt(v.slice(4, 6), 16) };
}

async function run() {
  await mkdir(outDir, { recursive: true });

  // Repartir propre : un appareil retiré de la liste ne doit pas laisser son
  // image derrière lui, sinon `public/` accumule des fichiers que plus aucune
  // balise ne référence.
  for (const file of await readdir(outDir).catch(() => [])) {
    if (file.startsWith("apple-splash-")) await rm(path.join(outDir, file));
  }

  const background = { ...hexToRgb(SPLASH_BACKGROUND), alpha: 1 };
  const entries = appleSplashEntries();
  // Deux orientations partagent souvent la même paire de dimensions une fois
  // inversées ; on ne rend chaque fichier qu'une fois.
  const done = new Set();

  for (const entry of entries) {
    if (done.has(entry.href)) continue;
    done.add(entry.href);

    const logoPx = splashLogoSize(entry.cssW, entry.cssH) * entry.dpr;
    const logo = await sharp(logoSrc).resize(logoPx, logoPx).png().toBuffer();

    await sharp({
      create: { width: entry.pxW, height: entry.pxH, channels: 4, background },
    })
      .composite([{ input: logo, gravity: "centre" }])
      .png({ compressionLevel: 9, palette: true })
      .toFile(path.join(outDir, path.basename(entry.href)));
  }

  console.log(`✓ ${done.size} écrans de lancement dans public/splash/`);
}

run().catch((err) => { console.error(err); process.exit(1); });
