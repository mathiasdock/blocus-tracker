// Parseur "capture rapide" du planning — transforme une saisie libre type
// « Bio 2h demain 14h » en objectif structuré. 100 % client, zéro API.
//
// Retourne { title, courseId, minutes, time, dateISO, parts } où `parts`
// signale ce qui a été reconnu (pour l'aperçu live). Accepte FR ET EN quelle
// que soit la langue de l'app (un francophone peut taper "tomorrow", etc.).
//
// Grammaire (best-effort, avec aperçu pour corriger) :
//   • durée   : "2h", "1h30", "90min", "45m"  → minutes
//   • heure   : "à 14h", "14:30", "14h30", "2pm" → HH:MM
//   • date    : aujourd'hui/today, demain/tomorrow, après-demain,
//               un jour de semaine (→ prochaine occurrence), "dans 3 jours"
//   • cours   : un mot qui matche (préfixe) le nom d'un cours de l'utilisateur
//   • titre   : le reste

const DEACC = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const norm = (s) => DEACC(String(s || "").toLowerCase()).trim();

// jour de semaine (getDay: 0=dim … 6=sam) → mots FR + EN (complets + courts)
const WEEKDAY_WORDS = {
  0: ["dimanche", "dim", "sunday", "sun"],
  1: ["lundi", "lun", "monday", "mon"],
  2: ["mardi", "mar", "tuesday", "tue", "tues"],
  3: ["mercredi", "mer", "wednesday", "wed"],
  4: ["jeudi", "jeu", "thursday", "thu", "thur", "thurs"],
  5: ["vendredi", "ven", "friday", "fri"],
  6: ["samedi", "sam", "saturday", "sat"],
};

function toDate(iso) { return new Date(iso + "T12:00:00"); } // midi local → pas de piège DST/UTC
function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDaysISO(iso, n) { const d = toDate(iso); d.setDate(d.getDate() + n); return fmt(d); }

// Prochaine occurrence d'un jour de semaine ≥ baseISO (aujourd'hui inclus).
function nextWeekday(baseISO, dow) {
  const base = toDate(baseISO);
  const diff = (dow - base.getDay() + 7) % 7; // 0 = aujourd'hui
  return addDaysISO(baseISO, diff);
}

export function parseQuickObjective(raw, { courses = [], baseDateISO } = {}) {
  const parts = {};
  const original = String(raw || "");
  let work = " " + norm(original) + " "; // espaces bordants → \b faciles
  let dateISO = baseDateISO || fmt(new Date());

  // ── 1) HEURE ────────────────────────────────────────────────
  let time = "";
  // a) am/pm
  let m = work.match(/\b(\d{1,2})\s*(?:h)?\s*(am|pm)\b/);
  if (m) {
    let h = parseInt(m[1], 10) % 12;
    if (m[2] === "pm") h += 12;
    time = String(h).padStart(2, "0") + ":00";
    work = work.replace(m[0], " ");
  }
  // b) marqueur explicite : à / at / vers / @  suivi de HH(:hMM)
  if (!time) {
    m = work.match(/\b(?:a|au|vers|at|@)\s*(\d{1,2})\s*[:h.]?\s*(\d{2})?\b/);
    if (m) {
      time = m[1].padStart(2, "0") + ":" + (m[2] || "00");
      work = work.replace(m[0], " ");
    }
  }
  // c) format horloge sans marqueur : "14:30" ou "14h30" (≥13h) → heure
  if (!time) {
    m = work.match(/\b(\d{1,2}):(\d{2})\b/) || work.match(/\b(\d{1,2})h(\d{2})\b/);
    if (m) {
      const h = parseInt(m[1], 10);
      const mm = parseInt(m[2], 10);
      // heure d'horloge plausible ; "1h30" (h<13) reste une DURÉE (géré plus bas)
      if (h >= 13 && h <= 23 && mm <= 59) { time = String(h).padStart(2, "0") + ":" + m[2]; work = work.replace(m[0], " "); }
    }
  }

  // ── 2) DURÉE ────────────────────────────────────────────────
  let minutes = 0;
  // "1h30", "2h", "1 h 30"
  const hMatches = [...work.matchAll(/\b(\d{1,2})\s*h\s*(\d{2})?\b/g)];
  const bareHours = [];
  hMatches.forEach((hm) => {
    const h = parseInt(hm[1], 10);
    const mm = hm[2] ? parseInt(hm[2], 10) : 0;
    bareHours.push({ raw: hm[0], h, mm });
  });
  // Cas "2h … 14h" : deux tokens heure nus, pas d'heure explicite trouvée →
  // le PREMIER est une durée, le SECOND (heure d'horloge) devient l'heure.
  if (!time && bareHours.length >= 2) {
    const clock = bareHours[bareHours.length - 1];
    if (clock.h >= 0 && clock.h <= 23) {
      time = String(clock.h).padStart(2, "0") + ":" + String(clock.mm).padStart(2, "0");
      work = work.replace(clock.raw, " ");
      bareHours.pop();
    }
  }
  // Durée = premier token heure nu restant (h<13 typiquement) + minutes.
  if (bareHours.length) {
    const dur = bareHours[0];
    minutes += dur.h * 60 + dur.mm;
    work = work.replace(dur.raw, " ");
  }
  // "45min", "90 min", "30m"
  const mmm = work.match(/\b(\d{1,3})\s*(?:min|mins|minutes?|m)\b/);
  if (mmm) { minutes += parseInt(mmm[1], 10); work = work.replace(mmm[0], " "); }
  if (minutes > 0) parts.minutes = minutes;
  if (time) parts.time = time;

  // ── 3) DATE ─────────────────────────────────────────────────
  let dateMatched = false;
  // "dans 3 jours" / "in 3 days"
  m = work.match(/\b(?:dans|in)\s+(\d{1,3})\s*(?:jours?|days?|j)\b/);
  if (m) { dateISO = addDaysISO(dateISO, parseInt(m[1], 10)); work = work.replace(m[0], " "); dateMatched = true; }
  if (!dateMatched && /\b(apres-demain|apresdemain|day after tomorrow|overmorrow)\b/.test(work)) {
    dateISO = addDaysISO(dateISO, 2); work = work.replace(/\b(apres-demain|apresdemain|day after tomorrow|overmorrow)\b/, " "); dateMatched = true;
  }
  if (!dateMatched && /\b(demain|tomorrow|tmrw)\b/.test(work)) {
    dateISO = addDaysISO(dateISO, 1); work = work.replace(/\b(demain|tomorrow|tmrw)\b/, " "); dateMatched = true;
  }
  if (!dateMatched && /\b(aujourd'?hui|aujourdhui|auj|today|tdy)\b/.test(work)) {
    work = work.replace(/\b(aujourd'?hui|aujourdhui|auj|today|tdy)\b/, " "); dateMatched = true; // reste = base
  }
  if (!dateMatched) {
    for (const [dowStr, words] of Object.entries(WEEKDAY_WORDS)) {
      const hit = words.find((w) => new RegExp(`\\b${w}\\b`).test(work));
      if (hit) {
        // "prochain"/"next" → occurrence de la semaine suivante
        const nextKw = /\b(prochain|prochaine|next)\b/.test(work);
        let d = nextWeekday(dateISO, parseInt(dowStr, 10));
        if (nextKw && d === dateISO) d = addDaysISO(d, 7);
        else if (nextKw) d = addDaysISO(d, 7);
        dateISO = d;
        work = work.replace(new RegExp(`\\b(prochaine?|next)\\b`), " ").replace(new RegExp(`\\b${hit}\\b`), " ");
        dateMatched = true;
        break;
      }
    }
  }
  if (dateMatched) parts.date = true;

  // ── 4) COURS ────────────────────────────────────────────────
  // On matche sur le texte normalisé restant. Un mot du texte qui est préfixe
  // (≥3 lettres) du nom d'un cours, ou le nom entier présent → match. On garde
  // le plus long match.
  let courseId = "";
  let courseHitRaw = "";
  const words = work.split(/\s+/).filter((w) => w && !/^\d+$/.test(w));
  const commonPrefix = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };
  let best = null;
  for (const c of courses) {
    const cn = norm(c.name);
    if (!cn) continue;
    for (const w of words) {
      if (w.length < 3) continue;
      // préfixe/inclusion, ou ≥4 lettres en commun (attrape "maths"→"mathématiques")
      const isMatch = cn === w || cn.startsWith(w) || w.startsWith(cn) || cn.includes(w) || commonPrefix(cn, w) >= 4;
      if (isMatch) {
        const score = Math.max(commonPrefix(cn, w), Math.min(w.length, cn.length) * (cn.startsWith(w) || w.startsWith(cn) ? 1 : 0));
        if (!best || score > best.score) best = { id: c.id, word: w, score };
      }
    }
  }
  if (best) {
    courseId = best.id;
    courseHitRaw = best.word;
    parts.course = true;
    // retire le mot du cours du texte pour ne pas le remettre dans le titre
    work = work.replace(new RegExp(`\\b${best.word}\\b`), " ");
  }

  // ── 5) TITRE ────────────────────────────────────────────────
  // On reconstruit le titre à partir des MOTS D'ORIGINE (casse/accents
  // préservés) qui restent après avoir retiré les tokens reconnus.
  const consumed = new Set();
  if (courseHitRaw) consumed.add(courseHitRaw);
  const leftoverNorm = new Set(work.split(/\s+/).filter(Boolean));
  const titleWords = original.trim().split(/\s+/).filter((w) => {
    const n = norm(w).replace(/[.,;:!?]/g, "");
    if (!n) return false;
    // garde le mot seulement s'il est encore présent dans le reste normalisé
    return leftoverNorm.has(n) && !consumed.has(n);
  });
  let title = titleWords.join(" ").trim();

  return { title, courseId, minutes, time, dateISO, parts };
}
