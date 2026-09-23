import { useEffect, useState } from "react";
import Glyph from "../Glyph";
import { supabase } from "../../lib/supabaseClient";
import { useI18n } from "../../contexts/I18nContext";

// Availability of a username, told at the end of its row while the student
// types. Informative only: the account creation re-checks it and remains the
// authority.

export function isPseudoShapeValid(value) {
  const name = String(value || "").trim();
  return name.length >= 3 && name.length <= 30 && !/\s/.test(name);
}

export function usePseudoAvailability(value) {
  const [result, setResult] = useState(null);
  const name = String(value || "").trim();
  const valid = isPseudoShapeValid(name);

  useEffect(() => {
    if (!valid) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc("is_pseudo_available", { p_pseudo: name });
        if (!cancelled) setResult({ name, state: error ? "error" : data === true ? "available" : "unavailable" });
      } catch (_) {
        if (!cancelled) setResult({ name, state: "error" });
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [name, valid]);

  if (!valid) return "idle";
  return result?.name === name ? result.state : "checking";
}

const SHORT = { checking: "setup.pseudoChecking", available: "setup.pseudoFree", unavailable: "setup.pseudoTaken" };
const SPOKEN = { checking: "setup.checking", available: "setup.available", unavailable: "signup.errPseudoTaken", error: "setup.checkFailed" };

export function PseudoStatus({ state }) {
  const { t } = useI18n();
  return (
    <>
      {SHORT[state] && (
        <span className="bt-pseudo-status" data-status={state} aria-hidden="true">
          {state === "checking" && <span className="bt-pseudo-spinner" />}
          {state === "available" && <Glyph size={14}><path d="m5 12.5 4.2 4.2L19 7" /></Glyph>}
          {state === "unavailable" && <Glyph size={14}><path d="m7 7 10 10M17 7 7 17" /></Glyph>}
          {t(SHORT[state])}
        </span>
      )}
      <span className="sr-only" role="status" aria-live="polite">{SPOKEN[state] ? t(SPOKEN[state]) : ""}</span>
    </>
  );
}
