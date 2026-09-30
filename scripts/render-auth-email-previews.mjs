import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const templates = {
  confirmation: join(root, "supabase/email-templates/confirmation.html"),
  recovery: join(root, "supabase/email-templates/recovery.html"),
};
const output = await mkdtemp(join(tmpdir(), "blocus-auth-email-previews-"));
const branch = /{{\s*if eq \.Data\.bt_email_lang "fr"\s*}}([\s\S]*?){{\s*else\s*}}([\s\S]*?){{\s*end\s*}}/g;
const exampleLink = "https://example.invalid/auth/v1/verify?token=PREVIEW-NOT-REAL&type=email&redirect_to=https%3A%2F%2Fwww.blocus-tracker.com%2Fonboarding";

for (const [kind, path] of Object.entries(templates)) {
  const source = await readFile(path, "utf8");
  for (const lang of ["fr", "en"]) {
    const rendered = source
      .replace(branch, (_match, french, english) => lang === "fr" ? french : english)
      .replaceAll("{{ .ConfirmationURL }}", exampleLink);
    if (rendered.includes("{{") || rendered.includes("}}")) {
      throw new Error(`Unrendered template directive in ${kind}/${lang}`);
    }
    const target = join(output, `${kind}-${lang}.html`);
    await writeFile(target, rendered);
    process.stdout.write(`${kind}-${lang}: ${target}\n`);
  }
}
