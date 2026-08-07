import { useState } from "react";

function EyeIcon({ hidden }) {
  return hidden ? (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 2l20 20" />
      <path d="M6.7 6.7C4.4 8.2 2.8 10.4 2 12c1.7 3.4 5.3 7 10 7 1.7 0 3.2-.5 4.5-1.2" />
      <path d="M10.7 10.7a2 2 0 002.6 2.6" />
      <path d="M9.8 5.2c.7-.1 1.4-.2 2.2-.2 4.7 0 8.3 3.6 10 7-.5 1-1.2 2-2.1 2.9" />
    </svg>
  ) : (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function PasswordInput({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  helper,
  autoComplete,
  disabled,
  required = true,
  showLabel,
  hideLabel,
}) {
  const [visible, setVisible] = useState(false);
  const messageId = `${id}-message`;

  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <div className="relative">
        <input
          id={id}
          className={`input pr-12 ${error ? "input-error" : ""}`}
          type={visible ? "text" : "password"}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          autoComplete={autoComplete}
          minLength={6}
          maxLength={128}
          disabled={disabled}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={(error || helper) ? messageId : undefined}
        />
        <button
          type="button"
          onClick={() => setVisible(current => !current)}
          className="bt-tap absolute right-1 top-1/2 inline-flex w-11 -translate-y-1/2 items-center justify-center rounded-xl transition-colors hover:bg-stone-100 dark:hover:bg-stone-800"
          style={{ color: "var(--bt-text-2)" }}
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          disabled={disabled}
        >
          <EyeIcon hidden={visible} />
        </button>
      </div>
      {(error || helper) && (
        <p
          id={messageId}
          className={`mt-1.5 text-xs leading-relaxed ${error ? "bt-form-error" : ""}`}
          style={error ? undefined : { color: "var(--bt-text-2)" }}
          role={error ? "alert" : undefined}
        >
          {error || helper}
        </p>
      )}
    </div>
  );
}
