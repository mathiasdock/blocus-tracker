import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useI18n } from "../../contexts/I18nContext";

// Minimum moderation path for course spaces, inside /admin (Members). Both
// functions refuse non-admins server-side; this list only reads what
// admin_course_reports returns and never the reporters' identities.
export default function CourseReportsAdmin() {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading");
  const [busyId, setBusyId] = useState(null);

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
    setRows((previous) => previous.filter((item) => item.message_id !== row.message_id));
  }

  const date = (value, options) => new Date(value).toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", options);

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
          <div className="flex flex-wrap gap-2 mt-3">
            <button type="button" className="btn-ghost text-sm px-3 py-2" disabled={busyId === row.message_id} onClick={() => resolve(row, false)}>{t("courseSpaces.admin.keep")}</button>
            <button type="button" className="text-sm px-3 py-2 rounded-xl font-semibold" disabled={busyId === row.message_id}
              style={{ color: "var(--bt-danger)", backgroundColor: "var(--bt-danger-bg)", border: "1px solid var(--bt-danger-border)" }}
              onClick={() => resolve(row, true)}>{t("courseSpaces.admin.remove")}</button>
          </div>
        </li>)}
      </ul>}
    </div>
  </details>;
}
