import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const read = file => readFileSync(new URL(`../${file}`, import.meta.url));
test("selected local sound families stay lightweight and distinct", () => {
  const files = ["bt-session-complete.mp3", "bt-break-end.mp3", "bt-achievement.mp3", "bt-level-up.mp3", "bt-social-incoming.mp3"];
  let total = 0;
  const hashes = new Set();
  for (const file of files) {
    const bytes = read(`public/sounds/${file}`);
    assert.ok(bytes.length > 1000 && bytes.length < 12000, file);
    hashes.add(createHash("sha256").update(bytes).digest("hex"));
    total += bytes.length;
  }
  assert.equal(hashes.size, files.length);
  assert.ok(total < 40000);
});

test("timer start and resume recordings are byte-for-byte unchanged", () => {
  for (const [file, hash] of [
    ["bt-start.mp3", "394375f7aaf4c36b1c4d09f153dae0e95e20f0ae719e6acf2c7c806e37751c32"],
    ["bt-resume.mp3", "550996cc42ce789851d153455cb312c26b206c8a7d048dbac0445b66576a55d8"],
  ]) assert.equal(createHash("sha256").update(read(`public/sounds/${file}`)).digest("hex"), hash);
});

test("Focus ambience never imports or responds to the effect controller", () => {
  for (const file of ["lib/ambientSound.js", "components/AmbientSoundControl.js"]) {
    const code = read(file).toString();
    assert.doesNotMatch(code, /sensoryFeedback|bt_sensory_v1|playSensoryCue/);
  }
  assert.match(read("components/AmbientSoundControl.js").toString(), /bt_ambient_v1/);
});

test("PWA keeps local sound assets in its existing precache", () => {
  const code = read("next.config.js").toString();
  assert.doesNotMatch(code, /!sounds/);
  assert.match(code, /publicExcludes/);
});
