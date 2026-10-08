// Bandeau de consentement : ce que la version compacte pour téléphone ne doit
// jamais perdre (components/ConsentManager.js).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const SOURCE = new URL("../components/ConsentManager.js", import.meta.url);
const banner = async () => {
  const source = await readFile(SOURCE, "utf8");
  return source.slice(source.indexOf("export default function ConsentManager"));
};

test("refuser et accepter : même taille, côte à côte à toutes les largeurs, même poids", async () => {
  const source = await banner();
  const reject = source.match(/<button type="button" className="([^"]+)" onClick=\{rejectAll\}>/);
  const accept = source.match(/<button type="button" className="([^"]+)" onClick=\{acceptAll\}>/);
  assert.ok(reject && accept);
  assert.equal(reject[1].replace("btn-neutral", "X"), accept[1].replace("btn-primary", "X"));
  assert.match(source, /className="mt-3 grid grid-cols-2 gap-2 sm:mt-4"/);
});

test("le texte du consentement reste entier, avec la politique cookies", async () => {
  const source = await banner();
  assert.match(source, /\{t\("consent\.bannerTitle"\)\}/);
  assert.match(source, /\{t\("consent\.bannerBody"\)\}/);
  assert.match(source, /href="\/legal\?doc=cookies"/);
});

test("les préférences détaillées restent accessibles : panneau sur téléphone, dépliage sur ordinateur", async () => {
  const source = await banner();
  // Téléphone : « Personnaliser » dans la phrase, qui ouvre le panneau (il défile).
  assert.match(source, /<span className="sm:hidden">[\s\S]*?onClick=\{openSettings\}[\s\S]*?\{t\("consent\.customize"\)\}/);
  // Ordinateur : la ligne « Personnaliser » et le dépliage d'origine.
  assert.match(source, /\$\{expanded \? "flex" : "hidden sm:flex"\} mt-2 justify-center/);
  assert.match(source, /onClick=\{\(\) => setExpanded\(true\)\}/);
  assert.match(source, /<ConsentSettingsPanel open=\{settingsOpen\} onClose=\{closeSettings\} \/>/);
});

test("rien n'est pré-coché : brouillon du bandeau = tout refusé", async () => {
  const source = await banner();
  assert.match(source, /useState\(DENY_ALL\)/);
  assert.match(source, /if \(needsDecision\) setDraft\(\{ \.\.\.DENY_ALL \}\)/);
});
