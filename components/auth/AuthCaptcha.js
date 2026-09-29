import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { useI18n } from "../../contexts/I18nContext";
import { AUTH_CAPTCHA_ENABLED } from "../../lib/authCaptcha.mjs";

// A solved token lasts five minutes and can be submitted only once. Each
// email/password Auth attempt resets the widget, including rejected attempts.
export function useAuthCaptcha() {
  const widget = useRef(null);
  const [token, setToken] = useState("");
  const [state, setState] = useState("pending");

  const reset = useCallback(() => {
    if (!AUTH_CAPTCHA_ENABLED) return;
    setToken("");
    setState("pending");
    widget.current?.reset();
  }, []);

  const requireToken = useCallback(() => {
    if (!AUTH_CAPTCHA_ENABLED) return true;
    if (token) {
      if (!widget.current?.isExpired()) return true;
      reset();
      setState("expired");
      return false;
    }
    setState(current => (current === "error" || current === "expired") ? current : "missing");
    return false;
  }, [token, reset]);

  return { enabled: AUTH_CAPTCHA_ENABLED, token, state, widget, setToken, setState, reset, requireToken };
}

export default function AuthCaptcha({ controller }) {
  const { t, lang } = useI18n();
  const { enabled, setToken, setState } = controller;
  const [dark, setDark] = useState(false);
  const [compact, setCompact] = useState(false);
  // Stable across unrelated form renders. The library also memoizes primitive
  // options internally, but keeping this object stable makes the contract clear.
  const options = useMemo(() => ({
    theme: dark ? "dark" : "light",
    language: lang,
    size: compact ? "compact" : "flexible",
    // A Cloudflare challenge failure must not silently start another challenge
    // forever. The visible Retry action below is the only recovery path.
    retry: "never",
    refreshExpired: "manual",
    refreshTimeout: "manual",
    responseField: false,
  }), [dark, compact, lang]);

  useEffect(() => {
    if (!enabled) return undefined;
    const root = document.documentElement;
    const readTheme = () => setDark(root.classList.contains("dark"));
    const observer = new MutationObserver(readTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    readTheme();

    const media = window.matchMedia("(max-width: 359px)");
    const readWidth = () => setCompact(media.matches);
    if (media.addEventListener) media.addEventListener("change", readWidth);
    else media.addListener?.(readWidth);
    readWidth();
    return () => {
      observer.disconnect();
      if (media.removeEventListener) media.removeEventListener("change", readWidth);
      else media.removeListener?.(readWidth);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    // The Turnstile wrapper's scriptOptions.onError currently removes its
    // onload callback before the script runs. Observe the resource error
    // instead, leaving the library's callback intact.
    const onScriptError = event => {
      if (event.target?.id !== "cf-turnstile-script") return;
      setToken("");
      setState("script-error");
    };
    document.addEventListener("error", onScriptError, true);
    return () => document.removeEventListener("error", onScriptError, true);
  }, [enabled, setToken, setState]);

  useEffect(() => {
    if (!enabled || controller.state !== "pending") return undefined;
    const timeout = window.setTimeout(() => {
      if (typeof window.turnstile === "undefined") setState("script-error");
    }, 15_000);
    return () => window.clearTimeout(timeout);
  }, [enabled, controller.state, setState]);

  // Cloudflare re-renders the widget when these options change. A token from
  // the previous widget must never be accepted after a theme/language resize.
  useEffect(() => {
    if (enabled) {
      setToken("");
      setState("pending");
    }
  }, [enabled, setToken, setState, options]);

  if (!enabled) return null;

  const statusText = controller.state === "error" || controller.state === "script-error"
    ? t("auth.captchaError")
    : controller.state === "expired"
      ? t("auth.captchaExpired")
      : controller.state === "missing"
        ? t("auth.captchaRequired")
        : "";

  return (
    <div className="bt-auth-captcha">
      <Turnstile
        ref={controller.widget}
        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
        options={options}
        onSuccess={value => {
          controller.setToken(value);
          controller.setState("ready");
        }}
        onExpire={() => {
          controller.setToken("");
          controller.setState("expired");
        }}
        onTimeout={() => {
          controller.setToken("");
          controller.setState("expired");
        }}
        onError={code => {
          // A six-digit Cloudflare code is safe diagnostic metadata. Never log
          // the challenge token or expose technical details in the UI.
          if (/^\d{6}$/.test(String(code))) {
            console.warn("Turnstile client error:", code);
          }
          controller.setToken("");
          controller.setState("error");
          return true; // Tell Turnstile that the error has been handled.
        }}
        onUnsupported={() => {
          controller.setToken("");
          controller.setState("error");
        }}
      />
      {statusText && (
        <div className="bt-auth-captcha-status" role="alert">
          <span>{statusText}</span>
          {(controller.state === "error" || controller.state === "script-error" || controller.state === "expired") && (
            <button
              type="button"
              onClick={controller.state === "script-error" ? () => window.location.reload() : controller.reset}
            >
              {t("auth.captchaRetry")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
