import { useEffect, useState } from "react";
import { Avatar } from "./Layout";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { displayName, formatMinutesShort, todayISO } from "../lib/format";
import { loadUserLevelMap } from "../lib/userLevels";
import LevelPill from "./LevelPill";

export default function UserProfileModal({ userId, onClose }) {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const [profile, setProfile] = useState(null);
  const [relStatus, setRelStatus] = useState(null);
  const [planning, setPlanning] = useState(null);
  const [courses, setCourses] = useState([]);
  const [stats, setStats] = useState(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [mutualCount, setMutualCount] = useState(0);
  const [mutualSample, setMutualSample] = useState([]);
  const [levelInfo, setLevelInfo] = useState(null);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setMsg("");
    setRelStatus(null);
    setProfile(null);
    setPlanning(null);
    setCourses([]);
    setStats(null);
    setMutualCount(0);
    setMutualSample([]);
    setLevelInfo(null);
    (async () => {
      const [{ data: prof }, { data: coursesData }, { data: statsData }, levelMap] = await Promise.all([
        // Colonnes explicites — n'exposer JAMAIS l'email d'un autre utilisateur
        supabase.from("profiles")
          .select("id, pseudo, first_name, last_name, university, study_field, study_year, bio, avatar_url, lang, planning_public, studying_since, is_admin, locked, created_at")
          .eq("id", userId).maybeSingle(),
        supabase.from("courses").select("id, user_id, name, color, exam_date").eq("user_id", userId).order("name"),
        supabase.rpc("get_user_profile_stats", { p_user_id: userId }),
        loadUserLevelMap(supabase, [userId], { selfUserId: user?.id }),
      ]);
      setProfile(prof || { id: userId, pseudo: "Utilisateur" });
      setCourses(coursesData || []);
      if (statsData?.[0]) setStats(statsData[0]);
      setLevelInfo(levelMap[userId] || null);

      if (userId !== user.id) {
        // Mutual friends — fetch both friend lists and intersect
        const [{ data: myLinks }, { data: theirLinks }] = await Promise.all([
          supabase.from("friendships").select("requester, addressee").or(`requester.eq.${user.id},addressee.eq.${user.id}`).eq("status", "accepted"),
          supabase.from("friendships").select("requester, addressee").or(`requester.eq.${userId},addressee.eq.${userId}`).eq("status", "accepted"),
        ]);
        const myFriendSet = new Set((myLinks || []).map(l => l.requester === user.id ? l.addressee : l.requester));
        const theirFriendSet = new Set((theirLinks || []).map(l => l.requester === userId ? l.addressee : l.requester));
        const mutualIds = [...myFriendSet].filter(id => theirFriendSet.has(id));
        setMutualCount(mutualIds.length);
        if (mutualIds.length > 0) {
          const { data: mutualProfs } = await supabase
            .from("profiles").select("id, pseudo, first_name, last_name, avatar_url")
            .in("id", mutualIds.slice(0, 3));
          setMutualSample(mutualProfs || []);
        }

        const { data: link } = await supabase
          .from("friendships")
          .select("status")
          .or(
            `and(requester.eq.${user.id},addressee.eq.${userId}),and(requester.eq.${userId},addressee.eq.${user.id})`
          )
          .maybeSingle();
        setRelStatus(link?.status || null);

        if (link?.status === "accepted" && prof?.planning_public) {
          const { data: objs } = await supabase
            .from("objectives")
            .select("*")
            .eq("user_id", userId)
            .gte("scheduled_date", todayISO())
            .order("scheduled_date")
            .limit(10);
          setPlanning(objs || []);
        }
      }
      setLoading(false);
    })();
  }, [userId, user.id]);

  async function addFriend() {
    const { error } = await supabase
      .from("friendships")
      .insert({ requester: user.id, addressee: userId, status: "pending" });
    if (error) setMsg(t("friends.requestError"));
    else {
      setMsg(t("friends.requestSent"));
      setRelStatus("pending");
    }
  }

  if (!userId) return null;

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="card max-w-sm w-full p-6 overflow-y-auto"
        style={{ maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <p className="text-center py-8" style={{ color: "#A8A09A" }}>{t("common.loading")}</p>
        ) : (
          <>
            {/* Header */}
            <div className="flex flex-col items-center text-center">
              <Avatar url={profile.avatar_url} pseudo={displayName(profile)} size={80} />
              <h2 className="text-xl mt-3" style={{ color: "var(--bt-text-1)" }}>{displayName(profile)}</h2>
              <p className="text-sm" style={{ color: "var(--bt-text-3)" }}>@{profile.pseudo}</p>
              {(() => {
                const isStudying = profile.studying_since &&
                  (Date.now() - new Date(profile.studying_since).getTime()) < 10 * 60 * 1000;
                return isStudying ? (
                  <div className="flex items-center gap-1.5 mt-1.5 px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: "#EAFBF4", border: "1px solid #C6EED9" }}>
                    <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "#14B885" }} />
                    <span className="text-xs font-medium" style={{ color: "#0E8F68" }}>{t("profile.studyingNow")}</span>
                  </div>
                ) : null;
              })()}
              {/* Level pill + title */}
              {levelInfo && Number(levelInfo.totalXP) > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <LevelPill level={levelInfo.current.level} size="sm" solid />
                  <span className="text-xs font-medium" style={{ color: "var(--bt-text-2)" }}>
                    {t(levelInfo.current.titleKey)}
                  </span>
                </div>
              )}
              {/* Mutual friends */}
              {mutualCount > 0 && (
                <div className="flex items-center gap-1.5 mt-2">
                  {mutualSample.map(m => (
                    <Avatar key={m.id} url={m.avatar_url} pseudo={displayName(m)} size={20} />
                  ))}
                  <span className="text-xs" style={{ color: "var(--bt-text-3)" }}>
                    {mutualCount} {mutualCount === 1 ? t("modal.mutualFriend") : t("modal.mutualFriends")}
                  </span>
                </div>
              )}
              {(profile.university || profile.study_field) && (
                <p className="text-sm mt-1.5" style={{ color: "var(--bt-text-2)" }}>
                  {[profile.study_field, profile.study_year].filter(Boolean).join(" · ")}
                  {profile.university ? ` — ${profile.university}` : ""}
                </p>
              )}
              {profile.bio && (
                <p className="text-sm mt-2 italic" style={{ color: "var(--bt-text-3)" }}>
                  &laquo; {profile.bio} &raquo;
                </p>
              )}
            </div>

            {/* Aggregate stats */}
            {stats && (Number(stats.total_seconds) > 0) && (
              <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--bt-border)" }}>
                <p className="label mb-2">{t("modal.statsTitle")}</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: t("profile.totalHours"), value: formatMinutesShort(Number(stats.total_seconds)) },
                    { label: t("profile.hours30d"),   value: formatMinutesShort(Number(stats.seconds_30d)) },
                  ].map((s, i) => (
                    <div key={i} className="rounded-xl p-2.5 text-center" style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}>
                      <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: "var(--bt-text-3)" }}>{s.label}</p>
                      <p className="text-sm font-display tabular-nums" style={{ color: "var(--bt-text-1)" }}>{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cours */}
            {courses.length > 0 && (
              <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--bt-border)" }}>
                <p className="label mb-2">{t("friends.courses")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {courses.map((c) => (
                    <span key={c.id}
                      className="text-xs px-2.5 py-1 rounded-full font-medium text-white"
                      style={{ backgroundColor: c.color }}>
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Planning */}
            {planning && (
              <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--bt-border)" }}>
                <p className="label mb-2">{t("friends.upcoming")}</p>
                {planning.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--bt-text-3)" }}>{t("plan.nothing")}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {planning.map((o) => (
                      <li key={o.id} className="flex items-center gap-2 text-xs">
                        <span className="shrink-0 px-1.5 py-0.5 rounded-lg text-[10px] font-medium"
                          style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)" }}>
                          {new Date(o.scheduled_date).toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "short" })}
                        </span>
                        <span className="flex-1 truncate" style={{ color: "var(--bt-text-1)" }}>{o.title}</span>
                        {o.target_minutes > 0 && (
                          <span style={{ color: "var(--bt-text-3)" }}>{o.target_minutes} min</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Friend button */}
            {userId !== user.id && (
              <div className="mt-5">
                {relStatus === "accepted" ? (
                  <p className="text-sm text-center" style={{ color: "#0E8F68" }}>{t("modal.alreadyFriends")} ✓</p>
                ) : relStatus === "pending" ? (
                  <p className="text-sm text-center" style={{ color: "var(--bt-text-3)" }}>{t("modal.pendingFriend")}</p>
                ) : (
                  <button onClick={addFriend} className="btn-primary w-full">{t("modal.addFriend")}</button>
                )}
                {msg && <p className="text-xs text-center mt-2" style={{ color: "#0E8F68" }}>{msg}</p>}
              </div>
            )}
          </>
        )}
        <button onClick={onClose} className="btn-ghost w-full mt-4">{t("common.close")}</button>
      </div>
    </div>
  );
}
