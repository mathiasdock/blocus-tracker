import { createContext, useContext, useState, useCallback, useRef } from "react";

const ToastContext = createContext({ toast: () => {} });

const ICONS = {
  success: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  error: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  info: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /><circle cx="12" cy="12" r="9" />
    </svg>
  ),
};

const ACCENT = {
  success: { bg: "var(--bt-accent-bg)", fg: "var(--bt-accent-dark)" },
  error: { bg: "#FEF2F2", fg: "#DC2626" },
  info: { bg: "var(--bt-subtle)", fg: "var(--bt-text-2)" },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    // Mark leaving so the exit animation can play, then remove.
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 260);
  }, []);

  const toast = useCallback(
    (message, type = "success") => {
      if (!message) return;
      const id = ++idRef.current;
      setToasts((prev) => {
        // Keep the stack shallow — a premium app never buries the user in toasts.
        const next = [...prev, { id, message, type }];
        return next.slice(-3);
      });
      setTimeout(() => dismiss(id), 3000);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed z-50 flex flex-col gap-2 pointer-events-none
                   bottom-20 lg:bottom-6 left-4 right-4 lg:left-auto lg:right-6 lg:w-auto lg:max-w-sm items-center lg:items-end"
      >
        {toasts.map((t) => {
          const accent = ACCENT[t.type] || ACCENT.success;
          return (
            <button
              key={t.id}
              onClick={() => dismiss(t.id)}
              className={`pointer-events-auto w-full lg:w-auto lg:min-w-[220px] max-w-sm flex items-center gap-2.5 rounded-2xl pl-3 pr-4 py-2.5 text-left ${t.leaving ? "bt-toast-out" : "bt-toast-in"}`}
              style={{
                backgroundColor: "var(--bt-surface)",
                border: "1px solid var(--bt-border)",
                boxShadow: "0 10px 30px var(--bt-shadow)",
              }}
            >
              <span
                className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
                style={{ backgroundColor: accent.bg, color: accent.fg }}
              >
                {ICONS[t.type] || ICONS.success}
              </span>
              <span className="text-sm font-medium leading-snug" style={{ color: "var(--bt-text-1)" }}>
                {t.message}
              </span>
            </button>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
