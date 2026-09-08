import { useEffect, useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import { formatMinutesShort } from "../lib/format";

const HINT_KEY = "bt_session_actions_hint_seen_v1";

function IconMore() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" />
    </svg>
  );
}

function formatSessionRange(session, locale) {
  const started = new Date(session.started_at);
  if (Number.isNaN(started.getTime())) return null;
  const ended = session.ended_at ? new Date(session.ended_at) : new Date(started.getTime() + Number(session.duration_seconds || 0) * 1000);
  if (Number.isNaN(ended.getTime())) return null;
  const format = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  return `${format.format(started)}–${format.format(ended)}`;
}

export default function TodaySessionsCard({ sessions, courses, onUpdate, onDelete, className = "" }) {
  const { t, lang } = useI18n();
  const [menuId, setMenuId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editMinutes, setEditMinutes] = useState("");
  const [editCourseId, setEditCourseId] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (!sessions.length) return;
    try { setShowHint(localStorage.getItem(HINT_KEY) !== "1"); } catch {}
  }, [sessions.length]);

  useEffect(() => {
    if (!menuId) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setMenuId(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuId]);

  function acknowledgeHint() {
    setShowHint(false);
    try { localStorage.setItem(HINT_KEY, "1"); } catch {}
  }

  function beginEdit(session) {
    const maxMinutes = Math.max(1, Math.floor(Number(session.duration_seconds || 0) / 60));
    setEditingId(session.id);
    setEditMinutes(String(maxMinutes));
    setEditCourseId(session.course_id || "");
    setConfirmDeleteId(null);
    setMenuId(null);
  }

  async function saveEdit(session) {
    const minutes = Number.parseInt(editMinutes, 10);
    const maxMinutes = Math.max(1, Math.floor(Number(session.duration_seconds || 0) / 60));
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > maxMinutes) return;
    setBusyId(session.id);
    try {
      const ok = await onUpdate(session, { minutes, courseId: editCourseId || null });
      if (ok !== false) setEditingId(null);
    } finally {
      setBusyId(null);
    }
  }

  const locale = lang === "en" ? "en-US" : "fr-BE";

  return (
    <section className={`card min-w-0 p-5 sm:p-6 ${className}`}>
      {menuId && <button type="button" className="fixed inset-0 z-20 cursor-default" onClick={() => setMenuId(null)} aria-label={t("common.close")} />}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold" style={{ color: "var(--bt-text-1)" }}>{t("dash.todaySessions")}</h2>
        <span className="font-num inline-flex min-h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-bold tabular-nums" style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)" }}>
          {sessions.length}
        </span>
      </div>

      {showHint && sessions.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs leading-relaxed" style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-text)" }}>
          <svg className="mt-0.5 shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" />
          </svg>
          <p>{t("dash.sessionActionsHint")}</p>
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="py-7 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-3)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9.5 3h5M12 3v2" />
            </svg>
          </div>
          <p className="mt-3 text-sm" style={{ color: "var(--bt-text-2)" }}>{t("dash.noSession")}</p>
        </div>
      ) : (
        <ul className="mt-3 divide-y" style={{ borderColor: "var(--bt-border)" }}>
          {sessions.map((session) => {
            const course = courses.find((item) => item.id === session.course_id);
            const maxMinutes = Math.max(1, Math.floor(Number(session.duration_seconds || 0) / 60));
            const range = formatSessionRange(session, locale);
            const isEditing = editingId === session.id;
            const isConfirmingDelete = confirmDeleteId === session.id;

            return (
              <li key={session.id} className="relative py-3.5">
                <div className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: course?.color || "var(--bt-text-4)" }} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>{course?.name || t("dash.noCourse")}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs tabular-nums" style={{ color: "var(--bt-text-3)" }}>
                      {range && <span>{range}</span>}
                      {session.note && <span className="max-w-full truncate">{session.note}</span>}
                    </p>
                  </div>
                  <span className="font-num shrink-0 text-sm font-bold tabular-nums" style={{ color: "var(--bt-text-2)" }}>
                    {formatMinutesShort(session.duration_seconds)}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setMenuId((value) => value === session.id ? null : session.id); acknowledgeHint(); }}
                    className="bt-dashboard-control relative z-30 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                    style={{ color: "var(--bt-text-2)" }}
                    aria-label={t("dash.sessionActions")}
                    aria-haspopup="menu"
                    aria-expanded={menuId === session.id}
                  >
                    <IconMore />
                  </button>
                </div>

                {menuId === session.id && (
                  <div className="bt-dashboard-menu absolute right-0 top-14 z-30 w-48 overflow-hidden rounded-2xl py-1" role="menu" style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)", boxShadow: "0 14px 38px var(--bt-shadow)" }}>
                    <button type="button" role="menuitem" onClick={() => beginEdit(session)} className="bt-dashboard-menu-item flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>
                      <IconEdit /> {t("courseEditor.edit")}
                    </button>
                    <button type="button" role="menuitem" onClick={() => { setConfirmDeleteId(session.id); setEditingId(null); setMenuId(null); }} className="bt-dashboard-menu-item flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm font-semibold" style={{ color: "var(--bt-danger)" }}>
                      <IconTrash /> {t("common.delete")}
                    </button>
                  </div>
                )}

                {isEditing && (
                  <div className="mt-3 grid gap-3 rounded-2xl p-3 sm:grid-cols-[minmax(0,1fr)_112px]" style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}>
                    <label className="text-xs font-semibold" style={{ color: "var(--bt-text-2)" }}>
                      {t("dash.sessionCourse")}
                      <select className="input mt-1 min-h-11" value={editCourseId} onChange={(event) => setEditCourseId(event.target.value)}>
                        <option value="">{t("dash.noCourse")}</option>
                        {courses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-semibold" style={{ color: "var(--bt-text-2)" }}>
                      {t("dash.sessionDuration")}
                      <input className="input mt-1 min-h-11 text-center tabular-nums" type="number" inputMode="numeric" min={1} max={maxMinutes} value={editMinutes} onChange={(event) => setEditMinutes(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveEdit(session); if (event.key === "Escape") setEditingId(null); }} />
                    </label>
                    <div className="flex gap-2 sm:col-span-2">
                      <button type="button" className="btn-primary min-h-11 flex-1" disabled={busyId === session.id} onClick={() => saveEdit(session)}>{busyId === session.id ? t("common.saving") : t("common.save")}</button>
                      <button type="button" className="btn-ghost min-h-11 flex-1" disabled={busyId === session.id} onClick={() => setEditingId(null)}>{t("common.cancel")}</button>
                    </div>
                  </div>
                )}

                {isConfirmingDelete && (
                  <div className="mt-3 rounded-2xl p-3" role="alert" style={{ backgroundColor: "var(--bt-danger-bg)", border: "1px solid var(--bt-danger-border)" }}>
                    <p className="text-sm font-semibold" style={{ color: "var(--bt-danger)" }}>{t("dash.deleteSessionConfirm")}</p>
                    <div className="mt-3 flex gap-2">
                      <button type="button" className="btn-ghost min-h-11 flex-1" disabled={busyId === session.id} onClick={() => setConfirmDeleteId(null)}>{t("common.cancel")}</button>
                      <button type="button" className="btn min-h-11 flex-1" disabled={busyId === session.id} style={{ backgroundColor: "var(--bt-danger)", color: "#fff" }} onClick={async () => {
                        setBusyId(session.id);
                        try {
                          await onDelete(session.id);
                          setConfirmDeleteId(null);
                        } finally {
                          setBusyId(null);
                        }
                      }}>{busyId === session.id ? t("courseEditor.deleting") : t("common.delete")}</button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
