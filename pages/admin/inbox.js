// Admin · Boîte de réception — signalements et suggestions, une seule file.
//
// Signalements (espaces de cours) : ce que la phase 1 (v59) autorise, et
// rien de plus. La file lit admin_course_reports ; le contexte d'un message
// signalé (2 avant, 2 après) vient d'admin_course_report_context et sa pièce
// jointe de /api/storage/sign — chaque consultation est notée dans le journal
// d'audit par la base ou la route. Les signaleurs ne sont jamais nommés.
//
// Suggestions : app_feedback, lisible et modifiable par un admin (RLS) ; un
// changement de statut est tracé par la base. Les auteurs sont lus dans
// profiles avec des colonnes explicites — jamais l'email.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import AdminShell, { refreshAdminQueue } from "../../components/admin/AdminShell";
import {
  ConfirmDialog, EmptyLine, ErrorLine, Freshness, Panel, SkeletonRows, StateMark, adminStyles as s, errorText, plural,
} from "../../components/admin/AdminUi";
import { useI18n } from "../../contexts/I18nContext";
import { adminRpc } from "../../lib/adminApi";
import { formatCount, formatDate } from "../../lib/adminFormat.mjs";
import { isOfflineDev, supabase } from "../../lib/supabaseClient";

const VIEWS = ["open", "reports", "feedback", "done"];
const FEEDBACK_STATUS_TONE = { new: "neutral", read: "quiet", done: "ok" };

async function loadInbox() {
  const [reports, feedback] = await Promise.all([
    adminRpc("admin_course_reports"),
    supabase.from("app_feedback")
      .select("id, user_id, type, message, status, created_at")
      .order("created_at", { ascending: false })
      .limit(300)
      .then((result) => result),
  ]);
  if (reports.error) return { data: null, error: reports.error };
  if (feedback.error) return { data: null, error: "failed" };
  const rows = feedback.data || [];
  const ids = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];
  let authors = {};
  if (ids.length) {
    const { data } = await supabase.from("profiles").select("id, pseudo").in("id", ids);
    authors = Object.fromEntries((data || []).map((row) => [row.id, row.pseudo]));
  }
  return {
    data: {
      reports: reports.data || [],
      feedback: rows.map((row) => ({ ...row, author_pseudo: authors[row.user_id] || null })),
      at: new Date().toISOString(),
    },
    error: null,
  };
}

async function openReportedAttachment(messageId) {
  if (isOfflineDev) return false;
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) return false;
  // L'onglet s'ouvre pendant le clic (sinon le bloqueur de fenêtres le
  // refuse) et reçoit l'adresse signée, de courte durée, une fois le serveur
  // d'accord. Le lien vers l'opener est coupé à la main.
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

function ReportContext({ messageId }) {
  const { t, lang } = useI18n();
  const [state, setState] = useState({ status: "loading", rows: [] });

  useEffect(() => {
    let alive = true;
    adminRpc("admin_course_report_context", { p_message_id: messageId }).then(({ data, error }) => {
      if (!alive) return;
      setState(error ? { status: "error", rows: [] } : { status: "ready", rows: data || [] });
    });
    return () => { alive = false; };
  }, [messageId]);

  if (state.status === "loading") return <p className={s.note} role="status" style={{ marginTop: 10 }}>{t("common.loading")}</p>;
  if (state.status === "error") return <p className="text-sm mt-3" role="alert" style={{ color: "var(--bt-danger)" }}>{t("courseSpaces.admin.contextError")}</p>;

  return (
    <div className={s.context}>
      <p className={s.note}>{t("courseSpaces.admin.contextHint")}</p>
      <ol>
        {state.rows.map((row) => {
          const reported = row.message_position === "reported";
          return (
            <li key={row.message_id} className={`${s.contextItem} ${reported ? s.contextReported : ""}`}>
              <p className={s.rowMeta}>
                <strong style={{ color: "var(--bt-text-1)" }}>@{row.author_pseudo || "?"}</strong>
                {" · "}{formatDate(row.created_at, lang, "dateTime")}
                {reported && <>{" · "}<strong style={{ color: "var(--bt-danger)" }}>{t("courseSpaces.admin.contextReported")}</strong></>}
                {!reported && row.hidden && <>{" · "}{t("courseSpaces.admin.hidden")}</>}
              </p>
              {row.content && <p className={s.quote} style={{ marginTop: 2 }}>{row.content}</p>}
              {row.attachment_name && <p className={s.rowMeta}>{t("courseSpaces.admin.attachment").replace("{name}", row.attachment_name)}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ReportItem({ row, busy, onResolve, onAttachment }) {
  const { t, lang } = useI18n();
  const [contextOpen, setContextOpen] = useState(false);
  const reasons = (row.reasons || []).map((reason) => t(`courseSpaces.report.${reason}`)).join(", ");
  return (
    <li className={s.item}>
      <div className={s.itemHead}>
        <span className={s.kind}>{t("adm.inbox.kind.report")}</span>
        <span>{row.room_title}</span>
        <span>
          {row.author_id
            ? <Link href={`/admin/members?id=${row.author_id}`} className="underline underline-offset-2">@{row.author_pseudo || "?"}</Link>
            : `@${row.author_pseudo || "?"}`}
        </span>
        <span>{formatDate(row.last_reported_at || row.created_at, lang, "dateTime")}</span>
      </div>
      {row.content && <p className={s.quote}>{row.content}</p>}
      {row.attachment_name && <p className={s.rowMeta}>{t("courseSpaces.admin.attachment").replace("{name}", row.attachment_name)}</p>}
      {row.exam_date && <p className={s.rowMeta}>{t("courseSpaces.admin.exam").replace("{date}", formatDate(row.exam_date, lang, "day"))}</p>}
      <p className={s.rowMeta} style={{ marginTop: 6 }}>
        {row.reports === 1 ? t("courseSpaces.admin.reportOne") : t("courseSpaces.admin.reportMany").replace("{n}", row.reports)}
        {reasons ? ` · ${reasons}` : ""}
        {row.hidden && <>{" · "}<StateMark tone="warn">{t("courseSpaces.admin.hidden")}</StateMark></>}
      </p>
      {contextOpen && <ReportContext messageId={row.message_id} />}
      <div className={s.actions} style={{ marginTop: 10 }}>
        <button type="button" className="btn-ghost min-h-[44px]" aria-expanded={contextOpen} onClick={() => setContextOpen((open) => !open)}>
          {contextOpen ? t("courseSpaces.admin.contextHide") : t("courseSpaces.admin.contextShow")}
        </button>
        {row.attachment_name && (
          <button type="button" className="btn-ghost min-h-[44px]" disabled={busy} onClick={() => onAttachment(row)}>
            {t("courseSpaces.admin.attachmentOpen")}
          </button>
        )}
        <button type="button" className="btn-ghost min-h-[44px]" disabled={busy} onClick={() => onResolve(row, false)}>{t("courseSpaces.admin.keep")}</button>
        <button type="button" className={`btn min-h-[44px] ${s.danger}`} disabled={busy} onClick={() => onResolve(row, true)}>{t("courseSpaces.admin.remove")}</button>
      </div>
    </li>
  );
}

function FeedbackItem({ row, busy, onStatus }) {
  const { t, lang } = useI18n();
  const next = row.status === "new" ? ["read", "done"] : row.status === "read" ? ["done", "new"] : ["new"];
  return (
    <li className={s.item}>
      <div className={s.itemHead}>
        <span className={s.kind}>{t(`feedback.type.${row.type}`) === `feedback.type.${row.type}` ? row.type : t(`feedback.type.${row.type}`)}</span>
        <span>
          {row.user_id
            ? <Link href={`/admin/members?id=${row.user_id}`} className="underline underline-offset-2">@{row.author_pseudo || "?"}</Link>
            : t("adm.inbox.deletedAuthor")}
        </span>
        <span>{formatDate(row.created_at, lang, "dateTime")}</span>
        <StateMark tone={FEEDBACK_STATUS_TONE[row.status] || "neutral"}>{t(`adm.inbox.status.${row.status}`)}</StateMark>
      </div>
      <p className={s.quote}>{row.message}</p>
      <div className={s.actions} style={{ marginTop: 10 }}>
        {next.map((status) => (
          <button key={status} type="button" className="btn-ghost min-h-[44px]" disabled={busy} onClick={() => onStatus(row, status)}>
            {t(`adm.inbox.markAs.${status}`)}
          </button>
        ))}
      </div>
    </li>
  );
}

export default function AdminInbox() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const view = VIEWS.includes(router.query.view) ? router.query.view : "open";
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const reload = useCallback(async () => {
    setState((previous) => ({ ...previous, loading: true, error: null }));
    const result = await loadInbox();
    setState({ data: result.data, error: result.error, loading: false });
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const data = state.data;
  const openFeedback = useMemo(() => (data?.feedback || []).filter((row) => row.status !== "done"), [data]);
  const doneFeedback = useMemo(() => (data?.feedback || []).filter((row) => row.status === "done"), [data]);
  const reports = useMemo(() => data?.reports || [], [data]);
  const counts = { open: reports.length + openFeedback.length, reports: reports.length, feedback: openFeedback.length, done: doneFeedback.length };

  // Une file : les signalements (modération) d'abord, puis les suggestions
  // nouvelles, puis celles déjà lues — chaque groupe du plus récent au plus ancien.
  const items = useMemo(() => {
    const rank = { new: 0, read: 1, done: 2 };
    const fb = (list) => [...list].sort((a, b) => (rank[a.status] - rank[b.status]) || (b.created_at > a.created_at ? 1 : -1));
    const rep = [...reports].sort((a, b) => ((b.last_reported_at || b.created_at) > (a.last_reported_at || a.created_at) ? 1 : -1));
    if (view === "reports") return rep.map((row) => ({ kind: "report", row }));
    if (view === "feedback") return fb(openFeedback).map((row) => ({ kind: "feedback", row }));
    if (view === "done") return fb(doneFeedback).map((row) => ({ kind: "feedback", row }));
    return [...rep.map((row) => ({ kind: "report", row })), ...fb(openFeedback).map((row) => ({ kind: "feedback", row }))];
  }, [view, reports, openFeedback, doneFeedback]);

  function setView(next) {
    router.replace(next === "open" ? "/admin/inbox" : `/admin/inbox?view=${next}`, undefined, { shallow: true, scroll: false });
  }

  async function resolve(row, remove) {
    setBusyId(row.message_id);
    const { error } = await adminRpc("admin_resolve_course_report", { p_message_id: row.message_id, p_remove: remove });
    setBusyId(null);
    if (error) { setNotice({ tone: "danger", text: errorText(t, error) }); return false; }
    setState((previous) => ({ ...previous, data: { ...previous.data, reports: previous.data.reports.filter((item) => item.message_id !== row.message_id) } }));
    setNotice({ tone: "ok", text: remove ? t("adm.inbox.removed") : t("adm.inbox.kept") });
    refreshAdminQueue();
    return true;
  }

  async function openAttachment(row) {
    setBusyId(row.message_id);
    const ok = await openReportedAttachment(row.message_id);
    setBusyId(null);
    if (!ok) setNotice({ tone: "danger", text: t("courseSpaces.admin.attachmentError") });
  }

  async function setStatus(row, status) {
    setBusyId(row.id);
    const { error } = await supabase.from("app_feedback").update({ status }).eq("id", row.id).then((result) => result);
    setBusyId(null);
    if (error) { setNotice({ tone: "danger", text: errorText(t, "failed") }); return; }
    setState((previous) => ({
      ...previous,
      data: { ...previous.data, feedback: previous.data.feedback.map((item) => (item.id === row.id ? { ...item, status } : item)) },
    }));
    refreshAdminQueue();
  }

  return (
    <AdminShell section="inbox" title={t("adm.nav.inbox")} lead={t("adm.inbox.lead")}
      aside={<Freshness at={data?.at} busy={state.loading} onRefresh={reload} />}>

      <div className={`${s.chips} mt-5`} role="group" aria-label={t("adm.inbox.viewLabel")}>
        {VIEWS.map((key) => (
          <button key={key} type="button" className={s.chip} aria-pressed={view === key} onClick={() => setView(key)}>
            {t(`adm.inbox.view.${key}`)}
            {data && <span className={s.chipCount}>{formatCount(counts[key], lang)}</span>}
          </button>
        ))}
      </div>

      {notice && (
        <p className="mt-3 text-sm" role={notice.tone === "danger" ? "alert" : "status"}
          style={{ color: notice.tone === "danger" ? "var(--bt-danger)" : "var(--bt-accent-text)" }}>
          {notice.text}
        </p>
      )}

      <Panel className="mt-4">
        {state.error && !data ? <ErrorLine code={state.error} onRetry={reload} />
          : state.loading && !data ? <SkeletonRows rows={4} />
          : items.length === 0 ? (
            <div className={s.row}><StateMark tone="ok">{t(`adm.inbox.empty.${view}`)}</StateMark></div>
          ) : (
            <ul className={s.rows}>
              {items.map(({ kind, row }) => (kind === "report"
                ? <ReportItem key={`r-${row.message_id}`} row={row} busy={busyId === row.message_id}
                    onAttachment={openAttachment}
                    onResolve={(target, remove) => (remove ? setConfirm(target) : resolve(target, false))} />
                : <FeedbackItem key={`f-${row.id}`} row={row} busy={busyId === row.id} onStatus={setStatus} />))}
            </ul>
          )}
      </Panel>
      {view === "open" && reports.length > 0 && <p className={s.note} style={{ marginTop: 10 }}>{t("courseSpaces.admin.hint")}</p>}
      {data && data.feedback.length >= 300 && <p className={s.note} style={{ marginTop: 6 }}>{plural(t, "adm.inbox.limit", 300)}</p>}

      {confirm && (
        <ConfirmDialog title={t("courseSpaces.admin.removeConfirm")} danger busy={busyId === confirm.message_id}
          confirmLabel={t("courseSpaces.admin.remove")}
          onClose={() => setConfirm(null)}
          onConfirm={async () => { const ok = await resolve(confirm, true); if (ok) setConfirm(null); }}>
          {t("adm.inbox.removeBody").replace("{room}", confirm.room_title || "")}
        </ConfirmDialog>
      )}
    </AdminShell>
  );
}
