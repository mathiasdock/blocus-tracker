// Supabase's native Auth email templates can read user_metadata, but not the
// requesting browser's language during a logged-out password reset.
export function authEmailLanguage(value) {
  const code = String(value || "").trim().toLowerCase();
  return code === "fr" || code.startsWith("fr-") ? "fr" : "en";
}

// Store only the effective app language. Failure must never block sign-in or
// a profile preference change; the template safely falls back to English.
export async function syncAuthEmailLanguage(client, language) {
  const target = authEmailLanguage(language);
  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) return false;
    if (data.user.user_metadata?.bt_email_lang === target) return true;
    const updated = await client.auth.updateUser({ data: { bt_email_lang: target } });
    return !updated.error;
  } catch {
    return false;
  }
}
