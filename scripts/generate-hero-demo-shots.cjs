// Images de la démonstration marketing du hero. Les PNG sources sont capturés
// par capture-site-shots.mjs avec la fixture hors ligne (aucune donnée réelle).
// Usage : node scripts/generate-hero-demo-shots.cjs /chemin/vers/captures
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const source = process.argv[2];
if (!source) throw new Error("Indique le dossier des captures brutes.");

const OUT = path.join(__dirname, "..", "public", "site-web", "hero-demo");
const FRAMES = {
  active: "chrono-demo",
  "tick-1": "chrono-tick-1",
  "tick-2": "chrono-tick-2",
  focus: "focus",
  reward: "chrono-reward",
  progress: "chrono-finished",
};
const FORMATS = {
  desktop: { sourceWidth: 1440, sourceHeight: 900, scale: 2, widths: [1100, 1600], timer: [510, 122, 300, 158] },
  mobile: { sourceWidth: 390, sourceHeight: 844, scale: 3, widths: [600, 900], timer: [104, 160, 192, 112] },
};

async function render(input, output, format, width, timerOnly) {
  const height = Math.round(width * format.sourceHeight / format.sourceWidth);
  let image;
  if (timerOnly) {
    const [x, y, w, h] = format.timer;
    const left = Math.round(x * width / format.sourceWidth);
    const top = Math.round(y * height / format.sourceHeight);
    const partWidth = Math.round(w * width / format.sourceWidth);
    const partHeight = Math.round(h * height / format.sourceHeight);
    image = sharp(input)
      .extract({ left: x * format.scale, top: y * format.scale, width: w * format.scale, height: h * format.scale })
      .resize(partWidth, partHeight)
      .ensureAlpha()
      .extend({
        left, top, right: width - left - partWidth, bottom: height - top - partHeight,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      });
  } else {
    image = sharp(input).resize(width, height, { fit: "fill" });
  }
  await image.webp({ quality: 76, alphaQuality: 88, effort: 6, smartSubsample: true }).toFile(output);
  console.log(`${path.relative(OUT, output)}  ${Math.round(fs.statSync(output).size / 1024)} Ko`);
}

(async () => {
  for (const lang of ["fr", "en"]) {
    const destination = path.join(OUT, lang);
    fs.mkdirSync(destination, { recursive: true });
    for (const [mode, format] of Object.entries(FORMATS)) {
      for (const [frame, from] of Object.entries(FRAMES)) {
        const input = path.join(source, lang, `${from}-${mode}.png`);
        if (!fs.existsSync(input)) throw new Error(`Capture manquante : ${input}`);
        for (const width of format.widths) {
          await render(input, path.join(destination, `${frame}-${mode}-${width}.webp`),
            format, width, frame.startsWith("tick-"));
        }
      }
    }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
