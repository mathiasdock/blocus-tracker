// Captures brutes du site public : un étudiant de démo (jamais admin), thème
// clair, FR ou EN, ordinateur (1440 × 900 à 2x) ou téléphone (390 × 844 à 3x).
//
// Prérequis : la copie hors ligne servie sur http://localhost:4321
//   NEXT_PUBLIC_OFFLINE_DEV=true npm run build && npm start -- -p 4321
// Puis, pour chaque langue et chaque format :
//   node scripts/capture-site-shots.mjs fr desktop
//   node scripts/capture-site-shots.mjs fr mobile
//   node scripts/capture-site-shots.mjs en desktop
//   node scripts/capture-site-shots.mjs en mobile
// et enfin : node scripts/generate-site-shots.cjs <dossier affiché>
//
// Tout se passe dans la base locale de la fixture (localStorage) d'un profil
// Chrome jetable : rien n'est écrit dans Supabase.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DAY_PARTS_VERSION, computeSessionDayParts } from "../lib/sessionDayParts.mjs";

const lang = process.argv[2] === "en" ? "en" : "fr";
const mode = process.argv[3] === "mobile" ? "mobile" : "desktop";
const only = process.argv.slice(4);
const BASE = process.env.SITE_URL || "http://localhost:4321";
const ROOT = process.env.CAPTURE_DIR || join(tmpdir(), "blocus-site-captures");
const OUT = join(ROOT, lang);
mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const W = mode === "desktop" ? 1440 : 390;
const H = mode === "desktop" ? 900 : 844;
const SCALE = mode === "desktop" ? 2 : 3;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Chrome sans interface, piloté par le protocole DevTools ────────────────
async function launch() {
  const port = 9600 + Math.floor(Math.random() * 300);
  const profile = mkdtempSync(join(tmpdir(), "blocus-capture-"));
  const proc = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--mute-audio", "about:blank",
  ], { stdio: "ignore" });
  let targets = null;
  for (let i = 0; i < 80 && !targets; i += 1) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await sleep(250); }
  }
  const target = targets.find((t) => t.type === "page");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  const consoleErrors = [];
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result);
      return;
    }
    if (msg.method === "Page.javascriptDialogOpening") send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
    if (msg.method === "Runtime.exceptionThrown") consoleErrors.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
    listeners.forEach((fn) => fn(msg));
  };
  function send(method, params = {}) {
    id += 1;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }
  await send("Page.enable");
  await send("Runtime.enable");
  return {
    send,
    consoleErrors,
    async nav(url, settle = 1500) {
      const loaded = new Promise((resolve) => {
        const fn = (msg) => { if (msg.method === "Page.loadEventFired") { listeners.splice(listeners.indexOf(fn), 1); resolve(); } };
        listeners.push(fn);
      });
      await send("Page.navigate", { url });
      await Promise.race([loaded, sleep(20000)]);
      await sleep(settle);
    },
    async js(code) {
      const res = await send("Runtime.evaluate", { expression: `(async () => { ${code} })()`, awaitPromise: true, returnByValue: true, userGesture: true });
      if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
      return res.result.value;
    },
    async click(x, y) {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    },
    async close() { try { await send("Browser.close"); } catch {} proc.kill(); },
  };
}

// Fuseau de capture : un après-midi, le plus tard possible dans la semaine
// (le graphique « Cette semaine » du Chrono a alors des jours à montrer).
function pickTimezone() {
  const zones = ["Europe/Brussels", "Europe/London", "Asia/Dubai", "Asia/Kolkata", "Asia/Bangkok", "Asia/Tokyo",
    "Australia/Sydney", "Pacific/Auckland", "Pacific/Kiritimati", "Pacific/Honolulu", "America/Los_Angeles",
    "America/Denver", "America/Chicago", "America/New_York", "America/Sao_Paulo", "Atlantic/Azores"];
  const order = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const now = new Date();
  const candidates = zones.map((zone) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(now).map((p) => [p.type, p.value]));
    return { zone, hour: Number(parts.hour), weekday: order[parts.weekday] };
  }).filter((c) => c.hour >= 13 && c.hour <= 17).sort((a, b) => b.weekday - a.weekday);
  if (!candidates.length) throw new Error("Aucun fuseau d'après-midi : fixer DEMO_TZ");
  return candidates[0].zone;
}
const TZ = process.env.DEMO_TZ || pickTimezone();

// ── Textes de la démo ──────────────────────────────────────────────────────
const T = lang === "fr" ? {
  field: "Sciences économiques et de gestion",
  dm: ["On révise ensemble à la bibliothèque demain ?", "Oui ! 9 h, deuxième étage ?", "Parfait. J'amène les exercices de micro.", "Je lance un chrono de 50 min, on fait le point après."],
  group: ["Révisions Éco", "On révise ensemble avant les examens"],
  methodo: "Méthodologie", micro: "Microéconomie", compta: "Comptabilité",
  examMethodo: "Examen de méthodologie", examMicro: "Partiel de microéconomie",
  objectives: { "offline-objective-1": "Relire les fiches", "offline-objective-2": "Finir les exercices", "offline-objective-3": "QCM chapitre 4", "offline-objective-4": "Plan de dissertation", "offline-objective-5": "Dernière relecture", "offline-objective-6": "Ranger les notes" },
  notes: { "offline-session-1": "Révision chapitres 1 et 2", "offline-session-2": "QCM" },
  checklist: { "offline-check-1": "Plan du cours", "offline-check-2": "Exercices types" },
  offerings: { "offline-offering-bio": "Microéconomie" },
  program: "Sciences économiques et de gestion",
  messages: null,
} : {
  field: "Economics and Management",
  dm: ["Want to study together at the library tomorrow?", "Yes! 9 am, second floor?", "Perfect. I'll bring the micro exercises.", "Starting a 50-min timer, let's catch up after."],
  group: ["Econ study group", "Studying together before exams"],
  methodo: "Research Methods", micro: "Microeconomics", compta: "Accounting",
  examMethodo: "Research Methods exam", examMicro: "Microeconomics midterm",
  objectives: { "offline-objective-1": "Review my notes", "offline-objective-2": "Finish the exercises", "offline-objective-3": "Chapter 4 quiz", "offline-objective-4": "Essay outline", "offline-objective-5": "Final review", "offline-objective-6": "Tidy up my notes" },
  notes: { "offline-session-1": "Chapters 1 and 2 review", "offline-session-2": "Quiz" },
  checklist: { "offline-check-1": "Course outline", "offline-check-2": "Typical exercises" },
  offerings: {
    "offline-offering-macro": "Macroeconomics", "offline-offering-methodo": "Research Methods",
    "offline-offering-bio": "Microeconomics", "offline-offering-compta": "Financial Accounting",
    "offline-offering-stats": "Descriptive Statistics", "offline-offering-finance": "Corporate Finance",
    "offline-offering-media": "European Media and Digital Communication Law",
  },
  program: "Economics and Management",
  messages: {
    "offline-room-message-1": "Did anyone get the Keynesian multiplier in chapter 4? I'm stuck on exercise 3.",
    "offline-room-message-2": "Yes: think about the marginal propensity to consume. If c = 0.8, the multiplier is 1 / (1 − 0.8) = 5.",
    "offline-room-message-3": "The answer key for lab 3 shows it well, page 12.",
    "offline-room-message-4": "Thanks, that's much clearer.",
    "offline-room-message-5": "The exam date is up on the portal:",
    "offline-room-message-6": "Written, chapters 1 to 7. The lab exercises count.",
    "offline-room-message-7": "I'm uploading my summary of chapters 5 and 6.",
    "offline-room-message-8": "Great, thanks Lina! Anyone studying at the science library this afternoon?",
    "offline-room-message-9": "For the year-end close: don't forget the adjusting entries.",
    "offline-room-message-10": "Does anyone have the slides from the lecture on variance?",
    "offline-room-message-11": "The science library stays open until 10 pm during exam season.",
    "offline-room-message-12": "Does anyone know where this year's exam timetable is posted?",
    "offline-room-message-13": "Second-term internships are up on the portal.",
  },
};

// Bandeaux à écarter avant chaque capture : proposition de gel de série,
// cookies (refus), conditions, installation de l'app (bt_pwa_closed, posée dès
// l'ouverture : le Chrome installé propose l'installation, pas le headless).
const helpers = `
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const byText = (sel, re) => [...document.querySelectorAll(sel)].find((n) => re.test(n.textContent.trim()));
const dismiss = async () => {
  const decline = byText('button', /^(Non, je repars de zéro|No, start over)$/i); if (decline) { decline.click(); await wait(400); }
  const reject = byText('button', /^(Tout refuser|Reject all)$/); if (reject) { reject.click(); await wait(300); }
  sessionStorage.setItem('bt_legal_notice_snoozed', '1');
  sessionStorage.setItem('bt_pwa_closed', '1');
  for (const b of [...document.querySelectorAll('button')]) {
    const label = (b.getAttribute('aria-label') || '') + ' ' + b.textContent.trim();
    if (!/(Fermer|Close|×|✕)/.test(label)) continue;
    let n = b; let fixed = false;
    while (n && n !== document.body) { if (getComputedStyle(n).position === 'fixed') { fixed = true; break; } n = n.parentElement; }
    if (fixed && b.getBoundingClientRect().top > window.innerHeight * 0.35) { b.click(); await wait(250); }
  }
};
`;

// Données de l'étudiant de démo, écrites dans la base locale de la fixture.
// Toutes les dates en jours LOCAUX (la fixture seed les date en UTC).
const demoSetup = `
  const T = ${JSON.stringify(T)};
  const db = JSON.parse(localStorage.getItem('bt_offline_db_v3') || 'null');
  if (!db) return 'no-db';
  const pad = (v) => String(v).padStart(2, '0');
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const me = db.profiles.find((p) => p.id === 'offline-user-mathias');
  Object.assign(me, { first_name: 'Camille', last_name: 'Morel', pseudo: 'camille', is_admin: false, study_field: T.field, bio: null, lang: '${lang}', timezone: '${TZ}', bonus_xp: 640 });
  const course = (id) => db.courses.find((c) => c.id === id);
  Object.assign(course('offline-course-methodo'), { name: T.methodo, exam_date: day(5) });
  Object.assign(course('offline-course-bio'), { name: T.micro, exam_date: day(19) });
  if (course('offline-course-compta')) course('offline-course-compta').name = T.compta;
  // Cours de test des espaces de cours (titre très long, correspondance à
  // confirmer) : utiles au développement, du bruit dans une capture publique.
  ['offline-course-demo-adv', 'offline-course-demo-media'].forEach((id) => { if (course(id)) course(id).archived_at = new Date(Date.now() - 864e5).toISOString(); });
  (db.course_candidates_demo || []).length = 0;
  Object.assign(db.exams.find((e) => e.id === 'offline-exam-1'), { name: T.examMethodo, exam_date: day(5) });
  Object.assign(db.exams.find((e) => e.id === 'offline-exam-2'), { name: T.examMicro, exam_date: day(19) });
  db.objectives.forEach((o) => { if (T.objectives[o.id]) o.title = T.objectives[o.id]; });
  const plan = { 'offline-objective-1': 0, 'offline-objective-2': 1, 'offline-objective-3': 0, 'offline-objective-4': 3, 'offline-objective-5': 5, 'offline-objective-6': 2 };
  db.objectives.forEach((o) => { if (o.id in plan) o.scheduled_date = day(plan[o.id]); });
  db.sessions.forEach((s) => { if (T.notes[s.id]) s.note = T.notes[s.id]; });
  const at = (n, h, m) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, m, 0, 0); return d; };
  const place = (id, start) => { const s = db.sessions.find((x) => x.id === id); if (!s) return; s.started_at = start.toISOString(); s.created_at = s.started_at; s.ended_at = new Date(start.getTime() + s.duration_seconds * 1000).toISOString(); s.timezone = '${TZ}'; delete s.day_parts_version; };
  place('offline-session-2', at(0, 10, 5));
  place('offline-session-1', at(-1, 16, 0));
  (db.course_checklist_items || []).forEach((c) => { if (T.checklist[c.id]) c.title = T.checklist[c.id]; });
  (db.course_offerings_demo || []).forEach((o) => { if (T.offerings[o.id]) o.title = T.offerings[o.id]; });
  const program = (db.course_rooms || []).find((r) => r.id === 'offline-room-program');
  if (program) Object.assign(program, { title: T.program, program_key: 'economie' });
  if (T.messages) (db.community_messages || []).forEach((m) => { if (T.messages[m.id]) m.content = T.messages[m.id]; });
  // Deux semaines sans trou : pas de proposition de gel par-dessus la capture.
  const localDay = (iso) => { const d = new Date(iso); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const studied = new Set(db.sessions.filter((s) => s.user_id === 'offline-user-mathias').map((s) => localDay(s.started_at)));
  for (let n = 1; n <= 14; n++) {
    const start = new Date(); start.setDate(start.getDate() - n); start.setHours(9 + (n % 4), 15, 0, 0);
    if (studied.has(localDay(start.toISOString()))) continue;
    const secs = (45 + (n * 17) % 70) * 60;
    db.sessions.push({ id: 'demo-fill-' + n, user_id: 'offline-user-mathias', course_id: n % 2 ? 'offline-course-bio' : 'offline-course-methodo', duration_seconds: secs, note: null, started_at: start.toISOString(), ended_at: new Date(start.getTime() + secs * 1000).toISOString(), created_at: start.toISOString(), timezone: '${TZ}' });
  }
  // Une vraie conversation avec Lina, et un groupe au nom crédible.
  const dm = (db.private_messages || []).find((m) => m.id === 'offline-dm-1');
  if (dm) {
    const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();
    const lina = dm.sender_id;
    Object.assign(dm, { content: T.dm[0], created_at: minutesAgo(95) });
    db.private_messages.push(
      { id: 'demo-dm-2', sender_id: 'offline-user-mathias', receiver_id: lina, content: T.dm[1], read: true, created_at: minutesAgo(88) },
      { id: 'demo-dm-3', sender_id: lina, receiver_id: 'offline-user-mathias', content: T.dm[2], read: true, created_at: minutesAgo(80) },
      { id: 'demo-dm-4', sender_id: 'offline-user-mathias', receiver_id: lina, content: T.dm[3], read: true, created_at: minutesAgo(48) },
    );
  }
  (db.study_groups || []).forEach((g) => { if (g.id === 'offline-group-1') Object.assign(g, { name: T.group[0], description: T.group[1] }); });
  (db.private_messages || []).forEach((m) => { m.read = true; });
  (db.friendships || []).forEach((f) => { if (f.status === 'pending') f.status = 'accepted'; });
  localStorage.setItem('bt_theme', 'light');
  localStorage.setItem('bt_lang_pref', '${lang}');
  return JSON.stringify(db);
`;

const page = await launch();
const R = { lang, mode, timezone: TZ, out: OUT, shots: [] };
const run = (code) => page.js(helpers + code);
const save = async (name) => {
  const { data } = await page.send("Page.captureScreenshot", { format: "png" });
  const file = join(OUT, `${name}.png`);
  writeFileSync(file, Buffer.from(data, "base64"));
  R.shots.push(`${name}.png`);
};
const shot = async (name) => {
  await run(`await dismiss(); window.scrollTo(0, 0); await wait(700); return 1;`);
  await save(`${name}-${mode}`);
};
const want = (name) => !only.length || only.includes(name);
const clickText = async (re, sel) => {
  const box = await run(`const re = ${re}; const el = [...document.querySelectorAll(${JSON.stringify(sel)})].filter((n) => re.test(n.textContent.trim()) && n.getBoundingClientRect().height > 0).sort((a, b) => a.textContent.length - b.textContent.length)[0]; if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
  if (!box) return false;
  await page.click(box.x, box.y);
  await sleep(900);
  return true;
};

try {
  await page.send("Emulation.setTimezoneOverride", { timezoneId: TZ });
  await page.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: SCALE, mobile: mode === "mobile" });
  if (mode === "mobile") await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  // Session de démo de la fixture hors ligne (aucun identifiant réel).
  await page.nav(`${BASE}/login`, 1500);
  await run(`localStorage.setItem('bt_offline_session_v1', JSON.stringify({ user: { id: 'offline-user-mathias', email: 'mathias@offline.local', app_metadata: {}, user_metadata: { pseudo: 'mathias' }, aud: 'authenticated', role: 'authenticated' }, access_token: 'offline-token', refresh_token: 'offline-refresh' })); localStorage.setItem('bt_lang_pref', '${lang}'); localStorage.setItem('bt_theme', 'light'); sessionStorage.setItem('bt_pwa_closed', '1'); return 1;`);
  // Un passage sur le tableau de bord sème la base, un sur /communautes les espaces de cours.
  await page.nav(`${BASE}/dashboard`, 3000);
  await page.nav(`${BASE}/communautes`, 3000);
  const edited = JSON.parse(await run(demoSetup));
  // Portions quotidiennes comme en production pour les sessions retouchées.
  const touched = new Set(edited.sessions.filter((x) => x.timezone === TZ && !x.day_parts_version).map((x) => x.id));
  edited.session_day_parts = (edited.session_day_parts || []).filter((part) => !touched.has(part.session_id));
  for (const session of edited.sessions) {
    if (!touched.has(session.id)) continue;
    session.timezone_source = "device";
    session.day_parts_version = DAY_PARTS_VERSION;
    for (const part of computeSessionDayParts(session)) edited.session_day_parts.push({ session_id: session.id, user_id: session.user_id, ...part });
  }
  R.setup = await run(`localStorage.setItem('bt_offline_db_v3', ${JSON.stringify(JSON.stringify(edited))}); return 'ok ' + ${touched.size};`);

  // Session en cours : 47 min 12 s sur le premier cours. Le tableau de bord
  // peut encore basculer un chrono en cours sur le plus ancien cours au
  // chargement : on réécrit la session et on recharge tant que ce n'est pas le bon.
  const setTimer = () => run(`localStorage.setItem('bt_timer_v2:offline-user-mathias', JSON.stringify({ courseId: 'offline-course-methodo', note: '', running: true, startMs: Date.now() - (47 * 60 + 12) * 1000, baseSeconds: 0, timezone: '${TZ}' })); return 1;`);
  const openDashboard = async () => {
    const seen = [];
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await setTimer();
      await page.nav(`${BASE}/dashboard?bt_notif=empty`, 4000);
      const courseId = await run(`try { return JSON.parse(localStorage.getItem('bt_timer_v2:offline-user-mathias')).courseId; } catch { return null; }`);
      if (courseId === "offline-course-methodo") return attempt;
      seen.push(courseId);
    }
    return `course-mismatch: ${seen.join(", ")}`;
  };
  await setTimer();

  const Q = "?bt_notif=empty";
  if (want("chrono")) { R.chrono = await openDashboard(); await shot("chrono"); }
  if (want("focus") && mode === "desktop") {
    R.focus = await openDashboard();
    await run(`await dismiss(); const b = [...document.querySelectorAll('button')].find((x) => /^(Focus)$/.test(x.textContent.trim())); if (b) b.click(); await wait(2500); return 1;`);
    await save(`focus-${mode}`);
  }
  if (want("planning")) {
    await page.nav(`${BASE}/planning${Q}`, 4000);
    await shot("planning");
    await clickText(lang === "fr" ? "/^Semaine$/" : "/^Week$/", "button");
    // En fin de semaine, la semaine suivante porte l'examen.
    await run(`const b = document.querySelector('button[aria-label*="suivant" i], button[aria-label*="next" i]'); if (b) { b.click(); await wait(900); } await dismiss(); window.scrollTo(0, 0); await wait(500); return 1;`);
    await save(`planning-week-${mode}`);
  }
  if (want("stats")) { await page.nav(`${BASE}/stats${Q}`, 4500); await shot("stats"); }
  if (want("progression")) { await page.nav(`${BASE}/progression${Q}`, 4000); await shot("progression"); }
  if (want("social")) {
    await page.nav(`${BASE}/messages${Q}`, 4000);
    await run(`await dismiss(); return 1;`);
    await clickText("/^Lina Martin/", "button, a, [role=button], li, div");
    await sleep(1200);
    await save(`social-${mode}`);
  }
  if (want("communautes")) {
    await page.nav(`${BASE}/communautes${Q}`, 4000);
    await run(`await dismiss(); await wait(500); const row = [...document.querySelectorAll('button, a')].find((x) => /Macro/.test(x.textContent) && x.getBoundingClientRect().height > 30); if (row) { row.click(); await wait(2500); } document.activeElement && document.activeElement.blur(); return 1;`);
    // Aucune action de message affichée par un survol résiduel.
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 4, y: 4 });
    await sleep(800);
    await save(`communautes-${mode}`);
  }
} catch (error) {
  R.error = String(error && error.stack || error);
  process.exitCode = 1;
} finally {
  R.consoleErrors = page.consoleErrors.slice(0, 8);
  console.log(JSON.stringify(R, null, 1));
  await page.close();
}
