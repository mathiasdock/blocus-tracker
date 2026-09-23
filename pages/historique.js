import { useEffect, useMemo, useState, useCallback } from "react";
import LoadingScreen from "../components/LoadingScreen";
import Layout from "../components/Layout";
import TodaySessionsCard from "../components/TodaySessionsCard";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { useToast } from "../contexts/ToastContext";
import { supabase } from "../lib/supabaseClient";
import { clearClientCache } from "../lib/clientCache";
import { formatMinutesShort, localISO } from "../lib/format";

const PAGE_SIZE = 25;

// « Tout voir » depuis le Chrono arrive ici. Les sessions sont rangées par
// jour, chaque jour dans la même carte que « Sessions du jour » : mêmes lignes,
// même menu, même édition. Ce qu'on corrige sur le Chrono se corrige donc de
// la même façon sur une session d'il y a trois semaines.
export default function Historique() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const [sessions, setSessions] = useState([]);
  const [courses, setCourses] = useState([]);
  const [filterCourse, setFilterCourse] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const locale = lang === "en" ? "en-US" : "fr-BE";

  const fetchSessions = useCallback(async (offset, reset) => {
    if (!user) return;
    setLoading(true);
    let q = supabase
      .from("sessions")
      .select("*")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (filterCourse) q = q.eq("course_id", filterCourse);
    const { data } = await q;
    const rows = data || [];
    setSessions(prev => reset ? rows : [...prev, ...rows]);
    setHasMore(rows.length === PAGE_SIZE);
    setLoading(false);
  }, [user, filterCourse]);

  useEffect(() => {
    if (!user) return;
    supabase.from("courses").select("*").eq("user_id", user.id).then(({ data }) => setCourses(data || []));
  }, [user]);

  useEffect(() => {
    fetchSessions(0, true);
  }, [fetchSessions]);

  function loadMore() {
    fetchSessions(sessions.length, false);
  }

  // Le Chrono garde ses chiffres en cache : une correction faite ici doit s'y
  // voir au retour, pas au prochain rechargement.
  const forgetDashboard = useCallback(() => {
    if (user) clearClientCache(`dashboard:${user.id}:`);
  }, [user]);

  async function deleteSession(id) {
    const { error } = await supabase.from("sessions").delete().eq("id", id);
    if (error) { toast(t("dash.saveError"), "error"); return; }
    forgetDashboard();
    setSessions(prev => prev.filter(s => s.id !== id));
  }

  async function updateSession(session, { minutes, courseId }) {
    const newMins = Number.parseInt(minutes, 10);
    const maxMins = Math.floor(session.duration_seconds / 60);
    if (!Number.isFinite(newMins) || newMins < 1 || newMins > Math.max(1, maxMins)) return false;
    const newSecs = newMins * 60;
    // Même règle que sur le Chrono : la fin reste où elle est, le début recule.
    const endedAt = session.ended_at ? new Date(session.ended_at) : new Date(new Date(session.started_at).getTime() + session.duration_seconds * 1000);
    const startedAt = new Date(endedAt.getTime() - newSecs * 1000).toISOString();
    const { error } = await supabase.from("sessions").update({
      duration_seconds: newSecs,
      course_id: courseId || null,
      started_at: startedAt,
    }).eq("id", session.id);
    if (error) { toast(t("dash.saveError"), "error"); return false; }
    forgetDashboard();
    setSessions(prev => prev.map(s => s.id === session.id
      ? { ...s, duration_seconds: newSecs, course_id: courseId || null, started_at: startedAt }
      : s));
    return true;
  }

  const days = useMemo(() => {
    const groups = [];
    const byDay = new Map();
    for (const session of sessions) {
      const day = localISO(new Date(session.started_at));
      if (!byDay.has(day)) {
        const group = { day, sessions: [], secs: 0 };
        byDay.set(day, group);
        groups.push(group);
      }
      const group = byDay.get(day);
      group.sessions.push(session);
      group.secs += Number(session.duration_seconds || 0);
    }
    return groups;
  }, [sessions]);

  // Jours LOCAUX : une session à 00h30 appartient au jour qui commence, pas à
  // la veille en heure UTC.
  const today = localISO(new Date());
  const yesterday = localISO(new Date(new Date(`${today}T12:00:00`).getTime() - 86400000));
  const dayTitle = (day) => {
    if (day === today) return t("common.today");
    if (day === yesterday) return t("hist.yesterday");
    const label = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${day}T12:00:00`));
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const activeCourses = courses.filter(c => !c.archived_at);
  const totalSecs = sessions.reduce((a, s) => a + s.duration_seconds, 0);

  return (
    <Layout>
      <div className="bt-stagger" style={{ maxWidth: 820, margin: "0 auto" }}>
        <h1 className="text-2xl mb-0.5" style={{ color: "var(--bt-text-1)" }}>{t("hist.title")}</h1>
        <p className="text-sm mb-6" style={{ color: "var(--bt-text-2)" }}>{t("hist.subtitle")}</p>

        <div className="flex flex-wrap items-center gap-3 mb-5">
          <select className="input w-auto text-sm" value={filterCourse}
            aria-label={t("hist.allCourses")}
            onChange={e => setFilterCourse(e.target.value)}>
            <option value="">{t("hist.allCourses")}</option>
            {/* L'archive est ICI volontairement : filtrer son historique sur un
                cours du semestre passé est exactement ce qu'on vient y chercher.
                Ailleurs (chrono, planning) elle est masquée — on n'y CHOISIT
                plus un cours terminé, on le RELIT. */}
            {courses.map(c => (
              <option key={c.id} value={c.id}>
                {c.archived_at ? `${c.name} · ${t("stats.courseArchived")}` : c.name}
              </option>
            ))}
          </select>
          {sessions.length > 0 && (
            <span className="text-sm" style={{ color: "var(--bt-text-2)" }}>
              {t(sessions.length > 1 ? "hist.countMany" : "hist.countOne").replace("{n}", String(sessions.length))}
              {" · "}
              {t("hist.shownTotal")}{" "}
              <strong style={{ color: "var(--bt-text-1)" }}>{formatMinutesShort(totalSecs)}</strong>
            </span>
          )}
        </div>

        {sessions.length === 0 && !loading ? (
          <div className="card p-10 text-center text-sm" style={{ color: "var(--bt-text-3)" }}>{t("hist.empty")}</div>
        ) : (
          <div className="grid gap-4">
            {days.map((group, index) => (
              <TodaySessionsCard
                key={group.day}
                actionsHint={index === 0}
                title={dayTitle(group.day)}
                aside={(
                  <span className="font-num shrink-0 text-sm font-bold tabular-nums" style={{ color: "var(--bt-accent-text)" }}>
                    {formatMinutesShort(group.secs)}
                  </span>
                )}
                sessions={group.sessions}
                courses={courses}
                selectableCourses={activeCourses}
                onUpdate={updateSession}
                onDelete={deleteSession}
              />
            ))}
          </div>
        )}

        {loading && <LoadingScreen compact />}
        {hasMore && !loading && (
          <div className="text-center mt-4">
            <button onClick={loadMore} className="btn-ghost text-sm px-6">{t("hist.loadMore")}</button>
          </div>
        )}
      </div>
    </Layout>
  );
}
