function cleanName(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 80).trim() : "";
}

function firstAvailable(...values) {
  return values.map(cleanName).find(Boolean) || "";
}

// Google may only provide a display name. This is a suggestion for editable
// form fields, never a write to an existing Blocus profile.
export function googleNamePrefill(user, profile) {
  if (profile) {
    return {
      firstName: profile.first_name || "",
      lastName: profile.last_name || "",
    };
  }

  const identity = user?.identities?.find(item => item.provider === "google")?.identity_data || {};
  if (user?.app_metadata?.provider !== "google" && !user?.identities?.some(item => item.provider === "google")) {
    return { firstName: "", lastName: "" };
  }

  const metadata = user.user_metadata || {};
  const given = firstAvailable(metadata.given_name, identity.given_name);
  const family = firstAvailable(metadata.family_name, identity.family_name);
  const full = firstAvailable(metadata.full_name, metadata.name, identity.full_name, identity.name);
  const [firstPart, ...otherParts] = full.split(" ");
  const inferredFirst = otherParts.length ? firstPart : full;
  const inferredLast = otherParts.join(" ");

  return {
    firstName: given || inferredFirst,
    lastName: family || (!given ? inferredLast : (full.startsWith(`${given} `) ? full.slice(given.length + 1) : "")),
  };
}
