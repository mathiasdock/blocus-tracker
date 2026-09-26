// Plafond de 16 h par jour (v78) : la base refuse une session dont la portion
// d'une date ferait dépasser 16 h, avec hint « daily_cap » et la date (ISO)
// dans `details`. Ce refus est définitif : on le dit, date à l'appui.

export function isDailyCapError(error) {
  return error?.hint === "daily_cap";
}

/** Message « Limite de 16 h atteinte le … » dans la langue de l'app. */
export function dailyCapMessage(t, lang, isoDate) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || "")) ? new Date(`${isoDate}T12:00:00`) : null;
  const label = d
    ? d.toLocaleDateString(lang === "en" ? "en-GB" : "fr-BE", { weekday: "long", day: "numeric", month: "long" })
    : String(isoDate || "");
  return t("dash.dailyCapReached").replace("{date}", label);
}
