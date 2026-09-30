import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { authEmailLanguage, syncAuthEmailLanguage } from "../lib/authEmailLanguage.mjs";
import { buildSignupMetadata } from "../lib/onboarding.mjs";

const templatePath = (name) => fileURLToPath(new URL(`../supabase/email-templates/${name}.html`, import.meta.url));
const branch = /{{\s*if eq \.Data\.bt_email_lang "fr"\s*}}([\s\S]*?){{\s*else\s*}}([\s\S]*?){{\s*end\s*}}/g;

function renderPreview(source, language) {
  return source.replace(branch, (_match, french, english) => language === "fr" ? french : english);
}

test("only French device variants select French; other and missing locales use English", () => {
  for (const value of ["fr", "fr-BE", "fr-FR", "fr-CA"]) assert.equal(authEmailLanguage(value), "fr");
  for (const value of ["en-US", "nl-BE", "es-ES", "de-DE", "", null]) assert.equal(authEmailLanguage(value), "en");
});

test("email signup persists the effective language in Auth metadata", () => {
  assert.equal(buildSignupMetadata({ emailLanguage: "fr-BE" }).bt_email_lang, "fr");
  assert.equal(buildSignupMetadata({ emailLanguage: "nl-BE" }).bt_email_lang, "en");
});

test("existing account language sync is idempotent and never changes another metadata field", async () => {
  const calls = [];
  const client = { auth: {
    getUser: async () => ({ data: { user: { user_metadata: { bt_email_lang: "en", first_name: "Sam" } } } }),
    updateUser: async (value) => { calls.push(value); return { error: null }; },
  } };
  assert.equal(await syncAuthEmailLanguage(client, "en-US"), true);
  assert.equal(calls.length, 0);
  assert.equal(await syncAuthEmailLanguage(client, "fr-BE"), true);
  assert.deepEqual(calls, [{ data: { bt_email_lang: "fr" } }]);
});

test("language sync never blocks Auth when no session or metadata update fails", async () => {
  assert.equal(await syncAuthEmailLanguage({ auth: { getUser: async () => ({ data: { user: null } }) } }, "fr"), false);
  assert.equal(await syncAuthEmailLanguage({ auth: {
    getUser: async () => ({ data: { user: { user_metadata: {} } } }),
    updateUser: async () => ({ error: new Error("unavailable") }),
  } }, "fr"), false);
});

for (const name of ["confirmation", "recovery"]) {
  test(`${name} template renders one FR and one EN copy with unchanged Supabase link`, async () => {
    const source = await readFile(templatePath(name), "utf8");
    assert.ok(source.includes('href="{{ .ConfirmationURL }}"'));
    for (const language of ["fr", "en"]) {
      const output = renderPreview(source, language);
      assert.ok(!output.includes("{{ if"));
      assert.equal((output.match(/{{ \.ConfirmationURL }}/g) || []).length, 3);
      assert.match(output, language === "fr" ? /Ce lien expire dans 1 heure/ : /This link expires in 1 hour/);
      assert.doesNotMatch(output, language === "fr" ? /This link expires in 1 hour/ : /Ce lien expire dans 1 heure/);
    }
  });
}
