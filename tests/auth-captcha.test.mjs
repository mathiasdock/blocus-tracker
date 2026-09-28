import test from "node:test";
import assert from "node:assert/strict";
import { captchaTokenForAuth, validCaptchaToken } from "../lib/authCaptcha.mjs";

test("only non-empty bounded Turnstile tokens can reach pseudo login", () => {
  assert.equal(validCaptchaToken(undefined), false);
  assert.equal(validCaptchaToken(""), false);
  assert.equal(validCaptchaToken({ token: "abc" }), false);
  assert.equal(validCaptchaToken("t".repeat(2048)), true);
  assert.equal(validCaptchaToken("t".repeat(2049)), false);
});

test("older pseudo-login clients can omit a token until Supabase enables CAPTCHA", () => {
  assert.equal(captchaTokenForAuth(undefined), undefined);
  assert.equal(captchaTokenForAuth(""), undefined);
  assert.equal(captchaTokenForAuth("valid-turnstile-token"), "valid-turnstile-token");
});
