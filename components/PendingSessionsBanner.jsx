import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { listPending, flushPending } from "../lib/timerDraft";

const STORAGE_KEY = "bt_pending_sessions_v1";

export default function PendingSessionsBanner({ onSynced }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  const refresh = useCallback(() => {
    setCount(user ? listPending(user.id).length : 0);
  }, [user]);

  const retry = useCallback(async () => {
    if (!user || busy) return;
    setBusy(true);
    try {
      const res = await flushPending(supabase, user.id);
      if (res.synced + res.alreadyExists > 0) {
        onSynced?.();
        setFeedback(t("dash.pendingSynced"));
        setTimeout(() => setFeedback(""), 2500);
      } else if (res.failed > 0) {
        setFeedback(t("dash.pendingStillOffline"));
        setTimeout(() => setFeedback(""), 2500);
      }
    } finally {
      setBusy(false);
      refresh();
    }
  }, [user, busy, onSynced, refresh, t]);

  // initial sync + on user change : flush si quelque chose attend
  useEffect(() => {
    refresh();
    if (user && listPending(user.id).length > 0) retry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const id = setInterval(refresh, 4000);
    function onStorage(e) { if (e.key === STORAGE_KEY) refresh(); }
    function onOnline() { retry(); }
    function onFocus() { refresh(); retry(); }
    function onVisibility() { if (!document.hidden) { refresh(); retry(); } }
    window.addEventListener("storage", onStorage);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh, retry, user]);

  if (count === 0) return null;

  const label = count === 1
    ? t("dash.pendingOne")
    : (t("dash.pendingMany") || "").replace("{n}", String(count));

  return (
    <div className="card p-3 mb-3 flex items-center gap-3"
      style={{ borderColor: "var(--bt-border)" }}>
      <span className="text-base shrink-0">⚠️</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>{label}</p>
        <p className="text-xs" style={{ color: "var(--bt-text-2)" }}>
          {feedback || t("dash.pendingHelp")}
        </p>
      </div>
      <button onClick={retry} disabled={busy}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-60 shrink-0"
        style={{ backgroundColor: "#14B885", color: "#fff" }}>
        {busy ? "…" : t("dash.pendingRetry")}
      </button>
    </div>
  );
}
