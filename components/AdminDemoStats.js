// Générateur de statistiques de démo — RÉSERVÉ À L'ADMIN, sur SON PROPRE compte.
// Sert à produire des captures d'écran promotionnelles crédibles (stats, graphes,
// heatmap, série, records) sans attendre des mois d'usage réel.
//
// Pourquoi générer de VRAIES sessions plutôt qu'un affichage truqué : toutes les
// vues (Stats, graphes, heatmap, records, XP/niveau, profil) dérivent de la table
// `sessions`. En écrivant de vraies lignes, tout reste cohérent partout, sans
// avoir à truquer chaque composant un par un.
//
// Sécurité : aucune migration n'est nécessaire — la policy RLS `sessions_write`
// (`using (auth.uid() = user_id)`) autorise déjà chacun à écrire SES sessions.
// Toutes les requêtes ici sont donc explicitement bornées à `user.id`, et le
// panneau n'est monté que derrière le gate `profile.is_admin` d'admin.js.
//
// Réversibilité : les identifiants générés sont mémorisés en localStorage pour
// permettre une annulation exacte. Le champ `note` est laissé vide À DESSEIN
// (il est affiché dans l'historique des sessions → un marqueur polluerait les
// captures). Filet de sécurité si le localStorage est perdu : suppression par
// plage de dates, puis en dernier recours suppression totale.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const STORE_KEY = "bt_admin_demo_sessions_v1";

// Insertion par TRÈS petits lots. Chaque ligne insérée déclenche deux triggers
// `FOR EACH ROW` (migration v28) : `validate_new_study_session` (qui agrège le
// total du jour) puis `refresh_gamification_after_event` (qui rejoue
// award_badges_for_user + refresh_daily_missions_for_user, donc rescanne tout
// l'historique). Un lot de 200 lignes = ~400 recalculs complets dans UNE
// requête → « canceling statement due to statement timeout » (8 s côté
// Supabase). 20 lignes tiennent largement dans le délai.
const INSERT_CHUNK = 20;
// La suppression ne déclenche aucun de ces triggers (ils sont sur INSERT/UPDATE),
// elle peut donc rester large.
const DELETE_CHUNK = 200;

// Générateur pseudo-aléatoire déterministe (mulberry32) — même graine = même
// jeu de données, donc une capture est reproductible à l'identique.
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function readStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return Array.isArray(v?.ids) ? v : null;
  } catch { return null; }
}

// Répartition des jours étudiés. `computeStreak` raisonne en dates LOCALES :
// on force donc un jour vide juste avant la série pour qu'elle vaille exactement
// la valeur demandée, et on garde des trous dans l'historique ancien (réaliste).
// Plafond par journée. Le trigger `validate_new_study_session` (migration v28)
// REJETTE toute insertion qui ferait dépasser 16 h d'étude sur une même journée
// locale. Avec 12 h/jour demandées et la variance (×1,45), on montait à 17,4 h →
// la base refusait la ligne. On borne donc en dessous du plafond serveur.
const MAX_DAY_MIN = 940; // 15 h 40, marge sous les 16 h du trigger

function buildDayPlan({ days, avgMin, streakDays, bestDayMin, rng }) {
  const plan = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    if (offset === streakDays && streakDays < days) continue; // coupure = borne la série
    const inStreak = offset < streakDays;
    if (!inStreak && rng() > 0.68) continue;                  // jours de repos
    const factor = 0.55 + rng() * 0.9;
    const mins = Math.min(MAX_DAY_MIN, Math.max(15, Math.round(avgMin * factor)));
    plan.push({ offset, minutes: mins });
  }
  // Journée record : posée hors de la série en cours pour ne pas gonfler la semaine.
  if (plan.length && bestDayMin > 0) {
    const pool = plan.filter(p => p.offset > streakDays);
    const list = pool.length ? pool : plan;
    list[Math.floor(rng() * list.length)].minutes = Math.min(MAX_DAY_MIN, bestDayMin);
  }
  return plan;
}

// Une journée → 1 à 3 sessions posées sur des créneaux plausibles.
function expandDay({ offset, minutes }, rng, courseIds, userId, now) {
  const rows = [];
  const count = minutes > 190 ? 3 : minutes > 85 ? 2 : 1;
  const slots = [9, 14, 20].slice(0, count);
  let left = minutes;

  slots.forEach((hour, i) => {
    const last = i === slots.length - 1;
    const raw = last ? left : Math.round((left / (slots.length - i)) * (0.8 + rng() * 0.4));
    const mins = Math.max(15, Math.min(left, raw));
    left -= mins;
    if (mins < 5) return;

    const base = new Date(now);
    base.setDate(base.getDate() - offset);
    const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(),
      hour, Math.floor(rng() * 50), 0, 0);
    let end = new Date(start.getTime() + mins * 60000);
    // Aujourd'hui : jamais de session dans le futur.
    if (end > now) {
      end = new Date(now.getTime() - Math.floor(rng() * 5) * 60000);
      if (end - start < 5 * 60000) return;
    }
    rows.push({
      user_id: userId,
      course_id: courseIds.length ? courseIds[Math.floor(rng() * courseIds.length)] : null,
      duration_seconds: Math.round((end - start) / 1000),
      started_at: start.toISOString(),
      ended_at: end.toISOString(),
    });
  });
  return rows;
}

export default function AdminDemoStats({ userId }) {
  const [days, setDays] = useState(90);
  const [avgMin, setAvgMin] = useState(150);
  const [streakDays, setStreakDays] = useState(12);
  const [bestDayMin, setBestDayMin] = useState(300);
  const [seed, setSeed] = useState(42);

  const [courses, setCourses] = useState([]);
  const [existing, setExisting] = useState(null);   // nb de sessions déjà présentes
  const [tracked, setTracked] = useState(null);     // dernière génération annulable
  const [status, setStatus] = useState(null);       // { kind, text }
  const [working, setWorking] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const [{ data: cs }, { count }] = await Promise.all([
      supabase.from("courses").select("id, name").eq("user_id", userId),
      supabase.from("sessions").select("id", { count: "exact", head: true }).eq("user_id", userId),
    ]);
    setCourses(cs || []);
    setExisting(count ?? 0);
    setTracked(readStore());
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Suppression par lots, bornée explicitement au compte courant (la RLS le
  // garantit déjà, mais on reste explicite sur une opération destructive).
  const removeIds = useCallback(async (ids) => {
    for (let i = 0; i < ids.length; i += DELETE_CHUNK) {
      const { error } = await supabase
        .from("sessions").delete()
        .eq("user_id", userId)
        .in("id", ids.slice(i, i + DELETE_CHUNK));
      if (error) throw error;
    }
  }, [userId]);

  async function generate() {
    if (!userId || working) return;
    setWorking(true);
    setStatus({ kind: "info", text: "Génération en cours…" });
    try {
      // Regénérer remplace toujours la démo précédente : sans ça les lots
      // s'empileraient (deux sessions sur un même jour) et les chiffres
      // deviendraient imprévisibles. Un clic = un jeu de stats propre.
      const previous = readStore();
      if (previous?.ids?.length) {
        setStatus({ kind: "info", text: `Nettoyage des ${previous.ids.length} sessions de démo précédentes…` });
        await removeIds(previous.ids);
        try { localStorage.removeItem(STORE_KEY); } catch {}
        setStatus({ kind: "info", text: "Génération en cours…" });
      }

      const rng = makeRng(seed);
      const now = new Date();
      const courseIds = courses.map(c => c.id);
      const plan = buildDayPlan({
        days: Math.max(1, days),
        avgMin: Math.max(15, avgMin),
        streakDays: Math.max(0, Math.min(streakDays, days)),
        bestDayMin,
        rng,
      });
      const rows = plan.flatMap(p => expandDay(p, rng, courseIds, userId, now));
      if (!rows.length) { setStatus({ kind: "error", text: "Aucune session à générer." }); return; }

      // On mémorise les ids APRÈS CHAQUE LOT, pas à la fin : si un lot échoue
      // (timeout, coupure réseau), les lignes déjà créées restent traçables et
      // « Tout réinitialiser » peut les nettoyer. Sinon elles deviendraient
      // orphelines en base, sans aucun moyen de les retrouver.
      const ids = [];
      const persist = () => {
        try { localStorage.setItem(STORE_KEY, JSON.stringify({ ids, at: new Date().toISOString() })); } catch {}
      };
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        const { data, error } = await supabase
          .from("sessions").insert(rows.slice(i, i + INSERT_CHUNK)).select("id");
        if (error) { persist(); setTracked(readStore()); throw error; }
        (data || []).forEach(r => ids.push(r.id));
        persist();
        setStatus({ kind: "info", text: `Création… ${ids.length} / ${rows.length} sessions` });
      }
      const totalH = Math.round(rows.reduce((s, r) => s + r.duration_seconds, 0) / 360) / 10;
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ ids, at: new Date().toISOString() }));
      } catch {}
      setStatus({
        kind: "ok",
        text: `${ids.length} sessions créées sur ${plan.length} jours (${totalH} h, série de ${streakDays} j).`,
      });
      refresh();
    } catch (e) {
      const msg = String(e?.message || e);
      const timedOut = /statement timeout|57014/i.test(msg);
      setStatus({
        kind: "error",
        text: timedOut
          ? "Échec : la base a coupé la requête (délai dépassé). Les sessions déjà créées sont conservées et traçables — clique « Tout réinitialiser », puis réessaie avec moins de jours."
          : `Échec : ${msg}`,
      });
      refresh();
    } finally {
      setWorking(false);
    }
  }

  // Remet le compte dans son état réel : supprime TOUTES les sessions de démo
  // suivies (tous lots confondus), sans toucher aux vraies sessions.
  async function resetAll() {
    const store = readStore();
    if (!store?.ids?.length || working) return;
    if (!confirm(`Supprimer les ${store.ids.length} sessions de démo et revenir à tes vraies stats ?`)) return;
    setWorking(true);
    setStatus({ kind: "info", text: "Réinitialisation…" });
    try {
      await removeIds(store.ids);
      try { localStorage.removeItem(STORE_KEY); } catch {}
      setStatus({ kind: "ok", text: `${store.ids.length} sessions de démo supprimées. Tes vraies stats sont de retour.` });
      refresh();
    } catch (e) {
      setStatus({ kind: "error", text: `Échec : ${e.message || e}` });
    } finally {
      setWorking(false);
    }
  }

  // Filet de sécurité si le localStorage a été perdu : on efface par plage de
  // dates (la génération occupe toujours les N derniers jours).
  async function deleteRange() {
    if (!userId || working) return;
    const n = parseInt(prompt("Supprimer TOUTES mes sessions des N derniers jours.\nN =", String(days)), 10);
    if (!Number.isFinite(n) || n <= 0) return;
    const from = new Date();
    from.setDate(from.getDate() - (n - 1));
    from.setHours(0, 0, 0, 0);
    if (!confirm(`Supprimer toutes TES sessions depuis le ${from.toLocaleDateString("fr-BE")} ? Action irréversible.`)) return;
    setWorking(true);
    setStatus({ kind: "info", text: "Suppression…" });
    try {
      const { error } = await supabase
        .from("sessions").delete()
        .eq("user_id", userId)
        .gte("started_at", from.toISOString());
      if (error) throw error;
      try { localStorage.removeItem(STORE_KEY); } catch {}
      setStatus({ kind: "ok", text: `Sessions des ${n} derniers jours supprimées.` });
      refresh();
    } catch (e) {
      setStatus({ kind: "error", text: `Échec : ${e.message || e}` });
    } finally {
      setWorking(false);
    }
  }

  const statusColor = status?.kind === "error" ? "#CB5A4E"
    : status?.kind === "ok" ? "var(--bt-accent-text)" : "var(--bt-text-3)";

  return (
    <div className="card p-5">
      <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--bt-text-3)" }}>
        Statistiques de démo (mon compte)
      </p>
      <p className="text-xs mb-4" style={{ color: "var(--bt-text-4)" }}>
        Génère de vraies sessions sur <strong>ton compte uniquement</strong>, pour des captures promotionnelles.
        Stats, graphes, heatmap, série et records deviennent cohérents partout.
        Régénère autant de fois que tu veux (chaque essai remplace le précédent), puis
        <strong> Tout réinitialiser</strong> pour retrouver tes vraies stats.
      </p>

      <div className="rounded-xl p-3 mb-4 text-xs leading-relaxed"
        style={{ backgroundColor: "rgba(217,119,6,0.10)", color: "var(--bt-text-2)", border: "1px solid rgba(217,119,6,0.25)" }}>
        <strong style={{ color: "#B45309" }}>À savoir :</strong> le classement (amis et public) lit la même table.
        Tant que les sessions de démo existent, elles comptent dans ton temps affiché aux autres utilisateurs.
        Supprime-les après tes captures.
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Field label="Jours d'historique" value={days} onChange={setDays} min={1} max={365} />
        <Field label="Moyenne (min/jour)" value={avgMin} onChange={setAvgMin} min={15} max={720} />
        <Field label="Série en cours (j)" value={streakDays} onChange={setStreakDays} min={0} max={365} />
        <Field label="Journée record (min)" value={bestDayMin} onChange={setBestDayMin} min={0} max={900} />
        <Field label="Graine (reproductible)" value={seed} onChange={setSeed} min={1} max={9999} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={generate} disabled={working} className="btn-primary px-4 py-2 text-sm">
          {working ? "…" : tracked?.ids?.length ? "Regénérer" : "Générer"}
        </button>
        <button onClick={resetAll} disabled={working || !tracked?.ids?.length} className="btn-ghost px-4 py-2 text-sm"
          style={{ opacity: tracked?.ids?.length ? 1 : 0.45 }}>
          Tout réinitialiser{tracked?.ids?.length ? ` (${tracked.ids.length})` : ""}
        </button>
        <button onClick={deleteRange} disabled={working} className="btn-ghost px-4 py-2 text-sm" style={{ color: "#CB5A4E" }}>
          Supprimer par plage…
        </button>
      </div>

      <p className="text-[11px] mt-3 leading-relaxed" style={{ color: "var(--bt-text-4)" }}>
        Une génération interrompue laisse des sessions déjà créées : elles restent traçables
        et « Tout réinitialiser » les enlève. Si le suivi a été perdu (autre navigateur, cache vidé),
        utilise « Supprimer par plage… » sur le nombre de jours généré.
      </p>
      <p className="text-[11px] mt-1.5" style={{ color: "var(--bt-text-4)" }}>
        {existing == null ? "…" : `${existing} session(s) sur ton compte`}
        {courses.length ? ` · réparties sur ${courses.length} cours` : " · aucun cours (sessions sans matière)"}
      </p>

      {status && (
        <p className="text-xs mt-2 font-medium" style={{ color: statusColor }}>{status.text}</p>
      )}
    </div>
  );
}

function Field({ label, value, onChange, min, max }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--bt-text-3)" }}>{label}</span>
      <input
        type="number" value={value} min={min} max={max}
        onChange={e => onChange(Math.max(min, Math.min(max, parseInt(e.target.value, 10) || 0)))}
        className="rounded-lg px-2.5 py-1.5 text-sm font-num tabular-nums"
        style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)", color: "var(--bt-text-1)" }}
      />
    </label>
  );
}
