// Shared formatting helpers.

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export function formatMinutesShort(totalSeconds) {
  const mins = Math.round((totalSeconds || 0) / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

// Meme format, mais une duree POSITIVE ne s'y affiche jamais « 0 min ».
// Vingt secondes etudiees comptaient bien comme une journee active, une case
// de heatmap et une ligne de cours, tout en s'ecrivant « 0 min » : la page
// affichait donc une activite reelle comme un neant. « < 1 min » dit la meme
// chose sans l'effacer. Format identique en FR et EN, comme « min » et « h ».
export function formatStudyTime(totalSeconds) {
  const secs = Math.max(0, totalSeconds || 0);
  if (secs > 0 && Math.round(secs / 60) === 0) return "< 1 min";
  return formatMinutesShort(secs);
}

export function displayName(profile) {
  if (!profile) return "Utilisateur";
  const full = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return full || profile.pseudo || "Utilisateur";
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Date LOCALE (fuseau de l'appareil) au format YYYY-MM-DD à partir d'une Date
// ou d'un timestamp. `toISOString().slice(0,10)` renverrait la date UTC, ce qui
// décale la frontière du "jour" de plusieurs heures (minuit → 02h en Belgique
// l'été) : une session étudiée à 00h30 serait alors attribuée à la veille et
// pourrait casser une série pourtant méritée. Le calcul de SÉRIE passe donc en
// date locale (client + RPC serveur, cf. migration_v30). Le reste de l'app
// (objectif du jour, stats) reste en UTC pour l'instant, de façon cohérente.
export function localISO(dateOrTs) {
  const d = dateOrTs instanceof Date ? dateOrTs : new Date(dateOrTs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Instant (ISO, UTC) du minuit LOCAL du jour de `dateOrTs` : la borne à passer
// à une requête sur `started_at` pour « depuis le début d'aujourd'hui ». La
// chaîne `todayISO()` seule serait lue comme minuit UTC (20 h à New York l'été).
export function localDayStartISO(dateOrTs = new Date()) {
  const d = dateOrTs instanceof Date ? dateOrTs : new Date(dateOrTs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
}

/** Vrai si aucune période déclarée ne couvre aujourd'hui — la série est alors en pause. */
export function isStreakPaused(blocusRanges) {
  if (!blocusRanges || !blocusRanges.length) return false;
  const today = localISO(new Date());
  return !blocusRanges.some(([from, to]) => today >= from && today <= to);
}

export function timeAgo(iso, lang = "fr") {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return lang === "en" ? "just now" : "à l'instant";
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return lang === "en" ? `${m} min ago` : `il y a ${m} min`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return lang === "en" ? `${h} h ago` : `il y a ${h} h`;
  }
  return new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "short" });
}

// Dates LOCALES — via localISO et jamais toISOString().
// `toISOString()` convertit vers UTC : appliqué à une date ramenée à minuit
// local, il renvoie la VEILLE dès qu'on est à l'est de Greenwich, donc toute
// l'année en Belgique et en France. getWeekDates renvoyait ainsi dimanche→samedi
// au lieu de lundi→dimanche, ce qui décalait d'un jour le graphique hebdomadaire
// et les totaux « cette semaine » / « semaine dernière ».
export function lastNDates(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(localISO(d));
  }
  return out;
}

// Returns the 7 ISO date strings (Mon→Sun) for the week at `offsetWeeks`
// from the current week. 0 = current week, -1 = last week, etc.
export function getWeekDates(offsetWeeks = 0) {
  const today = new Date();
  const dayOfWeek = (today.getDay() + 6) % 7; // 0=Mon … 6=Sun
  const monday = new Date(today);
  monday.setDate(today.getDate() - dayOfWeek + offsetWeeks * 7);
  monday.setHours(0, 0, 0, 0);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(localISO(d));
  }
  return dates;
}
