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

// Sept quarts d'heure, exactement 1 h 45. Les blocs deviennent une trajectoire
// ascendante ; le grand écart après le quatrième conserve le groupement horaire
// de l'app et la mascotte se tient sur la dernière unité réellement gagnée.
function studyBlocks() {
  const positions = [
    [100, 482],
    [200, 470],
    [300, 457],
    [400, 444],
    [540, 427],
    [640, 412],
    [740, 395],
  ];
  return positions.map(([x, y]) => (
    `<rect x="${x}" y="${y}" width="76" height="24" rx="7" fill="#14B885"/>`
  )).join("");
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

  <!-- Le mouvement vient du progrès lui-même : un sol menthe accompagne la
       trajectoire des unités, sans enfermer le chrono dans une carte. -->
  <path d="M-70 520 C190 538 348 492 512 443 C697 388 865 322 1042 316 C1115 313 1172 329 1240 367 L1240 630 L-70 630Z" fill="#EAFBF4"/>

  <!-- Wordmark -->
  <text x="154" y="102" class="display" font-size="34" letter-spacing="-1.1" fill="#1F1A17">blocus<tspan fill="#087454">·</tspan>tracker</text>

  <!-- Instrument de mesure : le chiffre et sa matérialisation exacte. -->
  <text x="72" y="320" class="numeric" font-size="128" letter-spacing="-1.5" fill="#0B2E23">01:45:00</text>
  ${studyBlocks()}

  <text x="1128" y="97" text-anchor="end" class="body" font-size="22" font-weight="700" fill="#087454">blocus-tracker.com</text>
</svg>`;

  const out = path.join(ROOT, "public", "seo-preview.png");
  const base = await sharp(Buffer.from(svg)).resize(W, H).png().toBuffer();
  const [logo, mascot] = await Promise.all([makeLogoTile(64), makeMascot(220)]);

  await sharp(base)
    .composite([
      { input: logo, left: 72, top: 54 },
      // Le chien est posé sur la septième unité : le progrès lui donne sa place.
      { input: mascot, left: 665, top: 185 },
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
