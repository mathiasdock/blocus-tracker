import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import UniPicker from "../components/UniPicker";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabaseClient";
import { displayName, formatMinutesShort } from "../lib/format";
import { COMMUNITY_BY_ID, COUNTRIES } from "../lib/universities";

const ALL_UNI_FULLS = new Set(COUNTRIES.flatMap(c => c.universities).map(u => u.full));
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

const YEARS = [
  "BAC 1", "BAC 2", "BAC 3",
  "Année préparatoire", "Année passerelle",
  "Master 1", "Master 2",
  "Année de spécialisation", "Certificat / formation courte",
  "Doctorat", "Formation continue", "Autre",
];

/* ── Helper ────────────────────────────────────────────────── */
function relDate(isoStr) {
  if (!isoStr) return "Jamais";
  const days = Math.floor((Date.now() - new Date(isoStr).getTime()) / 864e5);
  if (days === 0) return "Auj.";
  if (days === 1) return "Hier";
  if (days < 7)  return `${days}j`;
  if (days < 30) return `${Math.floor(days / 7)} sem.`;
  return `${Math.floor(days / 30)} mois`;
}

function deltaLabel(pct) {
  if (pct === null || pct === undefined) return null;
  const sign = pct >= 0 ? "↑" : "↓";
  return { sign, abs: Math.abs(pct), positive: pct >= 0 };
}

/* ── Edit modal ────────────────────────────────────────────── */
function EditUserModal({ user, onClose, onSaved }) {
  const isCustomYear = user.study_year && !YEARS.includes(user.study_year);
  const [form, setForm] = useState({
    first_name:        user.first_name  || "",
    last_name:         user.last_name   || "",
    university:        user.university  || "",
    study_field:       user.study_field || "",
    study_year:        isCustomYear ? "Autre" : (user.study_year || ""),
    study_year_custom: isCustomYear ? user.study_year : "",
    bio:               user.bio         || "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function save(e) {
    e.preventDefault();
    setSaving(true); setErr("");
    const actualYear = form.study_year === "Autre"
      ? (form.study_year_custom.trim() || "Autre")
      : form.study_year;
    const { error } = await supabase.from("profiles").update({
      first_name:  form.first_name.trim()  || null,
      last_name:   form.last_name.trim()   || null,
      university:  form.university.trim()  || null,
      study_field: form.study_field.trim() || null,
      study_year:  actualYear              || null,
      bio:         form.bio.trim()         || null,
    }).eq("id", user.id);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved({ ...user, ...form });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card p-6 w-full max-w-md space-y-4 overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-medium" style={{ color: "var(--bt-text-1)" }}>Modifier @{user.pseudo}</h2>
        <form onSubmit={save} className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="label">Prénom</label>
              <input className="input" value={form.first_name} onChange={e => set("first_name", e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="label">Nom</label>
              <input className="input" value={form.last_name} onChange={e => set("last_name", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Université</label>
            <UniPicker value={form.university} onChange={v => set("university", v)} placeholder="Rechercher une université…" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="label">Filière</label>
              <input className="input" value={form.study_field} onChange={e => set("study_field", e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="label">Année</label>
              <select className="input" value={form.study_year} onChange={e => { set("study_year", e.target.value); set("study_year_custom", ""); }}>
                <option value="">—</option>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          {form.study_year === "Autre" && (
            <div>
              <label className="label">Précise l&apos;année d&apos;étude</label>
              <input className="input" placeholder="Ex : 3e année ingénieur…"
                value={form.study_year_custom} onChange={e => set("study_year_custom", e.target.value)} />
            </div>
          )}
          <div>
            <label className="label">Bio</label>
            <textarea className="input" rows={2} maxLength={160} value={form.bio} onChange={e => set("bio", e.target.value)} />
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Annuler</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── User detail modal ─────────────────────────────────────── */
function UserDetailModal({ user, userStat, isSelf, onClose, onEdit, onDelete }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [friendCount, setFriendCount] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const isOnline = !!user.studying_since;

  useEffect(() => {
    async function load() {
      const [{ data }, { count }, { data: refData }] = await Promise.all([
        supabase.from("sessions").select("duration_seconds, started_at, courses(name)")
          .eq("user_id", user.id).order("started_at", { ascending: false }).limit(8),
        supabase.from("friendships").select("id", { count: "exact", head: true })
          .or(`requester.eq.${user.id},addressee.eq.${user.id}`).eq("status", "accepted"),
        supabase.rpc("admin_get_referrals", { p_user_id: user.id }),
      ]);
      setSessions(data || []);
      setFriendCount(count ?? 0);
      setReferrals(refData?.ok ? (refData.list || []) : []);
      setLoading(false);
    }
    load();
  }, [user.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card p-6 w-full max-w-md space-y-4 overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-0.5">
              <span className="font-bold text-lg leading-tight" style={{ color: "var(--bt-text-1)" }}>@{user.pseudo}</span>
              {user.is_admin && (
                <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ backgroundColor: "#EAFBF4", color: "#0E8F68" }}>Admin</span>
              )}
              {isOnline && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ backgroundColor: "#EAFBF4", color: "#0E8F68" }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                  En ligne
                </span>
              )}
            </div>
            {displayName(user) !== user.pseudo && (
              <p className="text-sm" style={{ color: "var(--bt-text-2)" }}>{displayName(user)}</p>
            )}
            {user.university && (
              <p className="text-xs mt-0.5 truncate" style={{ color: "var(--bt-text-3)" }}>{user.university}</p>
            )}
            {(user.study_year || user.study_field) && (
              <p className="text-xs" style={{ color: "var(--bt-text-3)" }}>
                {[user.study_year, user.study_field].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <button onClick={onClose} className="shrink-0 text-xl leading-none mt-0.5" style={{ color: "var(--bt-text-3)" }}>✕</button>
        </div>

        {user.bio && (
          <p className="text-sm italic px-3 py-2 rounded-xl" style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)" }}>
            &ldquo;{user.bio}&rdquo;
          </p>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            { label: "Heures totales", value: formatMinutesShort(userStat?.totalSecs || 0) },
            { label: "Sessions totales", value: userStat?.count ?? 0 },
            { label: "Amis", value: friendCount !== null ? friendCount : "—" },
            { label: "Parrainages", value: referrals.length },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-3 text-center"
              style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}>
              <p className="text-xl font-display" style={{ color: "var(--bt-text-1)" }}>{s.value}</p>
              <p className="text-[10px] mt-0.5 leading-tight" style={{ color: "var(--bt-text-3)" }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Recent sessions */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--bt-text-3)" }}>
            Sessions récentes
          </p>
          {loading ? (
            <p className="text-sm" style={{ color: "var(--bt-text-3)" }}>Chargement…</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--bt-text-3)" }}>Aucune session enregistrée.</p>
          ) : (
            <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
              {sessions.map((s, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 px-3 rounded-xl"
                  style={{ backgroundColor: "var(--bt-subtle)" }}>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: "var(--bt-text-1)" }}>
                      {s.courses?.name || "Session libre"}
                    </p>
                    <p className="text-[10px]" style={{ color: "var(--bt-text-3)" }}>
                      {new Date(s.started_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <span className="text-xs font-semibold shrink-0 ml-2" style={{ color: "#14B885" }}>
                    {formatMinutesShort(s.duration_seconds)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Parrainages */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--bt-text-3)" }}>
            Parrainages
          </p>
          <div className="flex items-center justify-between py-1.5 px-3 rounded-xl mb-2"
            style={{ backgroundColor: "var(--bt-subtle)" }}>
            <span className="text-xs" style={{ color: "var(--bt-text-3)" }}>Code de parrainage</span>
            <span className="text-xs font-mono font-semibold" style={{ color: "var(--bt-text-1)" }}>
              {user.referral_code || "—"}
            </span>
          </div>
          {loading ? (
            <p className="text-sm" style={{ color: "var(--bt-text-3)" }}>Chargement…</p>
          ) : referrals.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--bt-text-3)" }}>Aucun filleul.</p>
          ) : (
            <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
              {referrals.map((r, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 px-3 rounded-xl"
                  style={{ backgroundColor: "var(--bt-subtle)" }}>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: "var(--bt-text-1)" }}>
                      @{r.pseudo}
                    </p>
                    <p className="text-[10px]" style={{ color: "var(--bt-text-3)" }}>
                      {new Date(r.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <span className="text-xs font-semibold shrink-0 ml-2" style={{ color: "#14B885" }}>
                    +{r.xp_awarded} XP
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-[10px]" style={{ color: "var(--bt-text-4)" }}>
          Inscrit le {new Date(user.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
        </p>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button onClick={onEdit} className="btn-primary flex-1">Éditer</button>
          {!isSelf && !user.is_admin && (
            <button onClick={onDelete}
              className="btn flex-1"
              style={{ backgroundColor: "#FEF2F2", color: "#DC2626", border: "1px solid #FEE2E2" }}>
              Supprimer
            </button>
          )}
          <button onClick={onClose} className="btn-ghost flex-1">Fermer</button>
        </div>
      </div>
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────── */
export default function Admin() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [tab, setTab]                     = useState("members");
  const [users, setUsers]                 = useState([]);
  const [busy, setBusy]                   = useState(true);
  const [search, setSearch]               = useState("");
  const [filterUni, setFilterUni]         = useState("");
  const [sortBy, setSortBy]               = useState("created_at");
  const [editingUser, setEditingUser]     = useState(null);
  const [detailUser, setDetailUser]       = useState(null);
  const [deletedAccounts, setDeletedAccounts] = useState([]);
  const [deletedBusy, setDeletedBusy]         = useState(false);
  const [sessionStats, setSessionStats]       = useState(null);
  const [sessionChartData, setSessionChartData] = useState([]);
  const [userStats, setUserStats]             = useState({});
  const [referralCounts, setReferralCounts]   = useState({});
  const [retentionStats, setRetentionStats]   = useState(null);
  const [uniDistribution, setUniDistribution] = useState([]);

  useEffect(() => {
    if (loading) return;
    if (!profile || !profile.is_admin) router.replace("/dashboard");
  }, [loading, profile, router]);

  const loadAll = useCallback(async () => {
    if (!profile || !profile.is_admin) return;

    /* ── Profiles ───────────────────────────────────────────── */
    const { data: u } = await supabase.from("profiles")
      .select("id, pseudo, first_name, last_name, university, study_field, study_year, bio, created_at, is_admin, studying_since, referral_code")
      .order("created_at", { ascending: false });
    const allUsers = u || [];
    setUsers(allUsers);

    /* ── Referral counts (admin RPC) ───────────────────────── */
    const { data: refData } = await supabase.rpc("admin_get_referral_counts");
    setReferralCounts(refData?.ok ? (refData.counts || {}) : {});

    /* ── All sessions ──────────────────────────────────────── */
    const { data: allSess } = await supabase
      .from("sessions")
      .select("user_id, duration_seconds, started_at")
      .order("started_at", { ascending: false });
    const allSessions = allSess || [];

    const now = new Date();
    const todayStr  = now.toISOString().slice(0, 10);
    const ago7Str   = new Date(now.getTime() -  7 * 864e5).toISOString().slice(0, 10);
    const ago14Str  = new Date(now.getTime() - 14 * 864e5).toISOString().slice(0, 10);
    const ago30Str  = new Date(now.getTime() - 30 * 864e5).toISOString().slice(0, 10);

    const sToday = allSessions.filter(s => s.started_at.slice(0, 10) === todayStr);
    const s7     = allSessions.filter(s => s.started_at.slice(0, 10) >= ago7Str);
    const sPrev7 = allSessions.filter(s => s.started_at.slice(0, 10) >= ago14Str && s.started_at.slice(0, 10) < ago7Str);
    const s30    = allSessions.filter(s => s.started_at.slice(0, 10) >= ago30Str);

    /* ── Per-user stats map ────────────────────────────────── */
    const statsMap = {};
    allSessions.forEach(s => {
      if (!statsMap[s.user_id]) statsMap[s.user_id] = { totalSecs: 0, lastAt: null, count: 0 };
      statsMap[s.user_id].totalSecs += s.duration_seconds;
      statsMap[s.user_id].count += 1;
      if (!statsMap[s.user_id].lastAt || s.started_at > statsMap[s.user_id].lastAt) {
        statsMap[s.user_id].lastAt = s.started_at;
      }
    });
    setUserStats(statsMap);

    /* ── Session stats ─────────────────────────────────────── */
    const totalSecs30  = s30.reduce((a, s) => a + s.duration_seconds, 0);
    const avgSecs      = s30.length ? Math.round(totalSecs30 / s30.length) : 0;
    const activeUsers7d = new Set(s7.map(s => s.user_id)).size;
    const thisWeekMins = Math.round(s7.reduce((a, s) => a + s.duration_seconds, 0) / 60);
    const prevWeekMins = Math.round(sPrev7.reduce((a, s) => a + s.duration_seconds, 0) / 60);
    const weekPct = prevWeekMins > 0 ? Math.round((thisWeekMins - prevWeekMins) / prevWeekMins * 100) : null;
    setSessionStats({ todaySessions: sToday.length, activeUsers7d, totalSecs30, avgSecs, totalSessions30: s30.length, weekPct });

    /* ── Chart data ────────────────────────────────────────── */
    const days30 = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now); d.setDate(d.getDate() - (29 - i));
      return d.toISOString().slice(0, 10);
    });
    const regByDay = {}, minsByDay = {};
    allUsers.forEach(usr => { const d = usr.created_at.slice(0, 10); regByDay[d] = (regByDay[d] || 0) + 1; });
    s30.forEach(s => { const d = s.started_at.slice(0, 10); minsByDay[d] = (minsByDay[d] || 0) + s.duration_seconds / 60; });
    setSessionChartData(days30.map(day => ({
      date:    day.slice(5).replace("-", "/"),
      comptes: regByDay[day]  || 0,
      minutes: Math.round(minsByDay[day] || 0),
    })));

    /* ── Retention stats ───────────────────────────────────── */
    const usersWithSession = new Set(allSessions.map(s => s.user_id));
    const active30dSet     = new Set(s30.map(s => s.user_id));
    const neverActive      = allUsers.filter(usr => !usersWithSession.has(usr.id)).length;
    const inactive30d      = allUsers.filter(usr => !active30dSet.has(usr.id)).length;
    const activationRate   = allUsers.length > 0 ? Math.round(usersWithSession.size / allUsers.length * 100) : 0;
    const onlineNow        = allUsers.filter(usr => usr.studying_since).length;
    setRetentionStats({ neverActive, inactive30d, activationRate, onlineNow });

    /* ── University distribution ───────────────────────────── */
    const uniCounts = {};
    allUsers.forEach(usr => {
      const key = usr.university || "Non renseignée";
      uniCounts[key] = (uniCounts[key] || 0) + 1;
    });
    const uniDist = Object.entries(uniCounts)
      .map(([full, count]) => {
        const meta = Object.values(COMMUNITY_BY_ID).find(m => m.full === full);
        const name = meta ? meta.name : (full.length <= 10 ? full : full.split(/[\s-]/)[0].slice(0, 10));
        return { name, full, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
    setUniDistribution(uniDist);

    setBusy(false);
  }, [profile]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const loadDeleted = useCallback(async () => {
    if (!profile || !profile.is_admin) return;
    setDeletedBusy(true);
    const { data } = await supabase
      .from("deleted_accounts")
      .select("*")
      .order("deleted_at", { ascending: false });
    setDeletedAccounts(data || []);
    setDeletedBusy(false);
  }, [profile]);

  useEffect(() => { if (tab === "deleted") loadDeleted(); }, [tab, loadDeleted]);

  if (loading || !profile) return null;
  if (!profile.is_admin) return null;

  async function deleteAccount(u) {
    if (u.id === profile.id) { alert("Tu ne peux pas supprimer ton propre compte."); return; }
    if (!confirm(`Supprimer définitivement le compte @${u.pseudo} et toutes ses données ?`)) return;
    const { error } = await supabase.rpc("admin_delete_user", { target: u.id });
    if (error) { alert("Échec : " + error.message); return; }
    setUsers(prev => prev.filter(x => x.id !== u.id));
    setDetailUser(null);
  }

  /* ── Derived data ──────────────────────────────────────── */
  const now = new Date();
  const todayStr   = now.toISOString().slice(0, 10);
  const weekAgoStr = new Date(now.getTime() -  7 * 864e5).toISOString().slice(0, 10);
  const monthAgoStr= new Date(now.getTime() - 30 * 864e5).toISOString().slice(0, 10);
  const todayCount = users.filter(u => u.created_at.slice(0, 10) === todayStr).length;
  const weekCount  = users.filter(u => u.created_at.slice(0, 10) >= weekAgoStr).length;
  const monthCount = users.filter(u => u.created_at.slice(0, 10) >= monthAgoStr).length;

  const q = search.trim().toLowerCase();
  const baseFiltered = users
    .filter(u => {
      if (!filterUni) return true;
      if (filterUni === "__autre__") return !ALL_UNI_FULLS.has(u.university || "");
      return u.university === filterUni;
    })
    .filter(u => !q || u.pseudo?.toLowerCase().includes(q) || u.first_name?.toLowerCase().includes(q) || u.last_name?.toLowerCase().includes(q) || u.university?.toLowerCase().includes(q));
  const filtered = [...baseFiltered].sort((a, b) => {
    if (sortBy === "university") return (a.university || "").localeCompare(b.university || "", "fr");
    if (sortBy === "last_name")  return (a.last_name  || "").localeCompare(b.last_name  || "", "fr");
    if (sortBy === "first_name") return (a.first_name || "").localeCompare(b.first_name || "", "fr");
    if (sortBy === "last_session") {
      const aT = userStats[a.id]?.lastAt || "";
      const bT = userStats[b.id]?.lastAt || "";
      return bT.localeCompare(aT);
    }
    if (sortBy === "referrals") {
      return (referralCounts[b.id] || 0) - (referralCounts[a.id] || 0);
    }
    return 0;
  });

  const tooltipStyle = {
    borderRadius: 14, border: "1px solid #E8E2DC",
    backgroundColor: "#FFFDFB", boxShadow: "0 4px 16px rgba(31,26,23,0.08)",
  };
  const weekDelta = deltaLabel(sessionStats?.weekPct);

  return (
    <Layout>
      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={updated => {
            setUsers(prev => prev.map(u => u.id === updated.id ? { ...u, ...updated } : u));
            setEditingUser(null);
          }}
        />
      )}
      {detailUser && (
        <UserDetailModal
          user={detailUser}
          userStat={userStats[detailUser.id]}
          isSelf={detailUser.id === profile.id}
          onClose={() => setDetailUser(null)}
          onEdit={() => { setEditingUser(detailUser); setDetailUser(null); }}
          onDelete={() => deleteAccount(detailUser)}
        />
      )}

      <div>
        <h1 className="text-2xl mb-0.5" style={{ color: "var(--bt-text-1)" }}>Administration</h1>
        <p className="text-sm mb-6" style={{ color: "var(--bt-text-2)" }}>Vue réservée aux administrateurs.</p>

        {busy ? (
          <p style={{ color: "var(--bt-text-3)" }}>Chargement…</p>
        ) : (
          <>
            {/* ── KPI strip ──────────────────────────────────────── */}
            <div className="card p-5 mb-6">
              {/* Comptes row */}
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-3 flex items-center gap-1.5" style={{ color: "var(--bt-text-3)" }}>
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: "#14B885" }} />
                Comptes
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-4 gap-y-4 pb-5 mb-5"
                style={{ borderBottom: "1px solid var(--bt-border)" }}>
                {[
                  { value: users.length,                      label: "Total membres",   accent: "#14B885" },
                  { value: retentionStats?.onlineNow ?? 0,    label: "En ligne",        accent: "#22c55e", dot: (retentionStats?.onlineNow ?? 0) > 0 },
                  { value: `+${todayCount}`,                   label: "Inscrits auj.",   accent: null },
                  { value: `+${weekCount}`,                    label: "Cette semaine",   accent: null },
                  { value: `+${monthCount}`,                   label: "Ce mois",         accent: null },
                  { value: `${retentionStats?.activationRate ?? 0}%`, label: "Activés",  accent: null },
                ].map(s => (
                  <div key={s.label}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-2xl font-display"
                        style={{ color: s.accent || "var(--bt-text-1)" }}>
                        {s.value}
                      </span>
                      {s.dot && <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "#22c55e" }} />}
                    </div>
                    <p className="text-[10px] mt-0.5 leading-tight" style={{ color: "var(--bt-text-3)" }}>{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Sessions row */}
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-3 flex items-center gap-1.5" style={{ color: "var(--bt-text-3)" }}>
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: "#0ea5e9" }} />
                Sessions d&apos;étude
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-4 gap-y-4">
                {[
                  { value: sessionStats?.todaySessions ?? 0,                         label: "Auj.",          accent: null },
                  { value: sessionStats?.activeUsers7d ?? 0,                         label: "Actifs 7j",     accent: "#0ea5e9" },
                  { value: formatMinutesShort(sessionStats?.totalSecs30 ?? 0),       label: "Temps 30j",     accent: null },
                  { value: formatMinutesShort(sessionStats?.avgSecs ?? 0),           label: "Durée moy.",    accent: null },
                  { value: retentionStats?.inactive30d ?? 0,                         label: "Inactifs 30j",  accent: null },
                  { value: retentionStats?.neverActive ?? 0,                         label: "Jamais actifs", accent: null },
                ].map(s => (
                  <div key={s.label}>
                    <span className="text-2xl font-display"
                      style={{ color: s.accent || "var(--bt-text-1)" }}>
                      {s.value}
                    </span>
                    <p className="text-[10px] mt-0.5 leading-tight" style={{ color: "var(--bt-text-3)" }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Charts row 1 : inscriptions + minutes ──────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <section className="card p-5">
                <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--bt-text-1)" }}>Inscriptions — 30 derniers jours</h2>
                <p className="text-xs mb-4" style={{ color: "var(--bt-text-3)" }}>
                  {monthCount} nouveaux ce mois-ci · {weekCount} cette semaine
                </p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={sessionChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} barCategoryGap="35%">
                    <CartesianGrid strokeDasharray="0" stroke="#F0EBE4" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#A8A09A" }} interval={4} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#A8A09A" }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={{ fontWeight: 600, color: "#1F1A17" }} cursor={{ fill: "#F7F3EF" }} formatter={v => [v, "Inscriptions"]} />
                    <Bar dataKey="comptes" fill="#14B885" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </section>

              <section className="card p-5">
                <div className="flex items-start justify-between mb-1">
                  <h2 className="text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>Minutes d&apos;étude — 30 derniers jours</h2>
                  {weekDelta && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg shrink-0 ml-2"
                      style={{
                        backgroundColor: weekDelta.positive ? "#EAFBF4" : "#FEF2F2",
                        color: weekDelta.positive ? "#0E8F68" : "#DC2626",
                      }}>
                      {weekDelta.sign}{weekDelta.abs}% vs sem. préc.
                    </span>
                  )}
                </div>
                <p className="text-xs mb-4" style={{ color: "var(--bt-text-3)" }}>
                  {sessionStats?.totalSessions30 ?? 0} sessions · durée moy. {formatMinutesShort(sessionStats?.avgSecs ?? 0)}
                </p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={sessionChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} barCategoryGap="35%">
                    <CartesianGrid strokeDasharray="0" stroke="#F0EBE4" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#A8A09A" }} interval={4} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#A8A09A" }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={{ fontWeight: 600, color: "#1F1A17" }} cursor={{ fill: "#F7F3EF" }} formatter={v => [v + " min", "Temps d'étude"]} />
                    <Bar dataKey="minutes" fill="#0ea5e9" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </section>
            </div>

            {/* ── Chart row 2 : university distribution ──────────── */}
            {uniDistribution.length > 0 && (
              <section className="card p-5 mb-6">
                <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--bt-text-1)" }}>Répartition par université</h2>
                <p className="text-xs mb-4" style={{ color: "var(--bt-text-3)" }}>
                  {uniDistribution.length} établissements représentés
                </p>
                <ResponsiveContainer width="100%" height={Math.max(180, uniDistribution.length * 30)}>
                  <BarChart data={uniDistribution} layout="vertical"
                    margin={{ top: 0, right: 36, left: 8, bottom: 0 }} barCategoryGap="28%">
                    <CartesianGrid strokeDasharray="0" stroke="#F0EBE4" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "#A8A09A" }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" width={72}
                      tick={{ fontSize: 11, fill: "#7C746E" }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={{ fontWeight: 600, color: "#1F1A17" }}
                      cursor={{ fill: "#F7F3EF" }}
                      formatter={(v, _, props) => [v + " membre" + (v > 1 ? "s" : ""), props.payload.full]} />
                    <Bar dataKey="count" fill="#8B5CF6" radius={[0, 5, 5, 0]}
                      label={{ position: "right", fontSize: 11, fill: "#A8A09A" }} />
                  </BarChart>
                </ResponsiveContainer>
              </section>
            )}

            {/* ── Sub-tabs ────────────────────────────────────────── */}
            <div className="flex gap-1 mb-5 p-1 rounded-2xl" style={{ backgroundColor: "var(--bt-subtle)" }}>
              {[
                { val: "members", label: `Membres (${users.length})` },
                { val: "deleted", label: `Supprimés${deletedAccounts.length ? ` (${deletedAccounts.length})` : ""}` },
              ].map(tOpt => (
                <button key={tOpt.val} onClick={() => setTab(tOpt.val)}
                  className="flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-all"
                  style={tab === tOpt.val
                    ? { backgroundColor: "var(--bt-surface)", color: "var(--bt-text-1)", boxShadow: "0 1px 4px rgba(31,26,23,0.08)" }
                    : { color: "var(--bt-text-2)" }}>
                  {tOpt.label}
                </button>
              ))}
            </div>

            {/* ── Deleted accounts ────────────────────────────────── */}
            {tab === "deleted" && (
              <section className="card p-5">
                <h2 className="text-base font-semibold mb-4" style={{ color: "var(--bt-text-1)" }}>
                  Comptes supprimés
                  <span className="text-sm font-normal ml-1" style={{ color: "var(--bt-text-3)" }}>({deletedAccounts.length})</span>
                </h2>
                {deletedBusy ? (
                  <p style={{ color: "var(--bt-text-3)" }}>Chargement…</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--bt-border)" }}>
                          {["Pseudo", "Nom", "Université", "Supprimé le"].map(h => (
                            <th key={h} className="pb-3 text-left"
                              style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--bt-text-3)", paddingRight: 12 }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {deletedAccounts.map(da => (
                          <tr key={da.id} style={{ borderBottom: "1px solid var(--bt-subtle)" }}>
                            <td className="py-3 pr-3 font-semibold" style={{ color: "var(--bt-text-1)" }}>@{da.pseudo || "—"}</td>
                            <td className="py-3 pr-3" style={{ color: "var(--bt-text-2)" }}>
                              {[da.first_name, da.last_name].filter(Boolean).join(" ") || "—"}
                            </td>
                            <td className="py-3 pr-3 max-w-[130px] truncate" style={{ color: "var(--bt-text-2)" }}>{da.university || "—"}</td>
                            <td className="py-3 pr-3 whitespace-nowrap text-xs" style={{ color: "var(--bt-text-3)" }}>
                              {new Date(da.deleted_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                            </td>
                          </tr>
                        ))}
                        {deletedAccounts.length === 0 && (
                          <tr>
                            <td colSpan={4} className="py-8 text-center text-sm" style={{ color: "var(--bt-text-3)" }}>Aucun compte supprimé.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {/* ── Members table ───────────────────────────────────── */}
            {tab === "members" && (
              <section className="card p-5">
                <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                  <h2 className="text-base font-semibold" style={{ color: "var(--bt-text-1)" }}>
                    Membres
                    <span className="text-sm font-normal ml-1" style={{ color: "var(--bt-text-3)" }}>({filtered.length})</span>
                  </h2>
                  <div className="flex gap-2 flex-wrap">
                    <input className="input w-36" placeholder="Rechercher…"
                      value={search} onChange={e => setSearch(e.target.value)} />
                    <select className="input w-44" value={filterUni} onChange={e => setFilterUni(e.target.value)}>
                      <option value="">Toutes les unifs</option>
                      {COUNTRIES.map(country => (
                        <optgroup key={country.code} label={country.name.replace(/\s*[^\w\s].*/,"").trim()}>
                          {country.universities.map(u => (
                            <option key={u.id} value={u.full}>{u.name}</option>
                          ))}
                        </optgroup>
                      ))}
                      <option value="__autre__">Autre</option>
                    </select>
                    <select className="input w-44" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                      <option value="created_at">Inscription (récent)</option>
                      <option value="last_session">Dernière session</option>
                      <option value="referrals">Parrainages (haut)</option>
                      <option value="university">Université</option>
                      <option value="last_name">Nom</option>
                      <option value="first_name">Prénom</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--bt-border)" }}>
                        {[
                          { label: "#",               cls: "" },
                          { label: "Pseudo",          cls: "" },
                          { label: "Nom",             cls: "hidden sm:table-cell" },
                          { label: "Université",      cls: "" },
                          { label: "Inscrit le",      cls: "hidden md:table-cell" },
                          { label: "Dernière session",cls: "" },
                          { label: "Heures totales",  cls: "hidden lg:table-cell" },
                          { label: "Parrainages",     cls: "" },
                          { label: "",                cls: "" },
                        ].map(h => (
                          <th key={h.label} className={`pb-3 text-left font-semibold ${h.cls}`}
                            style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--bt-text-3)", paddingRight: 12 }}>
                            {h.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(u => {
                        const stat = userStats[u.id];
                        const isOnline = !!u.studying_since;
                        return (
                          <tr key={u.id}
                            className="transition-colors cursor-pointer"
                            style={{ borderBottom: "1px solid var(--bt-subtle)" }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bt-subtle)"}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = ""}
                            onClick={() => setDetailUser(u)}>
                            <td className="py-3 pr-3 text-xs" style={{ color: "var(--bt-text-3)" }}>
                              {users.indexOf(u) + 1}
                            </td>
                            <td className="py-3 pr-3" style={{ color: "var(--bt-text-1)" }}>
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold">@{u.pseudo}</span>
                                {isOnline && (
                                  <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
                                    style={{ backgroundColor: "#22c55e" }} />
                                )}
                                {u.is_admin && (
                                  <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full"
                                    style={{ backgroundColor: "#EAFBF4", color: "#0E8F68" }}>A</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 pr-3 hidden sm:table-cell" style={{ color: "var(--bt-text-2)" }}>
                              {displayName(u) !== u.pseudo ? displayName(u) : "—"}
                            </td>
                            <td className="py-3 pr-3 max-w-[110px] truncate text-xs" style={{ color: "var(--bt-text-2)" }}>
                              {u.university
                                ? (Object.values(COMMUNITY_BY_ID).find(m => m.full === u.university)?.name || u.university.split(" ")[0])
                                : "—"}
                            </td>
                            <td className="py-3 pr-3 whitespace-nowrap text-xs hidden md:table-cell" style={{ color: "var(--bt-text-3)" }}>
                              {new Date(u.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                            </td>
                            <td className="py-3 pr-3 text-xs whitespace-nowrap"
                              style={{ color: stat?.lastAt ? "var(--bt-text-2)" : "var(--bt-text-4)" }}>
                              {relDate(stat?.lastAt)}
                            </td>
                            <td className="py-3 pr-3 text-xs hidden lg:table-cell"
                              style={{ color: stat?.totalSecs ? "var(--bt-text-2)" : "var(--bt-text-4)" }}>
                              {stat?.totalSecs ? formatMinutesShort(stat.totalSecs) : "—"}
                            </td>
                            <td className="py-3 pr-3 text-xs whitespace-nowrap">
                              {referralCounts[u.id] ? (
                                <span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full font-semibold"
                                  style={{ backgroundColor: "#EAFBF4", color: "#0E8F68" }}>
                                  {referralCounts[u.id]}
                                </span>
                              ) : (
                                <span style={{ color: "var(--bt-text-4)" }}>—</span>
                              )}
                            </td>
                            <td className="py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center gap-1.5">
                                <button onClick={() => setEditingUser(u)}
                                  className="text-xs px-2.5 py-1 rounded-lg font-medium transition-colors"
                                  style={{ backgroundColor: "#EAFBF4", color: "#0E8F68" }}>
                                  Éditer
                                </button>
                                {!u.is_admin && (
                                  <button onClick={() => deleteAccount(u)}
                                    className="text-xs px-2 py-1 rounded-lg transition-colors"
                                    style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
                                    Suppr.
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {filtered.length === 0 && (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-sm" style={{ color: "var(--bt-text-3)" }}>
                            Aucun résultat.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
