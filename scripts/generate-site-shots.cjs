// Encode les captures du site public (lib/siteShots.cjs) en WebP, sans
// retoucher les pixels : recadrage, redimensionnement, compression.
//   node scripts/generate-site-shots.cjs /chemin/vers/captures
// Le dossier contient fr/ et en/, avec les captures brutes <nom>.png
// (étudiant de démo, thème clair, fenêtre 1440 × 900 à 2x ou 390 × 844 à 3x).
const path = require("node:path");
const fs = require("node:fs");
const sharp = require("sharp");
const { SHOTS, SHOT_LANGS, shotHeight } = require("../lib/siteShots.cjs");

const source = process.argv[2];
if (!source) throw new Error("Indique le dossier des captures brutes (avec fr/ et en/).");
const OUT = path.join(__dirname, "..", "public", "site-web", "v2");

(async () => {
  for (const lang of SHOT_LANGS) {
    fs.mkdirSync(path.join(OUT, lang), { recursive: true });
    // Le dossier reflète le manifeste : une image retirée de lib/siteShots.cjs
    // disparaît aussi du site.
    const expected = new Set(Object.entries(SHOTS).flatMap(([name, shot]) => shot.widths.map((w) => `${name}-${w}.webp`)));
    for (const file of fs.readdirSync(path.join(OUT, lang))) {
      if (file.endsWith(".webp") && !expected.has(file)) {
        fs.unlinkSync(path.join(OUT, lang, file));
        console.log(`${lang}/${file}  retirée`);
      }
    }
    for (const [name, shot] of Object.entries(SHOTS)) {
      const input = path.resolve(source, lang, `${shot.from}.png`);
      const meta = await sharp(input).metadata();
      const [x, y, w, h] = shot.crop.map((v) => Math.round(v * shot.scale));
      if (x + w > meta.width || y + h > meta.height) {
        throw new Error(`${lang}/${name} : recadrage hors de la capture (${meta.width} × ${meta.height})`);
      }
      for (const width of shot.widths) {
        const file = path.join(OUT, lang, `${name}-${width}.webp`);
        const height = shotHeight(name, width);
        let image = sharp(input)
          .extract({ left: x, top: y, width: w, height: h })
          .resize({ width, height, fit: "fill" });
        if (shot.radius) {
          // Détourage : seul le rectangle arrondi garde son opacité.
          const r = (shot.radius * width) / shot.crop[2];
          const mask = Buffer.from(`<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${r}" ry="${r}"/></svg>`);
          image = sharp(await image.ensureAlpha().png().toBuffer()).composite([{ input: mask, blend: "dest-in" }]);
        }
        await image.webp({ quality: 80, alphaQuality: 90, effort: 6, smartSubsample: true }).toFile(file);
        console.log(`${lang}/${name}-${width}.webp  ${Math.round(fs.statSync(file).size / 1024)} Ko`);
      }
    }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
