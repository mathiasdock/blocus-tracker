import { useCallback, useEffect, useState } from "react";
import LoadingScreen from "../components/LoadingScreen";
import Layout, { Avatar } from "../components/Layout";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";
import { displayName } from "../lib/format";

const FEEDBACK_MAX_LENGTH = 1000;
const FEEDBACK_TYPES = ["suggestion", "bug", "other"];
const FEEDBACK_STATUSES = ["new", "read", "done"];

function IconInbox({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-6l-2 3h-4l-2-3H2"/>
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
    </svg>
  );
}

function formatDate(value, lang) {
  if (!value) return "";
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-BE" : "en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function FeedbackPage() {
  const { user, profile } = useAuth();
  const { t, lang } = useI18n();
  const isAdmin = profile?.is_admin === true;
  const [type, setType] = useState("suggestion");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [formMsg, setFormMsg] = useState("");
  const [feedbackRows, setFeedbackRows] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [loadingInbox, setLoadingInbox] = useState(false);

  const loadInbox = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingInbox(true);
    const { data, error } = await supabase
      .from("app_feedback")
      .select("id, user_id, type, message, status, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(150);

    if (error) {
      setFeedbackRows([]);
      setLoadingInbox(false);
      return;
    }

    const rows = data || [];
    setFeedbackRows(rows);
    const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, pseudo, first_name, last_name, avatar_url")
        .in("id", userIds);
      setProfiles(Object.fromEntries((profs || []).map((p) => [p.id, p])));
    } else {
      setProfiles({});
    }
    setLoadingInbox(false);
  }, [isAdmin]);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  async function submitFeedback(e) {
    e.preventDefault();
    const clean = message.trim();
    setFormMsg("");

    if (!user) {
      setFormMsg(t("feedback.error"));
      return;
    }
    if (!clean) {
      setFormMsg(t("feedback.emptyError"));
      return;
    }
    if (clean.length > FEEDBACK_MAX_LENGTH) {
      setFormMsg(t("feedback.lengthError"));
      return;
    }

    setSending(true);
    const { error } = await supabase
      .from("app_feedback")
      .insert({ user_id: user.id, type, message: clean });

    setSending(false);
    if (error) {
      setFormMsg(t("feedback.error"));
      return;
    }
    setMessage("");
    setType("suggestion");
    setFormMsg(t("feedback.success"));
    loadInbox();
  }

  async function updateStatus(id, status) {
    const { error } = await supabase
      .from("app_feedback")
      .update({ status })
      .eq("id", id);
    if (!error) {
      setFeedbackRows((rows) => rows.map((row) => row.id === id ? { ...row, status } : row));
    }
  }

  async function deleteFeedback(id) {
    if (!confirm(t("feedback.deleteConfirm"))) return;
    const { error } = await supabase
      .from("app_feedback")
      .delete()
      .eq("id", id);
    if (!error) {
      setFeedbackRows((rows) => rows.filter((row) => row.id !== id));
    }
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        <header>
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-3"
            style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }}>
            <IconInbox size={15} />
            <span className="text-xs font-semibold">{t("feedback.kicker")}</span>
          </div>
          <h1 className="text-2xl mb-2" style={{ color: "var(--bt-text-1)" }}>
            {t("feedback.title")}
          </h1>
          <p className="text-sm leading-relaxed max-w-2xl" style={{ color: "var(--bt-text-2)" }}>
            {t("feedback.description")}
          </p>
        </header>

        <section className="card p-5">
          <form onSubmit={submitFeedback} className="space-y-4">
            <div>
              <label className="label">{t("feedback.typeLabel")}</label>
              <div className="grid grid-cols-3 gap-2">
                {FEEDBACK_TYPES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setType(option)}
                    className="rounded-xl px-3 py-2 text-sm font-semibold transition-colors"
                    style={type === option
                      ? { backgroundColor: "#14B885", color: "#fff" }
                      : { backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)", border: "1px solid var(--bt-border)" }}>
                    {t(`feedback.type.${option}`)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <label className="label">{t("feedback.messageLabel")}</label>
                <span className="text-xs tabular-nums" style={{ color: "var(--bt-text-3)" }}>
                  {message.length}/{FEEDBACK_MAX_LENGTH}
                </span>
              </div>
              <textarea
                className="input min-h-[180px] resize-y"
                maxLength={FEEDBACK_MAX_LENGTH}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("feedback.placeholder")}
              />
            </div>

            {formMsg && (
              <p className="text-sm" style={{ color: formMsg === t("feedback.success") ? "var(--bt-accent-dark)" : "#DC2626" }}>
                {formMsg}
              </p>
            )}

            <button className="btn-primary w-full sm:w-auto" disabled={sending || !message.trim()}>
              {sending ? t("feedback.sending") : t("feedback.send")}
            </button>
          </form>
        </section>

        {isAdmin && (
          <section className="card overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between gap-3"
              style={{ borderBottom: "1px solid var(--bt-border)" }}>
              <div>
                <h2 className="text-lg font-semibold" style={{ color: "var(--bt-text-1)" }}>
                  {t("feedback.adminTitle")}
                </h2>
                <p className="text-sm mt-1" style={{ color: "var(--bt-text-2)" }}>
                  {t("feedback.adminDesc")}
                </p>
              </div>
              <button type="button" onClick={loadInbox} className="btn-ghost text-sm shrink-0">
                {t("common.refresh")}
              </button>
            </div>

            {loadingInbox ? (
              <LoadingScreen compact />
            ) : feedbackRows.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm" style={{ color: "var(--bt-text-3)" }}>
                {t("feedback.noItems")}
              </p>
            ) : (
              <ul>
                {feedbackRows.map((row, idx) => {
                  const author = profiles[row.user_id];
                  return (
                    <li key={row.id} className="px-5 py-4 space-y-3"
                      style={idx > 0 ? { borderTop: "1px solid var(--bt-border)" } : {}}>
                      <div className="flex items-start gap-3">
                        <Avatar url={author?.avatar_url} pseudo={displayName(author)} size={36} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold rounded-full px-2 py-0.5"
                              style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }}>
                              {t(`feedback.type.${row.type}`)}
                            </span>
                            <span className="text-xs font-semibold rounded-full px-2 py-0.5"
                              style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)", border: "1px solid var(--bt-border)" }}>
                              {t(`feedback.status.${row.status}`)}
                            </span>
                            <span className="text-xs" style={{ color: "var(--bt-text-3)" }}>
                              {formatDate(row.created_at, lang)}
                            </span>
                          </div>
                          <p className="text-sm mt-2 whitespace-pre-wrap break-words" style={{ color: "var(--bt-text-1)" }}>
                            {row.message}
                          </p>
                          <p className="text-xs mt-2" style={{ color: "var(--bt-text-3)" }}>
                            {t("feedback.sentBy")} {displayName(author) || t("feedback.unknownUser")}
                            {author?.pseudo ? ` @${author.pseudo}` : ""}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 pl-12">
                        {FEEDBACK_STATUSES.map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => updateStatus(row.id, status)}
                            className="btn-ghost text-xs px-3 py-1.5"
                            disabled={row.status === status}>
                            {t(`feedback.mark.${status}`)}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => deleteFeedback(row.id)}
                          className="text-xs px-3 py-1.5 rounded-xl font-semibold transition-colors"
                          style={{ color: "#DC2626", backgroundColor: "var(--bt-subtle)" }}>
                          {t("feedback.delete")}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </Layout>
  );
}
