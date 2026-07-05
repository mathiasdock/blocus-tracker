// Agrégations analytics pour le cockpit admin.
//
// ⚠️ Échelle : ces fonctions agrègent côté client des tableaux déjà chargés
// (profils, sessions, posts, messages). C'est adapté jusqu'à quelques milliers
// d'utilisateurs. Au-delà, déplacer ces calculs dans des RPC SQL agrégées
// (GROUP BY date) et ne renvoyer que les séries au client.

import { COMMUNITY_BY_ID } from "./universities";

const DAY_MS = 864e5;

function dayKey(dateLike) {
  return new Date(dateLike).toISOString().slice(0, 10);
}

// Liste des N derniers jours (clé ISO + label court JJ/MM), du plus ancien au plus récent.
export function lastNDays(n, from = Date.now()) {
  const out = [];
  const base = new Date(from);
  base.setHours(12, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base.getTime() - i * DAY_MS);
    const key = d.toISOString().slice(0, 10);
    out.push({ key, label: `${key.slice(8, 10)}/${key.slice(5, 7)}` });
  }
  return out;
}

// Nombre d'utilisateurs actifs distincts dans une fenêtre glissante de N jours.
function distinctActive(sessions, days, now = Date.now()) {
  const since = now - days * DAY_MS;
  const set = new Set();
  for (const s of sessions) {
    if (new Date(s.started_at).getTime() >= since) set.add(s.user_id);
  }
  return set.size;
}

// Séries temporelles quotidiennes pour la période demandée.
export function buildTimeSeries({ users, sessions, posts, messages }, periodDays, now = Date.now()) {
  const days = lastNDays(periodDays, now);
  const idx = Object.fromEntries(days.map((d, i) => [d.key, i]));

  const signups = days.map(() => 0);
  const studyMin = days.map(() => 0);
  const sessionCount = days.map(() => 0);
  const dauSets = days.map(() => new Set());
  const postCount = days.map(() => 0);
  const msgCount = days.map(() => 0);

  for (const u of users) {
    const k = dayKey(u.created_at);
    if (k in idx) signups[idx[k]] += 1;
  }
  for (const s of sessions) {
    const k = dayKey(s.started_at);
    if (k in idx) {
      studyMin[idx[k]] += (s.duration_seconds || 0) / 60;
      sessionCount[idx[k]] += 1;
      dauSets[idx[k]].add(s.user_id);
    }
  }
  for (const p of posts) {
    const k = dayKey(p.created_at);
    if (k in idx) postCount[idx[k]] += 1;
  }
  for (const m of messages) {
    const k = dayKey(m.created_at);
    if (k in idx) msgCount[idx[k]] += 1;
  }

  // Inscriptions cumulées (tous comptes créés jusqu'à la fin de chaque jour).
  const cumulativeByDay = days.map(d => {
    const end = new Date(d.key + "T23:59:59").getTime();
    return users.filter(u => new Date(u.created_at).getTime() <= end).length;
  });

  return days.map((d, i) => ({
    date: d.label,
    key: d.key,
    signups: signups[i],
    studyHours: Math.round((studyMin[i] / 60) * 10) / 10,
    sessions: sessionCount[i],
    dau: dauSets[i].size,
    posts: postCount[i],
    messages: msgCount[i],
    avgSession: sessionCount[i] ? Math.round(studyMin[i] / sessionCount[i]) : 0,
    registered: cumulativeByDay[i],
  }));
}

// KPI actifs : DAU (1j), WAU (7j), MAU (30j).
export function activeUserKpis(sessions, now = Date.now()) {
  return {
    dau: distinctActive(sessions, 1, now),
    wau: distinctActive(sessions, 7, now),
    mau: distinctActive(sessions, 30, now),
  };
}

// Rétention JN : parmi les comptes assez vieux pour avoir eu la chance de
// revenir (âge ≥ N jours), part de ceux qui ont eu ≥ 1 session au moins N
// jours APRÈS leur inscription. Mesure honnête du "revient après N jours".
export function retention(users, sessions, now = Date.now()) {
  // Regroupe les sessions par utilisateur (timestamps).
  const byUser = {};
  for (const s of sessions) {
    (byUser[s.user_id] ||= []).push(new Date(s.started_at).getTime());
  }
  function rate(n) {
    const windowMs = n * DAY_MS;
    let eligible = 0;
    let retained = 0;
    for (const u of users) {
      const created = new Date(u.created_at).getTime();
      if (now - created < windowMs) continue; // pas encore l'âge requis
      eligible += 1;
      const ts = byUser[u.id];
      if (ts && ts.some(t => t - created >= windowMs)) retained += 1;
    }
    return { pct: eligible ? Math.round((retained / eligible) * 100) : null, eligible, retained };
  }
  return { j1: rate(1), j7: rate(7), j30: rate(30) };
}

// Résout une université vers un nom court affichable.
function uniShortName(full) {
  if (!full) return "Non renseignée";
  const meta = Object.values(COMMUNITY_BY_ID).find(m => m.full === full);
  if (meta) return meta.name;
  return full.length <= 14 ? full : full.split(/[\s-]/)[0].slice(0, 14);
}

// Répartition des membres par université (top N).
export function usersByUniversity(users, topN = 12) {
  const counts = {};
  for (const u of users) {
    const key = u.university || "Non renseignée";
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([full, count]) => ({ name: uniShortName(full), full, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

// Universités les plus actives par temps d'étude cumulé (top N).
export function topActiveUniversities(users, sessions, topN = 8) {
  const uniByUser = Object.fromEntries(users.map(u => [u.id, u.university || "Non renseignée"]));
  const secs = {};
  for (const s of sessions) {
    const uni = uniByUser[s.user_id];
    if (!uni) continue;
    secs[uni] = (secs[uni] || 0) + (s.duration_seconds || 0);
  }
  return Object.entries(secs)
    .map(([full, seconds]) => ({ name: uniShortName(full), full, hours: Math.round(seconds / 360) / 10 }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, topN);
}

// Statuts d'activation : jamais actif / inactif 30j / actif.
export function activationBreakdown(users, sessions, now = Date.now()) {
  const everActive = new Set(sessions.map(s => s.user_id));
  const active30 = new Set();
  const since30 = now - 30 * DAY_MS;
  for (const s of sessions) {
    if (new Date(s.started_at).getTime() >= since30) active30.add(s.user_id);
  }
  let never = 0, dormant = 0, active = 0;
  for (const u of users) {
    if (!everActive.has(u.id)) never += 1;
    else if (!active30.has(u.id)) dormant += 1;
    else active += 1;
  }
  return { never, dormant, active, total: users.length };
}
