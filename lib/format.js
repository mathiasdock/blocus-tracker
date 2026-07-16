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

// `frozenDays` (optionnel) : jours "gelés" (gel de série, table
// streak_freeze_days) — ils comptent pour la CONTINUITÉ de la série,
// exactement comme un jour étudié. Itérable de "YYYY-MM-DD".
export function computeStreak(sessions, frozenDays) {
  const days = new Set(sessions.map(s => localISO(s.started_at)));
  if (frozenDays) for (const d of frozenDays) days.add(d);
  if (!days.size) return 0;
  const today = localISO(new Date());
  let streak = 0, i = days.has(today) ? 0 : 1;
  while (i < 366) {
    const d = new Date(); d.setDate(d.getDate() - i);
    if (days.has(localISO(d))) { streak++; i++; } else break;
  }
  return streak;
}

export function computeBestStreak(sessions, frozenDays) {
  const set = new Set(sessions.map(s => localISO(s.started_at)));
  if (frozenDays) for (const d of frozenDays) set.add(d);
  if (!set.size) return 0;
  const days = [...set].sort();
  let best = 1, run = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = Math.round((new Date(days[i]) - new Date(days[i - 1])) / 86400000);
    if (diff === 1) { run++; if (run > best) best = run; } else run = 1;
  }
  return best;
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

export function lastNDates(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
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
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}
