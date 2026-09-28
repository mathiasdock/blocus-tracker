// Turnstile is enabled only after its public site key has been deployed.
// Supabase Auth owns server-side verification; never put its secret here.
export const AUTH_CAPTCHA_ENABLED = Boolean(
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()
);

export function validCaptchaToken(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 2048;
}

// Old installed clients may omit the token during the staged deployment.
// Supabase Auth, not this shape check, decides when CAPTCHA is mandatory.
export function captchaTokenForAuth(value) {
  return validCaptchaToken(value) ? value : undefined;
}
