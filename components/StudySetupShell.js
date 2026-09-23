import { useEffect, useRef } from "react";
import Link from "next/link";
import Glyph from "./Glyph";
import { useI18n } from "../contexts/I18nContext";
import { fieldLabel } from "../lib/studySpaces.mjs";
import { studyYearShortLabel } from "../lib/studyYears";

// Study Space Setup: real academic answers accumulate beside the current
// question. No invented study data, illustration or independent form card.
export default function StudySetupShell({ step = 0, firstName, university, broadField, year, program, courses = [], onBack, children, footer }) {
  const { t, lang } = useI18n();
  const content = useRef(null);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current !== step) {
      content.current?.querySelector("h1")?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
      previousStep.current = step;
    }
  }, [step]);
  const academic = [university, fieldLabel(broadField, lang), studyYearShortLabel(year, t)].filter(Boolean);
  const progress = t("setup.progress").replace("{step}", step + 1);
  return <main className="study-setup">
    <header className="setup-header">
      <Link href="/" className="setup-wordmark" aria-label="Blocus Tracker">blocus<span>·</span>tracker</Link>
      <span className="setup-header-purpose">{t("setup.space")}</span>
    </header>
    <div className="setup-layout">
      <aside className="setup-space" aria-label={t("setup.space")}>
        <h2>{t("setup.space")}</h2>
        {firstName?.trim() && <p className="setup-name">{firstName.trim()}</p>}
        {academic.length > 0 && <div className="setup-academic">{academic.map((answer, index) => <p key={index}>{answer}</p>)}</div>}
        {program?.trim() && <p className="setup-program">{program.trim()}</p>}
        {courses.length > 0 && <ul className="setup-summary-courses">{courses.map(course => <li key={course.id}><span className="setup-dot" style={{ background: course.color }} /><span>{course.name}</span></li>)}</ul>}
      </aside>
      <section className="setup-question" ref={content}>
        <div className="setup-progress-header">
          {onBack ? <button type="button" className="setup-back" onClick={onBack}><Glyph size={18}><path d="m14 6-6 6 6 6" /></Glyph>{t("comm.back")}</button> : <span />}
          <span>{progress}</span>
        </div>
        <div className="setup-progress" role="progressbar" aria-label={progress} aria-valuemin={0} aria-valuemax={5} aria-valuenow={step + 1}><span style={{ width: `${(step + 1) * 20}%` }} /></div>
        {university && step > 2 && <p className="setup-mobile-context">{university}</p>}
        <div className="setup-content" key={step}>{children}</div>
        {footer && <footer className="setup-footer">{footer}</footer>}
      </section>
    </div>
  </main>;
}
