import Head from "next/head";
import { useState } from "react";
import { useRouter } from "next/router";
import Leaderboard from "../../components/Leaderboard";
import UserProfileModal from "../../components/UserProfileModal";
import { useI18n } from "../../contexts/I18nContext";
import { supabase, isOfflineDev } from "../../lib/supabaseClient";

export function getServerSideProps() {
  return process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_OFFLINE_DEV === "true"
    ? { props: {} } : { notFound: true };
}

// Explicit local fixtures through the existing offline client. Never production
// data: this route is 404 outside development + offline mode.
export default function LeaderboardPreview() {
  const { setLang } = useI18n();
  const router = useRouter();
  const [count, setCount] = useState(6);
  const [longNames, setLongNames] = useState(false);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(null);
  const user = { id: "offline-user-mathias" };
  const profile = { university: "Université catholique de Louvain" };

  async function prepare(openStats = false) {
    if (!isOfflineDev) return;
    await supabase.auth.signInWithPassword();
    await supabase.from("profiles").select("*");
    const db = JSON.parse(localStorage.getItem("bt_offline_db_v3"));
    const self = db.profiles.find(p => p.id === user.id);
    const names = longNames
      ? ["Marie-Louise Van den Broeck", "Alexandre De la Rochefoucauld", "Jean-Christophe Vandenberghe", "Mathias Demo", "Léa Lambert", "Louis Simon"]
      : ["Sophie Durand", "Lucas Martin", "Emma Laurent", "Mathias Demo", "Léa Lambert", "Louis Simon"];
    const durations = [20220, 7200, 5820, 120, 60, 30];
    db.profiles = [self, ...names.filter((_, i) => i !== 3).map((name, i) => ({
      ...self, id: `podium-demo-${i}`, first_name: name, last_name: "", pseudo: `podium${i}`,
      avatar_url: null, is_admin: false, bonus_xp: 0,
    }))];
    db.sessions = names.slice(0, count).map((_, i) => ({
      id: `podium-session-${i}`, user_id: i === 3 ? user.id : `podium-demo-${i < 3 ? i : i - 1}`,
      course_id: null, started_at: new Date().toISOString(), duration_seconds: durations[i],
    }));
    localStorage.setItem("bt_offline_db_v3", JSON.stringify(db));
    setRevision(value => value + 1);
    if (openStats) router.push("/stats");
  }

  return <main className="bt-stats-readable mx-auto max-w-5xl p-5">
    <Head><title>Leaderboard — local fixtures</title><meta name="robots" content="noindex" /></Head>
    <h1 className="text-lg font-bold mb-3">Leaderboard · local fixtures</h1>
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <label>Members <select value={count} onChange={e => setCount(Number(e.target.value))}>
        {[0, 1, 2, 3, 6].map(value => <option key={value}>{value}</option>)}
      </select></label>
      <label><input type="checkbox" checked={longNames} onChange={e => setLongNames(e.target.checked)} /> Long names</label>
      <button className="btn-secondary px-3 min-h-11" onClick={() => prepare()}>Apply fixtures</button>
      <button className="btn-secondary px-3 min-h-11" onClick={() => prepare(true)}>Open Stats</button>
      <button className="btn-secondary px-3 min-h-11" onClick={() => setLang("fr")}>FR</button>
      <button className="btn-secondary px-3 min-h-11" onClick={() => setLang("en")}>EN</button>
      <button className="btn-secondary px-3 min-h-11" onClick={() => document.documentElement.classList.toggle("dark")}>Light / dark</button>
    </div>
    <div className="max-w-xl">
      <Leaderboard key={revision} user={user} profile={profile} onViewUser={setSelected} />
    </div>
    {selected && <UserProfileModal userId={selected} onClose={() => setSelected(null)} />}
  </main>;
}
