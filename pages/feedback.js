import { useState } from "react";
import Glyph from "../components/Glyph";
import Layout from "../components/Layout";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { supabase } from "../lib/supabaseClient";

// Envoyer une suggestion ou un bug. La lecture et le tri des retours se font
// uniquement dans /admin (section Membres) : l'ancienne boîte de réception
// admin affichée ici en doublon a été retirée avec la refonte de l'admin.
const FEEDBACK_MAX_LENGTH = 1000;
const FEEDBACK_TYPES = ["suggestion", "bug", "other"];

function IconInbox({ size = 18 }) {
  return (
    <Glyph size={size}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2"/>
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
    </Glyph>
  );
}

export default function FeedbackPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [type, setType] = useState("suggestion");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [formMsg, setFormMsg] = useState("");

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
      </div>
    </Layout>
  );
}
