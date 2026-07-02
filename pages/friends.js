import { useEffect, useState, useCallback } from "react";
import Layout, { Avatar } from "../components/Layout";
import UserProfileModal from "../components/UserProfileModal";
import { useAuth } from "../contexts/AuthContext";
import { useNotifications } from "../contexts/NotificationContext";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { formatMinutesShort, todayISO, lastNDates, displayName } from "../lib/format";
import { loadUserLevelMap } from "../lib/userLevels";
import { notifyXPChanged } from "../lib/xpEvents";
import LevelPill from "../components/LevelPill";

export default function Friends() {
  const { user, profile } = useAuth();
  const { markSeen } = useNotifications();
  const { t } = useI18n();
  const [myWeekSecs,  setMyWeekSecs]  = useState(0);
  const [myDaySecs,   setMyDaySecs]   = useState(0);
  const [myMonthSecs, setMyMonthSecs] = useState(0);
  const [period, setPeriod]           = useState("week"); // "day" | "week" | "month"
  const [query, setQuery]             = useState("");
  const [results, setResults]         = useState([]);
  const [links, setLinks]             = useState([]);
  const [friendData, setFriendData]   = useState({});
  const [friendLevels, setFriendLevels] = useState({});
  const [peopleMap, setPeopleMap]     = useState({});
  const [suggestions, setSuggestions]   = useState([]);
  const [showSugg, setShowSugg]         = useState(false);
  const [loadingSugg, setLoadingSugg]   = useState(false);
  const [showOutgoing, setShowOutgoing] = useState(false);
  const [msg, setMsg]               = useState("");
  const [viewUserId, setViewUserId] = useState(null);
  const [friendSearch, setFriendSearch] = useState("");

  const loadLinks = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("friendships")
      .select("*")
      .or(`requester.eq.${user.id},addressee.eq.${user.id}`);
    setLinks(data || []);
  }, [user]);

  useEffect(() => {
    loadLinks();
    markSeen("friends");
  }, [loadLinks, markSeen]);

  // My own study time (month + week + today)
  useEffect(() => {
    if (!user) return;
    (async () => {
      const since30 = lastNDates(30)[0];
      const since7  = lastNDates(7)[0];

      const { data: monthData } = await supabase
        .from("sessions")
        .select("duration_seconds")
        .eq("user_id", user.id)
        .gte("started_at", since30);
      setMyMonthSecs((monthData || []).reduce((a, s) => a + s.duration_seconds, 0));

      const { data: weekData } = await supabase
        .from("sessions")
        .select("duration_seconds")
        .eq("user_id", user.id)
        .gte("started_at", since7);
      setMyWeekSecs((weekData || []).reduce((a, s) => a + s.duration_seconds, 0));

      const { data: dayData } = await supabase
        .from("sessions")
        .select("duration_seconds")
        .eq("user_id", user.id)
        .gte("started_at", todayISO());
      setMyDaySecs((dayData || []).reduce((a, s) => a + s.duration_seconds, 0));
    })();
  }, [user]);

  // Resolve pseudos for everyone involved in friendship links.
  useEffect(() => {
    const ids = new Set();
    links.forEach((l) => { ids.add(l.requester); ids.add(l.addressee); });
    ids.delete(user?.id);
    if (ids.size === 0) { setPeopleMap({}); return; }
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, pseudo, first_name, last_name, avatar_url")
        .in("id", [...ids]);
      const map = {};
      (data || []).forEach((p) => (map[p.id] = p));
      setPeopleMap(map);
    })();
  }, [links, user]);

  const nameOf = (id) => displayName(peopleMap[id]);

  const acceptedIds = links
    .filter((l) => l.status === "accepted")
    .map((l) => (l.requester === user?.id ? l.addressee : l.requester));

  const incoming = links.filter((l) => l.status === "pending" && l.addressee === user?.id);
  const outgoing = links.filter((l) => l.status === "pending" && l.requester === user?.id);

  // Load friends' data (30 days to support all period filters) + refresh every 30s
  const loadFriends = useCallback(async () => {
    if (!acceptedIds.length) { setFriendData({}); setFriendLevels({}); return; }
    const since = lastNDates(30)[0];
    const [{ data: profs }, { data: courses }, { data: sessions }, { data: objs }, levelMap] =
      await Promise.all([
        // Colonnes explicites — pas d'email exposé dans la liste d'amis
        supabase.from("profiles")
          .select("id, pseudo, first_name, last_name, university, study_field, study_year, bio, avatar_url, planning_public, studying_since, is_admin, created_at")
          .in("id", acceptedIds),
        supabase.from("courses").select("*").in("user_id", acceptedIds),
        supabase.from("sessions").select("*").in("user_id", acceptedIds).gte("started_at", since),
        supabase.from("objectives").select("*").in("user_id", acceptedIds)
          .gte("scheduled_date", todayISO()).order("scheduled_date"),
        loadUserLevelMap(supabase, acceptedIds, { selfUserId: user.id }),
      ]);
    const map = {};
    (profs || []).forEach((p) => { map[p.id] = { profile: p, courses: [], sessions: [], objectives: [] }; });
    (courses || []).forEach((c) => map[c.user_id]?.courses.push(c));
    (sessions || []).forEach((s) => map[s.user_id]?.sessions.push(s));
    // Respecte le toggle "planning public" du profil — même règle que UserProfileModal.
    (objs || []).forEach((o) => { if (map[o.user_id]?.profile.planning_public) map[o.user_id].objectives.push(o); });
    setFriendData(map);
    setFriendLevels(levelMap);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(acceptedIds)]);

  useEffect(() => { loadFriends(); }, [loadFriends]);

  useEffect(() => {
    const id = setInterval(loadFriends, 30_000);
    return () => clearInterval(id);
  }, [loadFriends]);

  async function search(e) {
    e.preventDefault();
    setMsg("");
    const q = query.trim();
    if (!q) return;
    const { data } = await supabase
      .from("profiles")
      // Colonnes explicites — pas d'email dans les résultats de recherche
      .select("id, pseudo, first_name, last_name, university, study_field, study_year, avatar_url, studying_since")
      .or(`pseudo.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
      .neq("id", user.id)
      .limit(10);
    setResults(data || []);
  }

  function relation(id) {
    const l = links.find(
      (x) => (x.requester === id && x.addressee === user.id) ||
              (x.addressee === id && x.requester === user.id)
    );
    return l ? l.status : null;
  }

  async function addFriend(id) {
    const { error } = await supabase
      .from("friendships")
      .insert({ requester: user.id, addressee: id, status: "pending" });
    if (error) setMsg(t("friends.requestError"));
    else {
      setMsg(t("friends.requestSent"));
      notifyXPChanged();
    }
    setSuggestions((prev) => prev.filter((p) => p.id !== id));
    loadLinks();
  }

  async function loadSuggestions() {
    setShowSugg(true);
    setLoadingSugg(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, pseudo, first_name, last_name, avatar_url, university")
      .neq("id", user.id)
      .limit(200);
    const connected = new Set();
    links.forEach((l) => { connected.add(l.requester); connected.add(l.addressee); });
    const myUni = (profile?.university || "").trim().toLowerCase();
    const list = (data || [])
      .filter((p) => !connected.has(p.id))
      .sort((a, b) => {
        const sameA = myUni && (a.university || "").trim().toLowerCase() === myUni ? 0 : 1;
        const sameB = myUni && (b.university || "").trim().toLowerCase() === myUni ? 0 : 1;
        return sameA - sameB;
      })
      .slice(0, 40);
    setSuggestions(list);
    setLoadingSugg(false);
  }

  async function accept(linkId) {
    const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("id", linkId);
    if (!error) notifyXPChanged();
    loadLinks();
  }

  async function removeLink(linkId) {
    await supabase.from("friendships").delete().eq("id", linkId);
    loadLinks();
  }

  // Period label for friend cards
  const periodLabel =
    period === "day"   ? t("common.today") :
    period === "week"  ? t("friends.period7d") :
                         t("friends.period30d");

  const since7 = lastNDates(7)[0];

  return (
    <Layout>
      <h1 className="text-2xl mb-0.5" style={{ color: "var(--bt-text-1)" }}>{t("friends.title")}</h1>
      <p className="text-sm mb-6" style={{ color: "var(--bt-text-2)" }}>{t("friends.subtitle")}</p>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ── Colonne gauche ─────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Recherche */}
          <section className="card p-5">
            <h2 className="text-base font-semibold mb-3" style={{ color: "var(--bt-text-1)" }}>{t("friends.add")}</h2>
            <form onSubmit={search} className="flex gap-2">
              <input className="input" placeholder={t("friends.searchPlaceholder")}
                value={query} onChange={(e) => setQuery(e.target.value)} />
              <button className="btn-primary shrink-0">OK</button>
            </form>
            {msg && <p className="text-xs mt-2" style={{ color: "#0E8F68" }}>{msg}</p>}
            <ul className="mt-3 space-y-2">
              {results.map((r) => {
                const rel = relation(r.id);
                return (
                  <li key={r.id} className="flex items-center gap-2 text-sm">
                    <button onClick={() => setViewUserId(r.id)} className="flex items-center gap-2 flex-1 text-left">
                      <Avatar url={r.avatar_url} pseudo={displayName(r)} size={28} />
                      <span className="flex-1" style={{ color: "var(--bt-text-1)" }}>
                        {displayName(r)}{" "}
                        <span style={{ color: "var(--bt-text-3)" }}>@{r.pseudo}</span>
                      </span>
                    </button>
                    {rel === "accepted" ? (
                      <span className="text-xs" style={{ color: "var(--bt-text-3)" }}>{t("friends.alreadyFriend")}</span>
                    ) : rel === "pending" ? (
                      <span className="text-xs" style={{ color: "var(--bt-text-3)" }}>{t("friends.pendingStatus")}</span>
                    ) : (
                      <button onClick={() => addFriend(r.id)} className="btn-ghost text-xs px-2.5 py-1">
                        {t("friends.addBtn")}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Suggestions */}
          <section className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold" style={{ color: "var(--bt-text-1)" }}>{t("friends.suggestions")}</h2>
              {showSugg && (
                <button onClick={() => setShowSugg(false)}
                  className="w-6 h-6 flex items-center justify-center rounded-full transition-colors"
                  style={{ color: "var(--bt-text-3)", backgroundColor: "var(--bt-subtle)" }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bt-border)"}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = "var(--bt-subtle)"}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>
            {!showSugg ? (
              <button onClick={loadSuggestions} className="btn-primary w-full">
                {t("friends.seeSuggestions")}
              </button>
            ) : loadingSugg ? (
              <p className="text-sm" style={{ color: "var(--bt-text-3)" }}>{t("common.loading")}</p>
            ) : suggestions.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--bt-text-3)" }}>{t("friends.noSuggestions")}</p>
            ) : (
              <div className="[&::-webkit-scrollbar]:hidden"
                style={{ maxHeight: "360px", overflowY: "auto", scrollbarWidth: "none" }}>
                <ul className="space-y-2">
                  {suggestions.map((s) => {
                    const sameUni = profile?.university &&
                      (s.university || "").trim().toLowerCase() === profile.university.trim().toLowerCase();
                    return (
                      <li key={s.id} className="flex items-center gap-2 text-sm">
                        <button onClick={() => setViewUserId(s.id)} className="flex items-center gap-2 flex-1 text-left">
                          <Avatar url={s.avatar_url} pseudo={displayName(s)} size={28} />
                          <span className="flex-1" style={{ color: "var(--bt-text-1)" }}>
                            {displayName(s)}{" "}
                            <span style={{ color: "var(--bt-text-3)" }}>@{s.pseudo}</span>
                            {sameUni && (
                              <span className="block text-[10px] font-semibold" style={{ color: "#14B885" }}>
                                {t("friends.sameUni")}
                              </span>
                            )}
                          </span>
                        </button>
                        <button onClick={() => addFriend(s.id)} className="btn-primary text-xs px-2.5 py-1">
                          {t("friends.addBtn")}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>

          {/* Demandes reçues */}
          {incoming.length > 0 && (
            <section className="card p-5">
              <h2 className="text-base font-semibold mb-3" style={{ color: "var(--bt-text-1)" }}>{t("friends.incoming")}</h2>
              <ul className="space-y-2">
                {incoming.map((l) => (
                  <li key={l.id} className="flex items-center gap-2 text-sm">
                    <button onClick={() => setViewUserId(l.requester)} className="flex items-center gap-2 flex-1 text-left">
                      <Avatar url={peopleMap[l.requester]?.avatar_url} pseudo={nameOf(l.requester)} size={28} />
                      <span className="font-medium" style={{ color: "var(--bt-text-1)" }}>{nameOf(l.requester)}</span>
                    </button>
                    <button onClick={() => accept(l.id)} className="btn-primary text-xs px-2.5 py-1">{t("friends.accept")}</button>
                    <button onClick={() => removeLink(l.id)} className="btn-ghost text-xs px-2.5 py-1">{t("friends.refuse")}</button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Demandes envoyées — repliées par défaut */}
          {outgoing.length > 0 && (
            <section className="card px-5 py-3">
              <button
                onClick={() => setShowOutgoing(v => !v)}
                className="w-full flex items-center justify-between text-sm transition-colors"
                style={{ color: "var(--bt-text-2)" }}>
                <span className="flex items-center gap-1.5">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                  <span className="font-medium">{outgoing.length}</span>{" "}
                  {outgoing.length > 1 ? t("friends.outgoingPlural") : t("friends.outgoingSingular")}
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  className={`transition-transform ${showOutgoing ? "rotate-180" : ""}`}>
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </button>
              {showOutgoing && (
                <ul className="mt-3 space-y-2 text-sm">
                  {outgoing.map((l) => (
                    <li key={l.id} className="flex items-center gap-2">
                      <Avatar url={peopleMap[l.addressee]?.avatar_url} pseudo={nameOf(l.addressee)} size={24} />
                      <span className="flex-1" style={{ color: "var(--bt-text-2)" }}>{nameOf(l.addressee)}</span>
                      <button onClick={() => removeLink(l.id)}
                        className="text-xs transition-colors"
                        style={{ color: "var(--bt-text-3)" }}
                        onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                        onMouseLeave={e => e.currentTarget.style.color = "var(--bt-text-3)"}>
                        {t("friends.cancel")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        {/* ── Colonne droite ─────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {(() => {
            const sortedFriendIds = acceptedIds
              .filter(fid => friendData[fid])
              .sort((a, b) => {
                const na = (friendData[a]?.profile?.first_name || friendData[a]?.profile?.pseudo || "").toLowerCase();
                const nb = (friendData[b]?.profile?.first_name || friendData[b]?.profile?.pseudo || "").toLowerCase();
                return na.localeCompare(nb, "fr");
              });
            const q = friendSearch.trim().toLowerCase();
            const filteredFriendIds = q
              ? sortedFriendIds.filter(fid => {
                  const p = friendData[fid]?.profile;
                  return (
                    p?.first_name?.toLowerCase().includes(q) ||
                    p?.last_name?.toLowerCase().includes(q) ||
                    p?.pseudo?.toLowerCase().includes(q)
                  );
                })
              : sortedFriendIds;
            return (
              <section className="card overflow-hidden">
                {acceptedIds.length > 0 && (
                  <div className="px-4 py-3 flex items-center gap-2 flex-wrap"
                    style={{ borderBottom: "1px solid var(--bt-border)" }}>
                    {/* Search bar */}
                    <div className="flex items-center gap-2 rounded-xl px-3 py-2 flex-1 min-w-0"
                      style={{ backgroundColor: "var(--bt-subtle)" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A8A09A" strokeWidth="2" strokeLinecap="round">
                        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                      </svg>
                      <input
                        className="flex-1 bg-transparent text-sm outline-none min-w-0"
                        placeholder={t("friends.searchFriendPlaceholder")}
                        style={{ color: "var(--bt-text-1)" }}
                        value={friendSearch}
                        onChange={e => setFriendSearch(e.target.value)}
                      />
                      {friendSearch && (
                        <button onClick={() => setFriendSearch("")} style={{ color: "var(--bt-text-3)" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      )}
                    </div>
                    {/* Period filter */}
                    <div className="flex rounded-xl overflow-hidden text-xs font-medium shrink-0"
                      style={{ border: "1px solid var(--bt-border)" }}>
                      {[
                        { val: "day",   label: t("common.today") },
                        { val: "week",  label: t("friends.period7d") },
                        { val: "month", label: t("friends.period30d") },
                      ].map(opt => (
                        <button key={opt.val} onClick={() => setPeriod(opt.val)}
                          className="px-3 py-1.5 transition-colors"
                          style={period === opt.val
                            ? { backgroundColor: "#14B885", color: "#fff" }
                            : { backgroundColor: "var(--bt-surface)", color: "var(--bt-text-2)" }}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {acceptedIds.length === 0 ? (
                  <p className="p-6 text-center text-sm" style={{ color: "var(--bt-text-3)" }}>{t("friends.none")}</p>
                ) : filteredFriendIds.length === 0 ? (
                  <p className="p-6 text-center text-sm" style={{ color: "var(--bt-text-3)" }}>{t("friends.noneFound")}</p>
                ) : (
                  <ul>
                    {filteredFriendIds.map((fid, idx) => {
                      const fd = friendData[fid];
                      const todaySecs = fd.sessions
                        .filter((s) => s.started_at.slice(0, 10) === todayISO())
                        .reduce((a, s) => a + s.duration_seconds, 0);
                      const weekSecs = fd.sessions
                        .filter(s => s.started_at >= since7)
                        .reduce((a, s) => a + s.duration_seconds, 0);
                      const monthSecs = fd.sessions.reduce((a, s) => a + s.duration_seconds, 0);
                      const secsToShow = period === "day" ? todaySecs : period === "week" ? weekSecs : monthSecs;

                      const studyingSince = fd.profile?.studying_since;
                      const presenceAge = studyingSince ? (Date.now() - new Date(studyingSince).getTime()) : Infinity;
                      const isStudying = presenceAge < 10 * 60 * 1000;

                      return (
                        <li key={fid} style={idx > 0 ? { borderTop: "1px solid var(--bt-border)" } : {}}>
                          <button
                            onClick={() => setViewUserId(fid)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bt-subtle)"}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = ""}>
                            <div className="relative shrink-0">
                              <Avatar url={fd.profile?.avatar_url} pseudo={displayName(fd.profile)} size={38} />
                              {isStudying && (
                                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white animate-pulse"
                                  style={{ backgroundColor: "#14B885" }} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: "var(--bt-text-1)" }}>
                                <span className="truncate">{displayName(fd.profile)}</span>
                                {Number(friendLevels[fid]?.totalXP) > 0 && (
                                  <LevelPill level={friendLevels[fid].current.level} />
                                )}
                              </p>
                              <p className="text-xs truncate" style={{ color: "var(--bt-text-3)" }}>@{fd.profile?.pseudo}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-sm font-bold tabular-nums" style={{ color: "#0E8F68" }}>
                                {formatMinutesShort(secsToShow)}
                              </p>
                              <p className="text-[10px]" style={{ color: "var(--bt-text-3)" }}>
                                {periodLabel}
                              </p>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })()}
        </div>
      </div>

      {viewUserId && (
        <UserProfileModal userId={viewUserId} onClose={() => setViewUserId(null)} />
      )}
    </Layout>
  );
}
