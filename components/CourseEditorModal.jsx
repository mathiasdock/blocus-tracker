import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../contexts/I18nContext";

const COLOR_LABEL_KEYS = [
  "courseEditor.colorRed",
  "courseEditor.colorOrange",
  "courseEditor.colorAmber",
  "courseEditor.colorYellow",
  "courseEditor.colorLime",
  "courseEditor.colorMeadow",
  "courseEditor.colorGreen",
  "courseEditor.colorEmerald",
  "courseEditor.colorTeal",
  "courseEditor.colorCyan",
  "courseEditor.colorSky",
  "courseEditor.colorBlue",
  "courseEditor.colorIndigo",
  "courseEditor.colorPurple",
  "courseEditor.colorFuchsia",
  "courseEditor.colorPink",
  "courseEditor.colorRose",
  "courseEditor.colorBrown",
  "courseEditor.colorSlate",
  "courseEditor.colorBurgundy",
];

const COMPACT_COLOR_INDEXES = [0, 2, 4, 6, 8, 10, 11, 13, 15, 18];
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function isLightColor(hex) {
  const value = String(hex || "").replace("#", "");
  if (value.length !== 6) return false;
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) => (
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue) > 0.48;
}

function IconX() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

function IconChevron({ expanded }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export default function CourseEditorModal({ course, colors, busy, onClose, onSave, onDelete }) {
  const { t } = useI18n();
  const dialogRef = useRef(null);
  const nameInputRef = useRef(null);
  const deleteConfirmRef = useRef(null);
  const openerRef = useRef(null);
  const initialValues = useMemo(() => ({
    name: course?.name || "",
    color: course?.color || colors[0],
    examDate: course?.exam_date || "",
  }), [course, colors]);
  const [name, setName] = useState(initialValues.name);
  const [color, setColor] = useState(initialValues.color);
  const [examDate, setExamDate] = useState(initialValues.examDate);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAllColors, setShowAllColors] = useState(false);

  const hasChanges = name !== initialValues.name
    || color !== initialValues.color
    || examDate !== initialValues.examDate;

  const visibleColors = useMemo(() => {
    if (showAllColors) return colors;
    const compact = COMPACT_COLOR_INDEXES.map((index) => colors[index]).filter(Boolean);
    if (compact.includes(color)) return compact;
    return [...compact.slice(0, -1), color];
  }, [color, colors, showAllColors]);

  const requestClose = useCallback(() => {
    if (busy) return;
    if (hasChanges && typeof window !== "undefined" && !window.confirm(t("courseEditor.discardChanges"))) return;
    onClose();
  }, [busy, hasChanges, onClose, t]);

  useEffect(() => {
    openerRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.requestAnimationFrame(() => {
      if (window.matchMedia("(min-width: 640px)").matches) nameInputRef.current?.focus();
      else dialogRef.current?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(focusTimer);
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus?.({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      if (activeElement === dialogRef.current || !dialogRef.current.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); };
  }, [requestClose]);

  useEffect(() => {
    if (confirmDelete) deleteConfirmRef.current?.scrollIntoView({ block: "nearest" });
  }, [confirmDelete]);

  async function submit(event) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError(t("courseEditor.nameRequired"));
      nameInputRef.current?.focus();
      return;
    }
    setError("");
    const result = await onSave({
      id: course?.id || null,
      name: cleanName,
      color,
      examDate: examDate || null,
    });
    if (result?.ok) onClose();
    else setError(result?.message || t("courseEditor.saveError"));
  }

  async function removeCourse() {
    if (!course || busy) return;
    setError("");
    const result = await onDelete(course.id);
    if (result?.ok) onClose();
    else setError(result?.message || t("courseEditor.deleteError"));
  }

  return (
    <div
      className="bt-course-editor-scrim fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="bt-course-editor-panel flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-[24px] focus:outline-none sm:max-w-md sm:rounded-2xl"
        style={{ backgroundColor: "var(--bt-surface)", boxShadow: "0 18px 60px rgba(31,26,23,0.22)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-editor-title"
      >
        <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden="true">
          <span className="h-1 w-9 rounded-full" style={{ backgroundColor: "var(--bt-border)" }} />
        </div>

        <div className="flex shrink-0 items-center justify-between gap-4 px-5 pb-3 pt-3 sm:px-6 sm:pb-4 sm:pt-5">
          <h2 id="course-editor-title" className="text-lg font-bold" style={{ color: "var(--bt-text-1)" }}>
            {course ? t("courseEditor.editTitle") : t("courseEditor.addTitle")}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            disabled={busy}
            className="bt-tap flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-[var(--bt-subtle)] disabled:opacity-50"
            style={{ color: "var(--bt-text-2)" }}
            aria-label={t("common.close")}
          >
            <IconX />
          </button>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 overflow-y-auto px-5 pb-4 sm:px-6">
            <div>
              <label htmlFor="course-editor-name" className="label">{t("courseEditor.name")}</label>
              <input
                ref={nameInputRef}
                id="course-editor-name"
                className={`input min-h-11 ${error && !name.trim() ? "input-error" : ""}`}
                value={name}
                onChange={(event) => { setName(event.target.value); setError(""); }}
                maxLength={120}
                autoComplete="off"
                disabled={busy}
                placeholder={t("dash.newCourse")}
              />
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="course-editor-exam" className="label mb-0">{t("courseEditor.examDate")}</label>
                {examDate && (
                  <button
                    type="button"
                    onClick={() => setExamDate("")}
                    disabled={busy}
                    className="bt-tap -my-2 min-h-11 rounded-lg px-2 text-xs font-semibold transition-colors hover:bg-[var(--bt-subtle)]"
                    style={{ color: "var(--bt-accent-text)" }}
                  >
                    {t("courseEditor.clearDate")}
                  </button>
                )}
              </div>
              <input
                id="course-editor-exam"
                type="date"
                className="input min-h-11"
                value={examDate}
                onChange={(event) => setExamDate(event.target.value)}
                disabled={busy}
              />
            </div>

            <fieldset className="mt-4">
              <legend className="label">{t("courseEditor.color")}</legend>
              <div className="grid grid-cols-5 justify-items-center gap-x-2 gap-y-1">
                {visibleColors.map((option) => {
                  const selected = color === option;
                  const colorIndex = colors.indexOf(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setColor(option)}
                      disabled={busy}
                      className="bt-tap flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-[var(--bt-subtle)] disabled:opacity-50"
                      aria-label={t(COLOR_LABEL_KEYS[colorIndex])}
                      aria-pressed={selected}
                    >
                      <span
                        className="flex h-7 w-7 items-center justify-center rounded-full"
                        style={{
                          backgroundColor: option,
                          boxShadow: selected ? "0 0 0 2px var(--bt-surface), 0 0 0 4px var(--bt-text-1)" : "none",
                        }}
                      >
                        {selected && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isLightColor(option) ? "#1F1A17" : "#FFFFFF"} strokeWidth="3.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
              {colors.length > COMPACT_COLOR_INDEXES.length && (
                <button
                  type="button"
                  onClick={() => setShowAllColors((value) => !value)}
                  disabled={busy}
                  className="bt-tap mx-auto mt-1 flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors hover:bg-[var(--bt-subtle)]"
                  style={{ color: "var(--bt-text-2)" }}
                  aria-expanded={showAllColors}
                >
                  {showAllColors ? t("courseEditor.fewerColors") : t("courseEditor.moreColors")}
                  <IconChevron expanded={showAllColors} />
                </button>
              )}
            </fieldset>

            {error && (
              <p className="bt-form-alert mt-3" role="alert">{error}</p>
            )}

            {course && (
              <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--bt-border)" }}>
                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => { setShowAllColors(false); setConfirmDelete(true); }}
                    disabled={busy}
                    className="bt-tap flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold transition-colors hover:bg-[var(--bt-danger-bg)] disabled:opacity-50"
                    style={{ color: "var(--bt-danger)" }}
                  >
                    <IconTrash />
                    {t("courseEditor.deleteCourse")}
                  </button>
                ) : (
                  <div
                    ref={deleteConfirmRef}
                    role="alert"
                    className="rounded-xl p-3"
                    style={{ backgroundColor: "var(--bt-danger-bg)", border: "1px solid var(--bt-danger-border)" }}
                  >
                    <p className="text-sm font-semibold" style={{ color: "var(--bt-danger)" }}>{t("courseEditor.deleteConfirmTitle")}</p>
                    <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
                      {t("courseEditor.deleteConfirmHelp")}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        disabled={busy}
                        className="btn-ghost min-h-11 flex-1"
                      >
                        {t("common.cancel")}
                      </button>
                      <button
                        type="button"
                        onClick={removeCourse}
                        disabled={busy}
                        className="btn min-h-11 flex-1 text-white disabled:opacity-50"
                        style={{ backgroundColor: "var(--bt-danger-solid)" }}
                      >
                        {busy && <span className="bt-button-spinner" aria-hidden="true" />}
                        {busy ? t("courseEditor.deleting") : t("common.delete")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {!confirmDelete && (
            <div
              className="flex shrink-0 gap-2 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-5"
              style={{ backgroundColor: "var(--bt-surface)", borderTop: "1px solid var(--bt-border)" }}
            >
              <button type="button" onClick={requestClose} disabled={busy} className="btn-ghost min-h-11 flex-1">
                {t("common.cancel")}
              </button>
              <button type="submit" disabled={busy || !name.trim()} className="btn-primary min-h-11 flex-1">
                {busy && <span className="bt-button-spinner" aria-hidden="true" />}
                {busy ? t("common.saving") : t("common.save")}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
