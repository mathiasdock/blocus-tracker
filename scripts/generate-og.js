// Génère l'image Open Graph (aperçu de partage de lien) : public/seo-preview.png
//   node scripts/generate-og.js
//
// Rendu 100% vectoriel via sharp (librsvg) → PNG net à 1200×630.
// On réutilise l'identité réelle de l'app : surface "ink" vert profond,
// le vrai logo (public/icon.svg), les Blocus Blocks et la police de marque
// Bricolage Grotesque (display) + Space Grotesk (chiffres). Les polices sont
// embarquées en base64 dans le SVG (librsvg les honore) — aucune dépendance
// aux polices système (fontconfig est vide dans cet environnement).
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const https = require("https");
const os = require("os");

const CACHE = path.join(os.tmpdir(), "blocus-og-fonts");
const FONTS = {
  bricolage: {
    file: path.join(CACHE, "bricolage.ttf"),
    url: "https://github.com/google/fonts/raw/main/ofl/bricolagegrotesque/BricolageGrotesque%5Bopsz,wdth,wght%5D.ttf",
  },
  space: {
    file: path.join(CACHE, "space.ttf"),
    url: "https://github.com/googlefonts/SpaceGrotesk/raw/master/fonts/ttf/SpaceGrotesk-Bold.ttf",
  },
};

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const go = (u, redirects = 0) => {
      https.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirects > 5) return reject(new Error("too many redirects"));
          return go(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => { fs.writeFileSync(dest, Buffer.concat(chunks)); resolve(); });
      }).on("error", reject);
    };
    go(url);
  });
}

async function ensureFonts() {
  fs.mkdirSync(CACHE, { recursive: true });
  for (const f of Object.values(FONTS)) {
    if (!fs.existsSync(f.file) || fs.statSync(f.file).size < 5000) {
      process.stdout.write(`↓ ${path.basename(f.file)}… `);
      await download(f.url, f.file);
      console.log("ok");
    }
  }
}

// Le vrai logo de l'app (public/icon.svg), inséré tel quel dans un carré arrondi.
function logoInner() {
  const raw = fs.readFileSync(path.join(__dirname, "..", "public", "icon.svg"), "utf8");
  // On garde juste l'intérieur du <svg> (viewBox 0 0 100 100).
  return raw.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
}

// Les Blocus Blocks — motif de marque (barres d'étude). done = plein, active =
// plein + glow, todo = faible. Rendu à des hauteurs variables (rythme).
function blocks(x, baseY, states) {
  const w = 13, gap = 8, hDone = 44, hTodo = 20, r = 6;
  return states.map((s, i) => {
    const h = s === "todo" ? hTodo : hDone;
    const bx = x + i * (w + gap);
    const fill = s === "todo" ? "rgba(255,255,255,0.16)" : "#14B885";
    const glow = s === "active" ? ` filter="url(#blockGlow)"` : "";
    return `<rect x="${bx}" y="${baseY - h}" width="${w}" height="${h}" rx="${r}" fill="${fill}"${glow}/>`;
  }).join("");
}

async function main() {
  await ensureFonts();
  const bricolage = fs.readFileSync(FONTS.bricolage.file).toString("base64");
  const space = fs.readFileSync(FONTS.space.file).toString("base64");

  const W = 1200, H = 630;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 2}" height="${H * 2}" viewBox="0 0 ${W} ${H}">
  <defs>
    <style>
      @font-face { font-family: 'Bricolage'; src: url(data:font/ttf;base64,${bricolage}); font-weight: 200 800; }
      @font-face { font-family: 'Space'; src: url(data:font/ttf;base64,${space}); font-weight: 700; }
      .head { font-family: 'Bricolage'; font-weight: 800; }
      .word { font-family: 'Bricolage'; font-weight: 800; }
      .num  { font-family: 'Space'; font-weight: 700; }
    </style>

    <linearGradient id="bg" x1="0" y1="0" x2="0.25" y2="1">
      <stop offset="0" stop-color="#114134"/>
      <stop offset="0.7" stop-color="#0B2E23"/>
      <stop offset="1" stop-color="#092018"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.86" cy="-0.05" r="0.7">
      <stop offset="0" stop-color="#14B885" stop-opacity="0.42"/>
      <stop offset="0.55" stop-color="#14B885" stop-opacity="0"/>
    </radialGradient>

    <clipPath id="logoClip"><rect x="72" y="54" width="80" height="80" rx="19"/></clipPath>

    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.035 0"/>
    </filter>
    <filter id="blockGlow" x="-120%" y="-120%" width="340%" height="340%">
      <feGaussianBlur stdDeviation="5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="cardShadow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="14" stdDeviation="22" flood-color="#04140F" flood-opacity="0.45"/>
    </filter>
  </defs>

  <!-- Fond de marque -->
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="#fff" filter="url(#grain)" opacity="0.5"/>

  <!-- Anneau d'horloge géant ghosté en haut à droite (rappel du logo) -->
  <g opacity="0.1" stroke="#8FD4B8" fill="none">
    <circle cx="1066" cy="132" r="172" stroke-width="7"/>
    <circle cx="1066" cy="132" r="118" stroke-width="2" stroke-opacity="0.6"/>
    <line x1="1066" y1="132" x2="1066" y2="24" stroke-width="8" stroke-linecap="round"/>
    <line x1="1066" y1="132" x2="1146" y2="172" stroke-width="8" stroke-linecap="round"/>
    <circle cx="1066" cy="132" r="9" fill="#8FD4B8" stroke="none"/>
  </g>

  <!-- Logo réel + wordmark -->
  <g clip-path="url(#logoClip)">
    <g transform="translate(72,54) scale(0.8)">${logoInner()}</g>
  </g>
  <text x="172" y="108" class="word" font-size="38" fill="#F2FBF7">blocus<tspan fill="#14B885">·</tspan>tracker</text>

  <!-- Titre -->
  <text x="72" y="292" class="head" font-size="70" fill="#F2FBF7" letter-spacing="-2">Le chrono qui rend</text>
  <text x="72" y="372" class="head" font-size="70" letter-spacing="-2"><tspan fill="#F2FBF7">ton blocus</tspan><tspan fill="#34D399" dx="19">plus clair.</tspan></text>

  <!-- Sous-titre -->
  <text x="74" y="436" font-family="Bricolage" font-weight="500" font-size="27" fill="#8FD4B8">Chrono, planning, stats et entraide pour étudiants.</text>

  <!-- Signature chrono : Blocus Blocks + timer -->
  ${blocks(74, 566, ["done", "done", "done", "done", "active", "todo", "todo", "todo"])}
  <text x="258" y="562" class="num" font-size="34" fill="#F2FBF7" letter-spacing="1">1:47:12</text>

  <!-- URL -->
  <text x="${W - 72}" y="562" text-anchor="end" font-family="Bricolage" font-weight="600" font-size="24" fill="#8FD4B8">blocus-tracker.com</text>
</svg>`;

  const out = path.join(__dirname, "..", "public", "seo-preview.png");
  await sharp(Buffer.from(svg))
    .resize(W, H)              // downscale du rendu 2x → anti-aliasing net
    .png({ compressionLevel: 9 })
    .toFile(out);
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(`✓ public/seo-preview.png (${W}×${H}, ${kb} KB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
