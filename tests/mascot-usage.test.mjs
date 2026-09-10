import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SOURCE_DIRS = ["components", "pages", "lib"];
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return SOURCE_EXTENSIONS.has(name.slice(name.lastIndexOf("."))) ? [path] : [];
  });
}

const sources = SOURCE_DIRS.flatMap((directory) => sourceFiles(join(ROOT, directory)));

test("the retired mascot drawing cannot be reintroduced in app source", () => {
  const legacySignatures = [
    "M34 80 Q26 110 46 115",
    "M86 80 Q108 74 104 50",
    "M37 32 L53 10 L62 34",
  ];
  const matches = [];

  for (const path of sources) {
    const contents = readFileSync(path, "utf8");
    for (const signature of legacySignatures) {
      if (contents.includes(signature)) matches.push(`${relative(ROOT, path)}: ${signature}`);
    }
  }

  assert.deepEqual(matches, []);
});

test("session completion renders the shared articulated mascot", () => {
  const contents = readFileSync(join(ROOT, "components/SessionCompleteCard.js"), "utf8");
  assert.match(contents, /import Mascot from ["']\.\/Mascot["']/);
  assert.match(contents, /<Mascot[^>]+mood=["']proud["']/s);
});

test("the recap export serializes the shared mascot instead of maintaining a second drawing", () => {
  const contents = readFileSync(join(ROOT, "components/StudyRecap.js"), "utf8");
  assert.match(contents, /import Mascot from ["']\.\/Mascot["']/);
  assert.match(contents, /<Mascot ref=\{mascotExportRef\}/);
  assert.match(contents, /loadMascotImage\(mascotExportRef\.current\)/);
  assert.match(contents, /ctx\.drawImage\(image, x, y, size, size\)/);
});
