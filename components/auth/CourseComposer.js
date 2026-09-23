import { useRef, useState } from "react";
import Glyph from "../Glyph";
import { useI18n } from "../../contexts/I18nContext";
import { COURSE_COLORS } from "../../lib/courseColors";
import { splitCourseNames } from "../../lib/onboarding.mjs";

// Course entry of the setup. The keyboard grammar comes from 21st.dev's
// accessible Tag Input (ddoemonn): Enter adds and keeps the focus, a pasted
// list adds one course per line, a duplicate lights up the course it repeats,
// Backspace on an empty entry selects the last course and a second Backspace
// removes it, and every change is spoken in a polite live region. The rows
// themselves follow 21st.dev's Inline Edit Settings (felipemenezes098): one
// value edited at a time, in place. Both were rebuilt in this project's own
// vocabulary — rows of a grouped list, the course's colour as its only mark,
// Blocus tokens, no animation library.

function CourseRow({ course, t, locked, editing, editValue, rowError, paletteOpen, armed, flashed, onEditStart, onEditChange, onEditCommit, onEditCancel, onPalette, onRecolor, onRemove, onRetry }) {
  const saving = course.status === "saving";
  const failed = course.status === "failed";
  const fixed = locked || saving || failed;
  const errorId = `course-error-${course.id}`;
  return (
    <li
      className="bt-setup-course"
      data-status={course.status || "saved"}
      data-armed={armed ? "true" : undefined}
      data-flash={flashed ? "true" : undefined}
      data-editing={editing ? "true" : undefined}
    >
      <div className="bt-setup-course-line">
        <button
          type="button"
          id={`course-color-${course.id}`}
          className="bt-setup-swatch"
          style={{ "--course": course.color }}
          aria-label={t("setup.changeColor").replace("{course}", course.name)}
          aria-expanded={paletteOpen}
          disabled={fixed || editing}
          onClick={onPalette}
        >
          <span className="bt-setup-dot" aria-hidden="true" />
        </button>

        {editing ? (
          <input
            className="bt-setup-rename"
            value={editValue}
            onChange={event => onEditChange(event.target.value)}
            onKeyDown={event => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter") { event.preventDefault(); onEditCommit(); }
              if (event.key === "Escape") { event.preventDefault(); onEditCancel(); }
            }}
            onBlur={event => {
              // Leaving for the row's own cancel button is not a validation.
              if (event.relatedTarget && event.currentTarget.closest("li")?.contains(event.relatedTarget)) return;
              onEditCommit();
            }}
            maxLength={80}
            autoFocus
            enterKeyHint="done"
            aria-label={t("onboarding.courses.editName")}
            aria-invalid={Boolean(rowError)}
            aria-describedby={rowError ? errorId : undefined}
          />
        ) : (
          <button
            type="button"
            id={`course-name-${course.id}`}
            className="bt-setup-course-name"
            aria-label={t("setup.rename").replace("{course}", course.name)}
            disabled={fixed}
            onClick={onEditStart}
          >
            {course.name}
          </button>
        )}

        {saving && <span className="bt-setup-saving" aria-hidden="true" />}
        {failed && (
          <button type="button" className="bt-setup-retry" onClick={onRetry} disabled={locked}>
            {t("setup.courseRetry")}
          </button>
        )}

        {editing ? (
          <button
            type="button"
            className="bt-setup-icon"
            aria-label={t("common.cancel")}
            onPointerDown={event => event.preventDefault()}
            onClick={onEditCancel}
          >
            <Glyph size={16}><path d="m7 7 10 10M17 7 7 17" /></Glyph>
          </button>
        ) : (
          <button
            type="button"
            className="bt-setup-icon"
            aria-label={t("setup.remove").replace("{course}", course.name)}
            disabled={locked || saving}
            onClick={onRemove}
          >
            <Glyph size={16}><path d="m7 7 10 10M17 7 7 17" /></Glyph>
          </button>
        )}
      </div>

      {rowError && <p id={errorId} className="bt-setup-error" role="alert">{rowError}</p>}

      {paletteOpen && (
        <div
          className="bt-setup-palette"
          role="group"
          aria-label={t("onboarding.courses.color")}
          onKeyDown={event => {
            if (event.key === "Escape") { event.preventDefault(); onPalette(); }
          }}
        >
          {COURSE_COLORS.map((color, index) => (
            <button
              key={color}
              type="button"
              className="bt-setup-colour"
              style={{ "--course": color }}
              aria-label={t("setup.colorOption").replace("{n}", index + 1)}
              aria-pressed={color === course.color}
              autoFocus={color === course.color}
              onClick={() => onRecolor(color)}
            />
          ))}
        </div>
      )}
    </li>
  );
}

export default function CourseComposer({ setup, draft, onDraftChange, inputId = "onboarding-course", disabled = false }) {
  const { t } = useI18n();
  const inputRef = useRef(null);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [rowError, setRowError] = useState(null);
  const [paletteId, setPaletteId] = useState(null);
  const [armedId, setArmedId] = useState(null);
  const committing = useRef(false);
  const cancelled = useRef(false);
  const hintId = `${inputId}-hint`;
  const { courses, busyId, notice, flashId, announcement, nextColor } = setup;
  const locked = disabled || Boolean(busyId);

  function focusEntry() {
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function focusRow(id, part = "name") {
    requestAnimationFrame(() => document.getElementById(`course-${part}-${id}`)?.focus());
  }

  function addNames(names) {
    const result = setup.add(names);
    if (result.added > 0) onDraftChange("");
    return result;
  }

  function submitDraft() {
    if (!draft.trim()) return;
    addNames([draft]);
    focusEntry();
  }

  function startEdit(course) {
    cancelled.current = false;
    setPaletteId(null);
    setArmedId(null);
    setRowError(null);
    setEditingId(course.id);
    setEditValue(course.name);
  }

  function cancelEdit() {
    const id = editingId;
    // The input leaves the page right after: its blur must not save the text
    // the student just abandoned.
    cancelled.current = true;
    setEditingId(null);
    setEditValue("");
    setRowError(null);
    if (id) focusRow(id);
  }

  async function commitEdit() {
    if (!editingId || committing.current || cancelled.current) return;
    const id = editingId;
    committing.current = true;
    const result = await setup.rename(id, editValue);
    committing.current = false;
    if (result.ok) {
      setEditingId(null);
      setEditValue("");
      setRowError(null);
      focusRow(id);
    } else if (result.error) {
      setRowError({ id, text: result.error });
    }
  }

  async function recolor(course, color) {
    setPaletteId(null);
    await setup.recolor(course.id, color);
    focusRow(course.id, "color");
  }

  async function remove(course) {
    setArmedId(null);
    setPaletteId(null);
    const result = await setup.remove(course.id);
    if (result.ok) focusEntry();
  }

  function handleKeyDown(event) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      submitDraft();
      return;
    }
    if (event.key === "Backspace" && draft === "") {
      const saved = courses.filter(course => !course.status);
      const last = saved[saved.length - 1];
      if (!last || locked) return;
      event.preventDefault();
      if (event.repeat) return;
      if (armedId === last.id) {
        remove(last);
      } else {
        setArmedId(last.id);
        setup.announce(t("setup.courseArmed").replace("{course}", last.name));
      }
      return;
    }
    if (event.key === "Escape" && armedId) {
      event.preventDefault();
      setArmedId(null);
    }
  }

  function handlePaste(event) {
    const text = event.clipboardData?.getData("text") || "";
    if (!/[\n\r\t;]/.test(text)) return;
    event.preventDefault();
    addNames(splitCourseNames(text));
  }

  return (
    <div className="bt-setup-courses">
      <div className="bt-fields bt-setup-course-group">
        {courses.length > 0 && (
          <ul className="bt-setup-course-items" aria-label={t("setup.courseList")}>
            {courses.map(course => (
              <CourseRow
                key={course.id}
                course={course}
                t={t}
                locked={locked || (editingId !== null && editingId !== course.id)}
                editing={editingId === course.id}
                editValue={editValue}
                rowError={rowError?.id === course.id ? rowError.text : null}
                paletteOpen={paletteId === course.id}
                armed={armedId === course.id}
                flashed={flashId === course.id}
                onEditStart={() => startEdit(course)}
                onEditChange={value => { setEditValue(value); setRowError(null); }}
                onEditCommit={commitEdit}
                onEditCancel={cancelEdit}
                onPalette={() => {
                  setArmedId(null);
                  if (paletteId === course.id) {
                    setPaletteId(null);
                    focusRow(course.id, "color");
                  } else {
                    setPaletteId(course.id);
                  }
                }}
                onRecolor={color => recolor(course, color)}
                onRemove={() => remove(course)}
                onRetry={() => setup.retry(course.id)}
              />
            ))}
          </ul>
        )}

        <div className="bt-setup-entry" data-empty={courses.length === 0 ? "true" : undefined}>
          <span className="bt-setup-next" style={{ "--course": nextColor }} aria-hidden="true" />
          <label htmlFor={inputId} className="sr-only">{t("setup.courseLabel")}</label>
          <input
            id={inputId}
            ref={inputRef}
            className="bt-field-input"
            value={draft}
            onChange={event => {
              onDraftChange(event.target.value);
              setArmedId(null);
              setup.clearNotice();
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={() => setArmedId(null)}
            placeholder={courses.length ? t("setup.coursePlaceholderNext") : t("setup.coursePlaceholderFirst")}
            maxLength={80}
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="enter"
            autoFocus
            disabled={disabled}
            aria-describedby={hintId}
          />
          {draft.trim() && (
            <button
              type="button"
              className="bt-setup-add"
              onPointerDown={event => event.preventDefault()}
              onClick={submitDraft}
              disabled={disabled}
            >
              {t("setup.courseAdd")}
            </button>
          )}
        </div>
      </div>

      <p id={hintId} className="bt-form-note" data-tone={notice?.tone || "quiet"} role={notice?.tone === "error" ? "alert" : undefined}>
        {notice?.text || t("setup.courseHint")}
      </p>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
    </div>
  );
}
