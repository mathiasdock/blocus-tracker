import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import {
  isPushSupported,
  isIOS,
  isStandalone,
  enablePush,
  loginUser,
} from "../lib/onesignal";

export default function PushNotificationsCard() {
  const { user } = useAuth();
  const { t } = useI18n();

  const [env, setEnv] = useState({ ready: false, supported: false, ios: false, standalone: false });
  const [permission, setPermission] = useState("default");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setEnv({
      ready: true,
      supported: isPushSupported(),
      ios: isIOS(),
      standalone: isStandalone(),
    });
    if (typeof Notification !== "undefined") setPermission(Notification.permission);
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const res = await enablePush();
      if (res?.reason === "unconfigured") {
        setError(t("push.unconfigured"));
        return;
      }
      const perm = typeof Notification !== "undefined" ? Notification.permission : "default";
      setPermission(perm);
      if (perm === "granted") {
        if (user) await loginUser(user.id);
        try { localStorage.setItem("bt_push_enabled", "1"); } catch (_) {}
      }
    } catch (_) {
      setError(t("push.error"));
    } finally {
      setBusy(false);
    }
  }, [t, user]);

  if (!env.ready) return null;

  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  const iosNeedsInstall = env.ios && !env.standalone;

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">🔔</span>
        <h3 className="text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>
          {t("push.title")}
        </h3>
      </div>
      <p className="text-sm mb-4" style={{ color: "var(--bt-text-2)" }}>{t("push.desc")}</p>

      {!appId ? (
        <p className="text-xs" style={{ color: "var(--bt-text-3)" }}>{t("push.unconfigured")}</p>
      ) : iosNeedsInstall ? (
        <div className="flex items-start gap-2 rounded-xl px-3 py-2"
          style={{ backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}>
          <span className="text-sm shrink-0">📲</span>
          <p className="text-xs" style={{ color: "var(--bt-text-2)" }}>{t("push.iosHint")}</p>
        </div>
      ) : !env.supported ? (
        <p className="text-xs" style={{ color: "var(--bt-text-3)" }}>{t("push.unsupported")}</p>
      ) : permission === "granted" ? (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ backgroundColor: "var(--bt-accent-bg)" }}>
          <span className="text-sm">✅</span>
          <p className="text-xs font-medium" style={{ color: "var(--bt-accent-dark)" }}>{t("push.enabled")}</p>
        </div>
      ) : permission === "denied" ? (
        <p className="text-xs" style={{ color: "var(--bt-text-3)" }}>{t("push.denied")}</p>
      ) : (
        <button onClick={enable} disabled={busy}
          className="px-4 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-60"
          style={{ backgroundColor: "#14B885", color: "#fff" }}>
          {busy ? "…" : t("push.enable")}
        </button>
      )}

      {error && <p className="text-xs mt-2" style={{ color: "#ef4444" }}>{error}</p>}
    </div>
  );
}
