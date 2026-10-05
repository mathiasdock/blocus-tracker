import Head from "next/head";
import { useState } from "react";
import UserProfileModal from "../../components/UserProfileModal";
import { supabase, isOfflineDev } from "../../lib/supabaseClient";
import { useI18n } from "../../contexts/I18nContext";
import { useAuth } from "../../contexts/AuthContext";

const PEER = "7e7f38ea-5c6a-4513-b727-951a78b50ddd";
const ME = "offline-user-mathias";

export function getServerSideProps() {
  return process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_OFFLINE_DEV === "true"
    ? { props: {} } : { notFound: true };
}

// Local-only rehearsal of the real modal/controller. No service client,
// network writes, or test records in production. Fixture state is explicit.
export default function ProfilePreview() {
  const { setLang } = useI18n();
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [scenario, setScenario] = useState("friend");
  async function open() {
    if (!isOfflineDev) return;
    if (!user) await supabase.auth.signInWithPassword();
    await supabase.from("profiles").select("id");
    const db = JSON.parse(localStorage.getItem("bt_offline_db_v3"));
    db.profiles = db.profiles.filter(p => p.id !== PEER);
    db.profiles.find(p => p.id === ME).university = "University of Central Florida";
    db.profiles.push({ id: PEER, first_name: scenario === "long" ? "Alexandra Marie-Charlotte" : "Emma", last_name: "Laurent",
      pseudo: "emma.laurent", university: scenario === "long" ? "Université internationale des sciences et des technologies appliquées de Bruxelles" : "University of Central Florida",
      broad_field: "business", study_field: scenario === "long" ? "International Business, Strategic Marketing and Sustainable Management" : "Business & Management",
      study_year: "BAC 2", avatar_url: null, locked: false });
    db.friendships = db.friendships.filter(r => r.requester !== PEER && r.addressee !== PEER);
    if (scenario !== "stranger") db.friendships.push({ id: "profile-preview-link", requester: scenario === "incoming" ? PEER : ME,
      addressee: scenario === "incoming" ? ME : PEER, status: ["incoming", "outgoing"].includes(scenario) ? "pending" : "accepted" });
    db.courses = db.courses.filter(c => c.user_id !== PEER && !c.id.startsWith("profile-preview"));
    const names = ["Services Marketing", "Advertising Strategy", "International Marketing", "Principles of Advertising", "Event Sales"];
    const colors = ["#EC4899", "#06B6D4", "#2563EB", "#F97316", "#84CC16"];
    if (scenario !== "empty") {
      db.courses.push(...names.map((name, i) => ({ id: `profile-preview-${i}`, user_id: PEER, name: scenario === "long" ? `${name} — Advanced concepts and applications in international business` : name,
        color: colors[i], archived_at: null, study_institution_id: null })));
      db.courses.push({ id: "profile-preview-mine", user_id: ME, name: "Services Marketing", color: colors[0], archived_at: null, study_institution_id: null });
    }
    db.posts = db.posts.filter(p => p.user_id !== PEER);
    if (scenario !== "empty") db.posts.push(...["hours_50", "streak_7", "first_friend"].map((badgeId, i) => ({
      id: `profile-preview-post-${i}`, user_id: PEER, visibility: i === 2 ? "friends" : "public",
      activity: { version: 1, type: "badge_unlocked", badgeId }, created_at: new Date(Date.now() - i * 1000).toISOString(),
    })));
    db.social_profile_preview = { user_id: PEER, total_xp: scenario === "empty" ? 0 : 14000,
      streak: scenario === "empty" ? 0 : 7, badge_count: scenario === "empty" ? 0 : 12, seconds_30d: scenario === "empty" ? 0 : 100800 };
    localStorage.setItem("bt_offline_db_v3", JSON.stringify(db));
    setShow(true);
  }
  return <main className="p-6 space-y-4" style={{ background: "var(--bt-bg)", minHeight: "100dvh" }}>
    <Head><title>Profile — offline preview</title><meta name="robots" content="noindex" /></Head>
    <h1>Peer profile — local fixtures</h1>
    <label className="block">Scenario <select value={scenario} onChange={e => setScenario(e.target.value)}>
      {["friend", "stranger", "incoming", "outgoing", "empty", "long"].map(value => <option key={value}>{value}</option>)}
    </select></label>
    <button className="btn-secondary" onClick={() => setLang("fr")}>FR</button>{" "}
    <button className="btn-secondary" onClick={() => setLang("en")}>EN</button>{" "}
    <button className="btn-secondary" onClick={() => document.documentElement.classList.toggle("dark")}>Light / dark</button>
    <p><button className="btn-primary" onClick={open}>Open profile</button></p>
    {show && <UserProfileModal userId={PEER} onClose={() => setShow(false)} />}
  </main>;
}
