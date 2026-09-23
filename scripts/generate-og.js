// Génère l'image Open Graph (aperçu de partage de lien) : public/seo-preview.png
//   node scripts/generate-og.js
//
// La composition reprend les sources de vérité du produit, sans faux écran :
// le logo PWA, les polices locales, les vrais Blocus Blocks horizontaux et la
// mascotte Focus rendue directement depuis components/Mascot.js.
const babel = require("@babel/core");
const fs = require("fs");
const path = require("path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const LOCAL_FONTS = path.join(ROOT, "public", "fonts");
const FONTS = {
  nunito: path.join(LOCAL_FONTS, "nunito-sans-latin.woff2"),
  quicksand: path.join(LOCAL_FONTS, "quicksand-latin.woff2"),
};

async function makeLogoTile(size) {
  const source = path.join(ROOT, "public", "app-icon.svg");
  const tile = await sharp(source).resize(size, size).png().toBuffer();
  const roundedMask = Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="#fff"/></svg>`
  );
  return sharp(tile)
    .composite([{ input: roundedMask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

// Le composant React reste l'unique source de la mascotte. Le script le
// transpile en mémoire uniquement pour pouvoir produire un SVG statique ;
// aucune copie de l'illustration ne peut donc dériver de l'app.
async function makeMascot(size) {
  const source = path.join(ROOT, "components", "Mascot.js");
  const motion = await import(path.join(ROOT, "lib", "mascotMotion.mjs"));
  const transformed = babel.transformFileSync(source, {
    babelrc: false,
    configFile: false,
    filename: source,
    presets: [[require("next/babel"), { "preset-env": { modules: "commonjs" } }]],
  });

  const mascotModule = { exports: {} };
  const scopedRequire = (request) => (
    request === "../lib/mascotMotion.mjs" ? motion : require(request)
  );
  new Function("require", "module", "exports", "__filename", "__dirname", transformed.code)(
    scopedRequire,
    mascotModule,
    mascotModule.exports,
    source,
    path.dirname(source)
  );

  const Mascot = mascotModule.exports.default;
  const markup = renderToStaticMarkup(React.createElement(Mascot, {
    mood: "focused",
    size: size * 2,
    animated: false,
    ariaLabel: "Mascotte Blocus Tracker qui étudie",
  }));
  return sharp(Buffer.from(markup)).resize(size, size).png().toBuffer();
}

// Huit quarts d'heure : 1 h 45 réellement étudiée, puis un dernier logement
// prévu. L'écart central regroupe les unités par heure comme dans l'app.
function studyBlocks(x, y) {
  const unitWidth = 33;
  const unitHeight = 16;
  const gap = 6;
  const hourGap = 14;
  return Array.from({ length: 8 }, (_, index) => {
    const clusterOffset = index >= 4 ? hourGap : 0;
    const bx = x + index * (unitWidth + gap) + clusterOffset;
    if (index === 7) {
      return `<rect x="${bx}" y="${y}" width="${unitWidth}" height="${unitHeight}" rx="5" fill="#153D31" stroke="#8FD4B8" stroke-opacity="0.55"/>`;
    }
    return `<rect x="${bx}" y="${y}" width="${unitWidth}" height="${unitHeight}" rx="5" fill="#14B885"/>`;
  }).join("");
}

async function main() {
  const nunito = fs.readFileSync(FONTS.nunito).toString("base64");
  const quicksand = fs.readFileSync(FONTS.quicksand).toString("base64");
  const W = 1200;
  const H = 630;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 2}" height="${H * 2}" viewBox="0 0 ${W} ${H}">
  <defs>
    <style>
      @font-face { font-family: 'Nunito Sans'; src: url(data:font/woff2;base64,${nunito}); font-weight: 400 800; }
      @font-face { font-family: 'Quicksand'; src: url(data:font/woff2;base64,${quicksand}); font-weight: 600 700; }
      .display { font-family: 'Quicksand'; font-weight: 700; }
      .body { font-family: 'Nunito Sans'; }
      .numeric { font-family: 'Nunito Sans'; font-weight: 700; font-variant-numeric: tabular-nums; }
    </style>
  </defs>

  <rect width="${W}" height="${H}" fill="#F4F1EA"/>

  <!-- Une seule surface forte : le chrono, centre de gravité du produit. -->
  <rect x="720" y="56" width="408" height="518" rx="32" fill="#0B2E23"/>

  <!-- Wordmark -->
  <text x="154" y="102" class="display" font-size="34" letter-spacing="-1.1" fill="#1F1A17">blocus<tspan fill="#087454">·</tspan>tracker</text>

  <!-- Promesse -->
  <text x="72" y="246" class="display" font-size="54" letter-spacing="-1.4" fill="#1F1A17">Le chrono qui rend</text>
  <text x="72" y="312" class="display" font-size="54" letter-spacing="-1.4" fill="#1F1A17">ton blocus <tspan fill="#087454">plus clair</tspan></text>
  <text x="73" y="378" class="body" font-size="23" font-weight="600" fill="#655E58">Chrono, planning, stats et entraide pour étudiants.</text>

  <!-- Instrument de mesure : temps + unités de quinze minutes. -->
  <text x="924" y="208" text-anchor="middle" class="numeric" font-size="55" letter-spacing="0.6" fill="#F2FBF7">01:45:00</text>
  ${studyBlocks(760, 452)}

  <text x="72" y="560" class="body" font-size="22" font-weight="700" fill="#087454">blocus-tracker.com</text>
</svg>`;

  const out = path.join(ROOT, "public", "seo-preview.png");
  const base = await sharp(Buffer.from(svg)).resize(W, H).png().toBuffer();
  const [logo, mascot] = await Promise.all([makeLogoTile(64), makeMascot(182)]);

  await sharp(base)
    .composite([
      { input: logo, left: 72, top: 54 },
      // Le chien est posé sur la septième unité : le progrès lui donne sa place.
      { input: mascot, left: 927, top: 270 },
    ])
    .png({ compressionLevel: 9 })
    .toFile(out);

  const metadata = await sharp(out).metadata();
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(`✓ public/seo-preview.png (${metadata.width}×${metadata.height}, ${kb} KB)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
