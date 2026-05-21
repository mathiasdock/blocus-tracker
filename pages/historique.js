import { useEffect, useState, useCallback } from "react";
import Layout from "../components/Layout";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { formatMinutesShort } from "../lib/format";

const PAGE_SIZE = 25;

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function Historique() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [sessions, setSessions] = useState([]);
  const [courses, setCourses] = useState([]);
  const [filterCourse, setFilterCourse] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

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

  const courseName  = id => courses.find(c => c.id === id)?.name || "—";
  const courseColor = id => courses.find(c => c.id === id)?.color || "#94a3b8";
  const totalSecs = sessions.reduce((a, s) => a + s.duration_seconds, 0);

  return (
    <Layout>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <h1 className="text-2xl mb-0.5" style={{ color: "var(--bt-text-1)" }}>{t("hist.title")}</h1>
        <p className="text-sm mb-6" style={{ color: "var(--bt-text-2)" }}>{t("hist.subtitle")}</p>

        <div className="flex flex-wrap items-center gap-3 mb-5">
          <select className="input w-auto text-sm" value={filterCourse}
            onChange={e => setFilterCourse(e.target.value)}>
            <option value="">Tous les cours</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {sessions.length > 0 && (
            <span className="text-sm" style={{ color: "#7C746E" }}>
              {sessions.length} session{sessions.length > 1 ? "s" : ""}
              {" "}· Total affiché : <strong style={{ color: "#1F1A17" }}>{formatMinutesShort(totalSecs)}</strong>
            </span>
          )}
        </div>

        <div className="card overflow-hidden">
          {sessions.length === 0 && !loading ? (
            <div className="p-10 text-center text-sm" style={{ color: "#A8A09A" }}>{t("hist.empty")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--bt-border)", backgroundColor: "var(--bt-subtle)" }}>
                    {["Date", "Cours", "Durée", "Note"].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide"
                        style={{ color: "var(--bt-text-2)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s, i) => (
                    <tr key={s.id} style={{ borderBottom: i < sessions.length - 1 ? "1px solid var(--bt-subtle)" : "" }}>
                      <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: "var(--bt-text-2)" }}>
                        {formatDate(s.started_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: courseColor(s.course_id) }} />
                          <span style={{ color: "var(--bt-text-1)" }}>{courseName(s.course_id)}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: "#0E8F68" }}>
                        {formatMinutesShort(s.duration_seconds)}
                      </td>
                      <td className="px-4 py-3 max-w-[220px] truncate" style={{ color: "var(--bt-text-3)" }}>
                        {s.note || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {loading && (
          <p className="text-center mt-4 text-sm" style={{ color: "#A8A09A" }}>Chargement…</p>
        )}
        {hasMore && !loading && (
          <div className="text-center mt-4">
            <button onClick={loadMore} className="btn-ghost text-sm px-6">{t("hist.loadMore")}</button>
          </div>
        )}
      </div>
    </Layout>
  );
}
