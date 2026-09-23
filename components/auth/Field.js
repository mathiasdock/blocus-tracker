import { useState } from "react";
import Glyph from "../Glyph";

// Grouped rows: the label sits above its value inside one surface, rows are
// separated by an inset hairline. A form reads as one object instead of a
// stack of separate boxes, and each answer costs one compact row.

export function FieldGroup({ children, className = "", ...rest }) {
  return <div className={`bt-fields ${className}`.trim()} {...rest}>{children}</div>;
}

// Two short answers that belong together (first and last name) share a row.
export function FieldSplit({ children }) {
  return <div className="bt-field-split">{children}</div>;
}

export function messageId(id) {
  return `${id}-message`;
}

/**
 * One row. The control is the child (an input or a select carrying the
 * `bt-field-input` class, `id` and `aria-describedby={messageId(id)}`).
 * `trailing` holds a small status or action on the right edge.
 */
export function Field({ id, label, hint, error, trailing, children, className = "" }) {
  const message = error || hint;
  return (
    <div className={`bt-field ${className}`.trim()} data-invalid={error ? "true" : undefined}>
      <label className="bt-field-label" htmlFor={id}>{label}</label>
      <div className="bt-field-control">{children}</div>
      {trailing && <div className="bt-field-trailing">{trailing}</div>}
      {message && (
        <p id={messageId(id)} className="bt-field-message" role={error ? "alert" : undefined}>
          {message}
        </p>
      )}
    </div>
  );
}

function EyeIcon({ open }) {
  return open ? (
    <Glyph size={19}>
      <path d="M2 2l20 20" />
      <path d="M6.7 6.7C4.4 8.2 2.8 10.4 2 12c1.7 3.4 5.3 7 10 7 1.7 0 3.2-.5 4.5-1.2" />
      <path d="M10.7 10.7a2 2 0 002.6 2.6" />
      <path d="M9.8 5.2c.7-.1 1.4-.2 2.2-.2 4.7 0 8.3 3.6 10 7-.5 1-1.2 2-2.1 2.9" />
    </Glyph>
  ) : (
    <Glyph size={19}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </Glyph>
  );
}

export function PasswordField({
  id, label, value, onChange, onBlur, error, hint, placeholder, autoComplete,
  disabled, showLabel, hideLabel, autoFocus,
}) {
  const [visible, setVisible] = useState(false);
  return (
    <Field
      id={id}
      label={label}
      error={error}
      hint={hint}
      trailing={(
        <button
          type="button"
          className="bt-field-icon"
          onClick={() => setVisible(current => !current)}
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          disabled={disabled}
        >
          <EyeIcon open={visible} />
        </button>
      )}
    >
      <input
        id={id}
        className="bt-field-input"
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        minLength={6}
        maxLength={128}
        disabled={disabled}
        required
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? messageId(id) : undefined}
      />
    </Field>
  );
}

// A sentence under a group: form-level error, or quiet guidance.
export function FormNote({ id, tone = "quiet", children }) {
  if (!children) return null;
  return (
    <p id={id} className="bt-form-note" data-tone={tone} role={tone === "error" ? "alert" : undefined}>
      {children}
    </p>
  );
}
