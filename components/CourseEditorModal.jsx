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

function IconX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

export default function CourseEditorModal({ course, colors, busy, onClose, onSave, onDelete }) {
  const { t } = useI18n();
  const nameInputRef = useRef(null);
  const deleteConfirmRef = useRef(null);
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

  const hasChanges = name !== initialValues.name
    || color !== initialValues.color
    || examDate !== initialValues.examDate;

  const requestClose = useCallback(() => {
    if (busy) return;
    if (hasChanges && typeof window !== "undefined" && !window.confirm(t("courseEditor.discardChanges"))) return;
    onClose();
  }, [busy, hasChanges, onClose, t]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    nameInputRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") requestClose();
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
      className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4"
      style={{ backgroundColor: "rgba(31,26,23,0.48)", backdropFilter: "blur(4px)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="course-editor-title"
      onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}
    >
      <div
        className="w-full rounded-t-[28px] sm:max-w-md sm:rounded-[24px] overflow-y-auto"
        style={{
          backgroundColor: "var(--bt-surface)",
          boxShadow: "0 -10px 48px rgba(31,26,23,0.18)",
          maxHeight: "92dvh",
          overscrollBehavior: "contain",
        }}
      >
        <div className="flex justify-center pt-3 sm:hidden" aria-hidden="true">
          <span className="h-1 w-10 rounded-full" style={{ backgroundColor: "var(--bt-border)" }} />
        </div>

        <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-4 sm:px-6 sm:pt-6">
          <div>
            <h2 id="course-editor-title" className="text-lg font-bold" style={{ color: "var(--bt-text-1)" }}>
              {course ? t("courseEditor.editTitle") : t("courseEditor.addTitle")}
            </h2>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
              {course ? t("courseEditor.editHelp") : t("courseEditor.addHelp")}
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={busy}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-50"
            style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)" }}
            aria-label={t("common.close")}
          >
            <IconX />
          </button>
        </div>

        <form onSubmit={submit} className="px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
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

          <fieldset className="mt-5">
            <legend className="label">{t("courseEditor.color")}</legend>
            <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
              {colors.map((option, index) => {
                const selected = color === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setColor(option)}
                    disabled={busy}
                    className="flex h-11 w-11 items-center justify-center rounded-xl transition-colors disabled:opacity-50"
                    style={{ backgroundColor: selected ? "var(--bt-subtle)" : "transparent" }}
                    aria-label={t(COLOR_LABEL_KEYS[index])}
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
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-5">
            <label htmlFor="course-editor-exam" className="label">{t("courseEditor.examDate")}</label>
            <div className="flex items-center gap-2">
              <input
                id="course-editor-exam"
                type="date"
                className="input min-h-11"
                value={examDate}
                onChange={(event) => setExamDate(event.target.value)}
                disabled={busy}
              />
              {examDate && (
                <button
                  type="button"
                  onClick={() => setExamDate("")}
                  disabled={busy}
                  className="btn-ghost min-h-11 shrink-0 px-3 text-xs"
                >
                  {t("courseEditor.clearDate")}
                </button>
              )}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
              {t("courseEditor.examHelp")}
            </p>
          </div>

          {error && (
            <p className="bt-form-alert mt-4" role="alert">{error}</p>
          )}

          <div className="mt-6 flex gap-2">
            <button type="button" onClick={requestClose} disabled={busy} className="btn-ghost min-h-11 flex-1">
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={busy || !name.trim()} className="btn-primary min-h-11 flex-1">
              {busy && <span className="bt-button-spinner" aria-hidden="true" />}
              {busy ? t("common.saving") : t("common.save")}
            </button>
          </div>

          {course && (
            <div className="mt-7 pt-5" style={{ borderTop: "1px solid var(--bt-border)" }}>
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:opacity-50"
                  style={{ color: "#DC2626", backgroundColor: "rgba(220,38,38,0.07)" }}
                >
                  <IconTrash />
                  {t("courseEditor.deleteCourse")}
                </button>
              ) : (
                <div ref={deleteConfirmRef} role="alert">
                  <p className="text-sm font-semibold" style={{ color: "#DC2626" }}>{t("courseEditor.deleteConfirmTitle")}</p>
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
                      className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50"
                      style={{ backgroundColor: "#DC2626" }}
                    >
                      {busy && <span className="bt-button-spinner" aria-hidden="true" />}
                      {busy ? t("courseEditor.deleting") : t("common.delete")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
