// Deterministic bridge for consumers which cannot read CSS custom properties.
const fs = require("node:fs");
const path = require("node:path");
const { brand, renderColorCSS, brandAssetURL } = require("../lib/colorTokens.cjs");
const root = path.join(__dirname, "..");
const check = process.argv.includes("--check");
function emit(file, value) {
  const target = path.join(root, file);
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  if (current === value) return;
  if (check) throw new Error(`${file} is stale; run node scripts/generate-colors.cjs`);
  fs.writeFileSync(target, value);
  console.log(`Generated ${file}`);
}
emit("styles/colors.css", renderColorCSS());
const manifest = JSON.parse(fs.readFileSync(path.join(root, "public/manifest.json"), "utf8"));
manifest.background_color = brand.primary;
manifest.theme_color = brand.primary;
for (const icon of [...manifest.icons, ...manifest.shortcuts.flatMap(shortcut => shortcut.icons || [])]) {
  icon.src = brandAssetURL(icon.src.split("?")[0]);
}
emit("public/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
const svg = fs.readFileSync(path.join(root, "public/app-icon.svg"), "utf8");
emit("public/app-icon.svg", svg.replace(/fill="[^"]+" data-brand-color="(primary|deepest)"/g,
  (_, key) => `fill="${brand[key]}" data-brand-color="${key}"`));
