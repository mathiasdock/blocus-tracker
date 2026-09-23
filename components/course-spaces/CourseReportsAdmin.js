import { useCallback, useEffect, useState } from "react";
import { isOfflineDev, supabase } from "../../lib/supabaseClient";
import { useI18n } from "../../contexts/I18nContext";

// Minimum moderation path for course spaces, inside /admin (Members). Every
// function refuses non-admins server-side; this list only reads what
// admin_course_reports returns and never the reporters' identities.
//
// Admins no longer read course rooms (v59). What they may see is scoped to a
// report that is still open: the reported message, up to two messages before
// and two after it (admin_course_report_context), and the reported message's
// own attachment (/api/storage/sign with reportMessageId). Each look is
// written to the audit log by the database or the server route.
function ReportContext({ messageId, t, date }) {
  const [state, setState] = useState({ status: "loading", rows: [] });

  useEffect(() => {
    let alive = true;
    supabase.rpc("admin_course_report_context", { p_message_id: messageId }).then(({ data, error }) => {
      if (!alive) return;
      setState(error ? { status: "error", rows: [] } : { status: "ready", rows: data || [] });
    });
    return () => { alive = false; };
  }, [messageId]);

  if (state.status === "loading") return <p className="text-xs mt-3" role="status" style={{ color: "var(--bt-text-2)" }}>{t("common.loading")}</p>;
  if (state.status === "error") return <p className="text-xs mt-3" role="alert" style={{ color: "var(--bt-danger)" }}>{t("courseSpaces.admin.contextError")}</p>;

  return (
    <div className="mt-3">
      <p className="text-xs" style={{ color: "var(--bt-text-2)" }}>{t("courseSpaces.admin.contextHint")}</p>
      <ol className="mt-2 space-y-1.5">
        {state.rows.map((row) => {
          const reported = row.message_position === "reported";
          return (
            <li key={row.message_id} className="rounded-lg px-3 py-2"
              style={{ backgroundColor: "var(--bt-surface)", border: `1px solid ${reported ? "var(--bt-danger-border)" : "var(--bt-hairline)"}` }}>
              <p className="text-[11px]" style={{ color: "var(--bt-text-2)" }}>
                <strong style={{ color: "var(--bt-text-1)" }}>@{row.author_pseudo || "?"}</strong>
                {" · "}{date(row.created_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                {reported && <>{" · "}<strong style={{ color: "var(--bt-danger)" }}>{t("courseSpaces.admin.contextReported")}</strong></>}
                {!reported && row.hidden && <>{" · "}{t("courseSpaces.admin.hidden")}</>}
              </p>
              {row.content && <p className="text-sm mt-0.5 whitespace-pre-wrap" style={{ color: "var(--bt-text-1)", overflowWrap: "anywhere" }}>{row.content}</p>}
              {row.attachment_name && <p className="text-xs mt-0.5" style={{ color: "var(--bt-text-2)" }}>{t("courseSpaces.admin.attachment").replace("{name}", row.attachment_name)}</p>}
              {row.exam_date && <p className="text-xs mt-0.5" style={{ color: "var(--bt-text-2)" }}>{t("courseSpaces.admin.exam").replace("{date}", date(`${row.exam_date}T12:00:00`, { day: "numeric", month: "long", year: "numeric" }))}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

async function openReportedAttachment(messageId) {
  if (isOfflineDev) return false;
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) return false;
  // The tab opens synchronously with the click so no pop-up blocker stops it;
  // it receives the short-lived signed address once the server agrees. The
  // opener link is cut by hand ("noopener" would return no tab to steer).
  const tab = window.open("about:blank", "_blank");
  if (tab) tab.opener = null;
  try {
    const res = await fetch("/api/storage/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reportMessageId: messageId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.signedUrl) { tab?.close(); return false; }
    if (tab) tab.location.href = json.signedUrl;
    else window.location.assign(json.signedUrl);
    return true;
  } catch (_) {
    tab?.close();
    return false;
  }
}

export default function CourseReportsAdmin() {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading");
  const [busyId, setBusyId] = useState(null);
  const [contextId, setContextId] = useState(null);

  const load = useCallback(async () => {
    setState("loading");
    const { data, error } = await supabase.rpc("admin_course_reports");
    if (error) { setState("error"); return; }
    setRows(data || []);
    setState("ready");
  }, []);

  useEffect(() => { load(); }, [load]);

  async function resolve(row, remove) {
    if (busyId) return;
    if (remove && !window.confirm(t("courseSpaces.admin.removeConfirm"))) return;
    setBusyId(row.message_id);
    const { error } = await supabase.rpc("admin_resolve_course_report", { p_message_id: row.message_id, p_remove: remove });
    setBusyId(null);
    if (error) { window.alert(t("courseSpaces.error.generic")); return; }
    if (contextId === row.message_id) setContextId(null);
    setRows((previous) => previous.filter((item) => item.message_id !== row.message_id));
  }

  async function openAttachment(row) {
    if (busyId) return;
    setBusyId(row.message_id);
    const ok = await openReportedAttachment(row.message_id);
    setBusyId(null);
    if (!ok) window.alert(t("courseSpaces.admin.attachmentError"));
  }

  const date = (value, options) => new Date(value).toLocaleString(lang === "en" ? "en-GB" : "fr-FR", options);

  return <details className="card bt-acc overflow-hidden" open={rows.length > 0 || undefined}>
    <summary className="px-5 py-3.5 cursor-pointer text-sm font-semibold select-none" style={{ color: "var(--bt-text-1)" }}>
      {`${t("courseSpaces.admin.title")} (${rows.length})`}
    </summary>
    <div className="px-5 py-4" style={{ borderTop: "1px solid var(--bt-hairline)" }}>
      <p className="text-xs mb-4" style={{ color: "var(--bt-text-2)" }}>{t("courseSpaces.admin.hint")}</p>
      {state === "loading" && <p className="text-sm" role="status" style={{ color: "var(--bt-text-2)" }}>{t("common.loading")}</p>}
      {state === "error" && <p className="text-sm" role="alert" style={{ color: "var(--bt-danger)" }}>{t("courseSpaces.error.generic")}</p>}
      {state === "ready" && !rows.length && <p className="text-sm" style={{ color: "var(--bt-text-2)" }}>{t("courseSpaces.admin.empty")}</p>}
      {rows.length > 0 && <ul className="space-y-2">
        {rows.map((row) => <li key={row.message_id} className="rounded-xl p-3" style={{ backgroundColor: "var(--bt-subtle)" }}>
          <p className="text-xs" style={{ color: "var(--bt-text-2)" }}>
            <strong style={{ color: "var(--bt-text-1)" }}>{row.room_title}</strong>
            {" · "}{t("courseSpaces.admin.byAuthor").replace("{pseudo}", row.author_pseudo || "?")}
            {" · "}{date(row.created_at, { day: "numeric", month: "short", year: "numeric" })}
          </p>
          {row.content && <p className="text-sm mt-1 whitespace-pre-wrap" style={{ color: "var(--bt-text-1)", overflowWrap: "anywhere" }}>{row.content}</p>}
          {row.attachment_name && <p className="text-xs mt-1" style={{ color: "var(--bt-text-2)" }}>{t("courseSpaces.admin.attachment").replace("{name}", row.attachment_name)}</p>}
          {row.exam_date && <p className="text-xs mt-1" style={{ color: "var(--bt-text-2)" }}>{t("courseSpaces.admin.exam").replace("{date}", date(`${row.exam_date}T12:00:00`, { day: "numeric", month: "long", year: "numeric" }))}</p>}
          <p className="text-xs mt-2" style={{ color: "var(--bt-text-2)" }}>
            {row.reports === 1 ? t("courseSpaces.admin.reportOne") : t("courseSpaces.admin.reportMany").replace("{n}", row.reports)}
            {" · "}{(row.reasons || []).map((reason) => t(`courseSpaces.report.${reason}`)).join(", ")}
            {row.hidden && <>{" · "}<strong style={{ color: "var(--bt-text-1)" }}>{t("courseSpaces.admin.hidden")}</strong></>}
          </p>
          {contextId === row.message_id && <ReportContext messageId={row.message_id} t={t} date={date} />}
          <div className="flex flex-wrap gap-2 mt-3">
            <button type="button" className="btn-ghost text-sm px-3 py-2 min-h-[44px]" aria-expanded={contextId === row.message_id}
              onClick={() => setContextId((current) => (current === row.message_id ? null : row.message_id))}>
              {contextId === row.message_id ? t("courseSpaces.admin.contextHide") : t("courseSpaces.admin.contextShow")}
            </button>
            {row.attachment_name && (
              <button type="button" className="btn-ghost text-sm px-3 py-2 min-h-[44px]" disabled={busyId === row.message_id}
                onClick={() => openAttachment(row)}>{t("courseSpaces.admin.attachmentOpen")}</button>
            )}
            <button type="button" className="btn-ghost text-sm px-3 py-2 min-h-[44px]" disabled={busyId === row.message_id} onClick={() => resolve(row, false)}>{t("courseSpaces.admin.keep")}</button>
            <button type="button" className="text-sm px-3 py-2 min-h-[44px] rounded-xl font-semibold" disabled={busyId === row.message_id}
              style={{ color: "var(--bt-danger)", backgroundColor: "var(--bt-danger-bg)", border: "1px solid var(--bt-danger-border)" }}
              onClick={() => resolve(row, true)}>{t("courseSpaces.admin.remove")}</button>
          </div>
        </li>)}
      </ul>}
    </div>
  </details>;
}
