import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../contexts/I18nContext";
import { formatDuration } from "../../lib/format";
import Glyph from "../Glyph";
import styles from "./FocusMiniTimer.module.css";

// Operate: a quiet, native always-on-top view of the existing chrono, not a
// second timer. App neutrals, course identity and tabular time; no shader,
// reward, animation or PiP-local controls that can change the study session.
const DESKTOP_QUERY = "(min-width: 768px) and (hover: hover) and (pointer: fine)";

// The native PiP document does not inherit styles. Copy the already-loaded
// app rules (including local fonts/tokens); do not run a second app/root.
function prepareDocument(pip, source, title) {
  pip.document.title = title;
  const base = pip.document.createElement("base");
  base.href = source.baseURI;
  pip.document.head.appendChild(base);
  for (const sheet of Array.from(source.styleSheets)) {
    try {
      const style = pip.document.createElement("style");
      style.textContent = Array.from(sheet.cssRules, rule => rule.cssText).join("\n");
      pip.document.head.appendChild(style);
    } catch {
      // An inaccessible cross-origin sheet can still be loaded normally.
      if (!sheet.href) continue;
      const link = pip.document.createElement("link");
      link.rel = "stylesheet";
      link.href = sheet.href;
      pip.document.head.appendChild(link);
    }
  }
  pip.document.body.className = styles.windowBody;
  const root = pip.document.createElement("div");
  pip.document.body.appendChild(root);
  return root;
}

export default function FocusMiniTimer({ chrono, courses = [], noCourseLabel, visible = true }) {
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
      if (event.key !== "Escape") return;
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
      const root = prepareDocument(pip, document, `Blocus Tracker · ${t("miniTimer.title")}`);
      const syncTheme = () => {
        pip.document.documentElement.classList.toggle("dark", document.documentElement.classList.contains("dark"));
        pip.document.documentElement.lang = document.documentElement.lang || lang;
      };
      syncTheme();
      const observer = new MutationObserver(syncTheme);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "lang"] });
      const onHide = () => {
        observer.disconnect();
        pip.removeEventListener("pagehide", onHide);
        if (active.current?.window !== pip) return;
        active.current = null;
        if (mounted.current) setTarget(null);
      };
      active.current = { window: pip, cleanup: () => {
        observer.disconnect();
        pip.removeEventListener("pagehide", onHide);
      } };
      pip.addEventListener("pagehide", onHide);
      setTarget(root);
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
  const seconds = chrono.pomodoro ? Math.max(0, chrono.pomoTargetSecs - chrono.elapsed) : chrono.elapsed;
  const statusKey = chrono.isPaused ? "miniTimer.paused"
    : chrono.onBreak ? "miniTimer.break" : chrono.running ? "miniTimer.studying" : "miniTimer.ready";

  return <>
    {desktop && <div ref={control} className={styles.control} data-visible={visible || opening || feedback ? "true" : "false"}>
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
    {target && createPortal(<main className={styles.timer} aria-label={t("miniTimer.title")}>
      <p className={styles.course} title={course?.name || noCourseLabel || t("dash.noCourse")}>
        {course?.color && <span aria-hidden="true" className={styles.courseDot} style={{ backgroundColor: course.color }} />}
        <span>{course?.name || noCourseLabel || t("dash.noCourse")}</span>
      </p>
      <p className={styles.time} role="timer" aria-live="off" aria-label={t("miniTimer.time")} data-paused={chrono.isPaused || undefined}>
        {formatDuration(seconds).replace(/^00:/, "")}
      </p>
      <p className={styles.status} role="status">{t(statusKey)}</p>
      <button type="button" className={styles.returnButton} onClick={returnToFocus}>
        <Glyph size={16}><path d="M9 5H5v14h14v-4M13 5h6v6M19 5l-8 8"/></Glyph>
        {t("miniTimer.return")}
      </button>
    </main>, target)}
  </>;
}
