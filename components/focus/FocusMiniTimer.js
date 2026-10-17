import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../contexts/I18nContext";
import { formatDuration } from "../../lib/format";
import Glyph from "../Glyph";
import FocusEnvironmentRenderer from "./FocusEnvironmentRenderer";
import { getFocusEnvironment } from "../../lib/focusEnvironments.mjs";
import environmentStyles from "./FocusEnvironments.module.css";
import styles from "./FocusMiniTimer.module.css";

// Operate: a quiet, native always-on-top view of the existing chrono, not a
// second timer. The same equipped landscape and Focus theme at compact quality,
// course identity and tabular time; no PiP-local session controls or settings.
const DESKTOP_QUERY = "(min-width: 768px) and (hover: hover) and (pointer: fine)";

// The native PiP document does not inherit styles. Copy the already-loaded
// app rules (including local fonts/tokens); do not run a second app/root.
function prepareDocument(pip, source, title) {
  pip.document.title = title;
  const base = pip.document.createElement("base");
  base.href = source.baseURI;
  pip.document.head.appendChild(base);
  const copied = new Map();
  const syncStyles = () => {
    for (const sheet of Array.from(source.styleSheets)) {
      let node = copied.get(sheet);
      if (sheet.href) {
        if (!node) {
          node = pip.document.createElement("link");
          node.rel = "stylesheet";
          node.href = sheet.href;
          pip.document.head.appendChild(node);
          copied.set(sheet, node);
        }
      } else {
        try {
          const css = Array.from(sheet.cssRules, rule => rule.cssText).join("\n");
          if (!node) {
            node = pip.document.createElement("style");
            pip.document.head.appendChild(node);
            copied.set(sheet, node);
          }
          if (node.textContent !== css) node.textContent = css;
        } catch { /* Inaccessible, inline sheets have no URL fallback. */ }
      }
    }
  };
  syncStyles();
  pip.document.body.className = styles.windowBody;
  const root = pip.document.createElement("div");
  pip.document.body.appendChild(root);
  return { root, syncStyles };
}

export default function FocusMiniTimer({ chrono, courses = [], noCourseLabel, visible = true,
  environment = getFocusEnvironment("forest"), onOpenChange }) {
  const { t, lang } = useI18n();
  const [desktop, setDesktop] = useState(false);
  const [opening, setOpening] = useState(false);
  const [target, setTarget] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const active = useRef(null);
  const pending = useRef(false);
  const mounted = useRef(false);
  const control = useRef(null);
  const trigger = useRef(null);
  const onOpenRef = useRef(onOpenChange);
  onOpenRef.current = onOpenChange;

  useEffect(() => {
    mounted.current = true;
    const media = window.matchMedia?.(DESKTOP_QUERY);
    const update = () => setDesktop(Boolean(media?.matches));
    update();
    media?.addEventListener("change", update);
    return () => {
      mounted.current = false;
      media?.removeEventListener("change", update);
      const current = active.current;
      active.current = null;
      current?.cleanup();
      if (current && !current.window.closed) current.window.close();
      if (current) onOpenRef.current?.(false);
      // Closing this view never calls pause/reset/finish or writes a session.
    };
  }, []);

  useEffect(() => {
    if (target && active.current) {
      active.current.window.document.documentElement.lang = lang;
      active.current.window.document.title = `Blocus Tracker · ${t("miniTimer.title")}`;
    }
  }, [lang, t, target]);

  useEffect(() => {
    if (!feedback) return undefined;
    const onPointer = event => { if (!control.current?.contains(event.target)) setFeedback(null); };
    const onKey = event => {
      if (event.key !== "Escape" || event.defaultPrevented || event.target.closest('dialog, [data-focus-modal], [aria-modal="true"]') !== control.current?.closest('dialog, [data-focus-modal], [aria-modal="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      setFeedback(null);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [feedback]);

  async function open() {
    if (pending.current) return;
    setFeedback(null);
    if (active.current && !active.current.window.closed) {
      active.current.window.focus();
      return;
    }
    // Feature detection, never browser/User-Agent sniffing or window.open.
    const api = window.documentPictureInPicture;
    if (typeof api?.requestWindow !== "function") {
      setFeedback("unsupported");
      return;
    }
    pending.current = true;
    setOpening(true);
    let pip;
    try {
      // Invoke inside the original click, before any await loses activation.
      pip = await api.requestWindow({ width: 320, height: 240 });
      if (!mounted.current || pip.closed) {
        if (!pip.closed) pip.close();
        return;
      }
      const { root, syncStyles } = prepareDocument(pip, document, `Blocus Tracker · ${t("miniTimer.title")}`);
      const syncTheme = () => {
        pip.document.documentElement.classList.toggle("dark", document.documentElement.classList.contains("dark"));
        pip.document.documentElement.lang = document.documentElement.lang || lang;
      };
      syncTheme();
      const observer = new MutationObserver(() => { syncTheme(); syncStyles(); });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "lang"] });
      // A later environment may lazy-load its CSS into the opener's head.
      // Synchronize those sheets once they arrive, without recreating PiP.
      if (document.head) observer.observe(document.head, { childList: true, subtree: true, characterData: true });
      document.addEventListener("load", syncStyles, true);
      const onHide = () => {
        observer.disconnect();
        document.removeEventListener("load", syncStyles, true);
        pip.removeEventListener("pagehide", onHide);
        if (active.current?.window !== pip) return;
        active.current = null;
        if (mounted.current) setTarget(null);
        onOpenRef.current?.(false);
      };
      active.current = { window: pip, cleanup: () => {
        observer.disconnect();
        document.removeEventListener("load", syncStyles, true);
        pip.removeEventListener("pagehide", onHide);
      } };
      pip.addEventListener("pagehide", onHide);
      setTarget(root);
      onOpenRef.current?.(true);
    } catch {
      // Do not expose browser exceptions or log session/course data.
      if (pip && !pip.closed) pip.close();
      if (mounted.current) setFeedback("blocked");
    } finally {
      pending.current = false;
      if (mounted.current) setOpening(false);
    }
  }

  function returnToFocus() {
    // User gesture lets Chromium bring the opener's tab/window to the front.
    // Focus stays mounted in that tab; no redirect, no timer action.
    window.focus();
    const current = active.current;
    if (current && !current.window.closed) current.window.close();
    trigger.current?.focus();
  }

  const course = courses.find(item => item.id === chrono.courseId);
  const paused = chrono.isPaused && !chrono.pomodoro;
  const seconds = chrono.pomodoro ? Math.max(0, chrono.pomoTargetSecs - chrono.elapsed) : chrono.elapsed;
  const statusKey = chrono.isPaused ? "miniTimer.paused"
    : chrono.onBreak ? "miniTimer.break" : chrono.running ? "miniTimer.studying" : "miniTimer.ready";

  return <>
    {desktop && <div ref={control} data-focus-controls="" className={styles.control} data-visible={visible || opening || feedback ? "true" : "false"}>
      <button ref={trigger} type="button" className={styles.trigger} onClick={open}
        disabled={opening} aria-busy={opening} aria-describedby={feedback ? "mini-timer-feedback" : undefined}>
        <Glyph size={17}><rect x="3" y="4" width="18" height="16" rx="2"/><rect x="11" y="11" width="7" height="6" rx="1"/></Glyph>
        {t(opening ? "miniTimer.opening" : "miniTimer.title")}
      </button>
      {feedback && <div id="mini-timer-feedback" role="status" className={styles.feedback}>
        <p>{t(`miniTimer.${feedback}`)}</p>
        <button type="button" aria-label={t("common.close")} onClick={() => { setFeedback(null); trigger.current?.focus(); }}>
          <Glyph size={16}><path d="m6 6 12 12M6 18 18 6"/></Glyph>
        </button>
      </div>}
    </div>}
    {target && createPortal(<main className={`${styles.timer} ${environmentStyles.focus} bt-focus-surface`}
      data-environment={environment.id} data-paused={paused || undefined} aria-label={t("miniTimer.title")}
      style={{ ...environment.theme, ...(paused ? environment.pausedTheme : {}),
        background: "var(--bt-focus-env-canvas, var(--bt-ink))" }}>
      <FocusEnvironmentRenderer environment={environment} paused={paused} compact />
      {!paused && <div className={styles.readabilityVeil} aria-hidden="true" />}
      <div className={styles.content}>
      <p className={styles.course} title={course?.name || noCourseLabel || t("dash.noCourse")}>
        {course?.color && <span aria-hidden="true" className={styles.courseDot} style={{ backgroundColor: course.color }} />}
        <span data-focus-reading="">{course?.name || noCourseLabel || t("dash.noCourse")}</span>
      </p>
      <p className={styles.time} role="timer" aria-live="off" aria-label={t("miniTimer.time")}>
        {formatDuration(seconds).replace(/^00:/, "")}
      </p>
      <div className={styles.footer}>
      <p className={styles.status} role="status"><span data-focus-reading="">{t(statusKey)}</span></p>
      <button type="button" className={styles.returnButton} onClick={returnToFocus}>
        <Glyph size={16}><path d="M9 5H5v14h14v-4M13 5h6v6M19 5l-8 8"/></Glyph>
        {t("miniTimer.return")}
      </button>
      </div>
      </div>
    </main>, target)}
  </>;
}
