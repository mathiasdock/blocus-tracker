import { useEffect, useRef } from "react";
import Link from "next/link";
import Glyph from "../Glyph";
import { useI18n } from "../../contexts/I18nContext";

// The one frame of every page before the app: sign in, sign up, check email,
// password recovery and the three setup steps. The app's wordmark on the
// animated ground (components/auth/AuthBackdrop, mounted once in _app), the
// task on the left, and on a wide screen the mascot guide standing on the
// student's space on the right. On a phone the guide sits above the task and
// the space is not drawn: the form itself is the space being filled.
//
// One DOM order for every width — guide, task, space — placed by CSS grid
// areas, so a screen reader always hears the guide's line before the heading.

const STAGES = ["setup.stageAccount", "setup.stageStudies", "setup.stageCourses"];

function SetupProgress({ stage }) {
  const { t } = useI18n();
  return (
    <ol className="bt-auth-steps" aria-label={t("setup.progressLabel")}>
      {STAGES.map((key, index) => {
        const state = index < stage ? "done" : index === stage ? "current" : "todo";
        return (
          <li key={key} data-state={state} aria-current={state === "current" ? "step" : undefined}>
            <span className="bt-auth-step-bar" aria-hidden="true" />
            <span className="bt-auth-step-name">
              {state === "done" && (
                <Glyph size={12} className="bt-auth-step-check"><path d="m5 12.5 4.2 4.2L19 7" /></Glyph>
              )}
              {t(key)}
              {state === "done" && <span className="sr-only"> ({t("setup.stageDone")})</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * @param {number|null} stage      0-2 during sign-up/onboarding, null elsewhere
 * @param {object}      alternate  { text, cta, href } — the other door, top right
 * @param {ReactNode}   guide      the mascot's line (components/auth/MascotGuide)
 * @param {ReactNode}   aside      the student's space, wide screens only
 * @param {"split"|"single"} layout single keeps the guide above a centred task
 * @param {string}      contentKey changes when the task changes: heading takes focus
 */
export default function AuthShell({
  stage = null, alternate = null, guide = null, aside = null, layout = "split",
  onBack, backLabel, contentKey, children,
}) {
  const { t } = useI18n();
  const body = useRef(null);
  const previousKey = useRef(contentKey);

  // A new task moves focus to its heading, so a screen reader announces where
  // the student arrived, and a phone starts at the top of the new question.
  useEffect(() => {
    if (previousKey.current === contentKey) return;
    previousKey.current = contentKey;
    const heading = body.current?.querySelector("h1");
    if (heading && !body.current.contains(document.activeElement)) heading.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [contentKey]);

  const backName = backLabel ? t("setup.backTo").replace("{step}", backLabel) : undefined;
  const classes = [
    "bt-auth",
    `is-${layout}`,
    aside ? "has-aside" : "",
    guide ? "has-guide" : "",
    stage != null ? "has-steps" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <header className="bt-auth-top">
        <Link href="/" className="bt-auth-mark" aria-label={t("setup.home")}>
          blocus<span aria-hidden="true">·</span>tracker
        </Link>
        {stage != null && (
          <div className="bt-auth-progress">
            {/* On a phone the way back sits where every onboarding puts it:
                left of the progress, above the guide. */}
            {onBack && (
              <button type="button" className="bt-auth-back-mini" onClick={onBack} aria-label={backName}>
                <Glyph size={18}><path d="m14.5 6-6 6 6 6" /></Glyph>
              </button>
            )}
            <SetupProgress stage={stage} />
          </div>
        )}
        {alternate && (
          <p className="bt-auth-alt">
            <span className="bt-auth-alt-text">{alternate.text}</span>{" "}
            <Link href={alternate.href} className="bt-auth-alt-link">{alternate.cta}</Link>
          </p>
        )}
      </header>

      <main className="bt-auth-main">
        {guide && <div className="bt-auth-guide">{guide}</div>}
        <div className="bt-auth-task">
          {onBack && (
            <button type="button" className="bt-auth-back" onClick={onBack} aria-label={backName}>
              <Glyph size={16}><path d="m14.5 6-6 6 6 6" /></Glyph>
              {backLabel}
            </button>
          )}
          <div className="bt-auth-body" key={contentKey} ref={body}>
            {children}
          </div>
        </div>
        {aside && <div className="bt-auth-aside">{aside}</div>}
      </main>
    </div>
  );
}

// Title, and optionally one sentence the student needs (an email address, a
// consequence). The guide says the rest. The heading is focusable so the
// shell can move focus to it when the step changes.
export function AuthHeading({ title, lead, id }) {
  return (
    <div className="bt-auth-heading">
      <h1 id={id} tabIndex={-1}>{title}</h1>
      {lead && <p>{lead}</p>}
    </div>
  );
}
