import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useI18n } from "../contexts/I18nContext";

export default function SetupUsernameStatus({ value, id }) {
  const { t } = useI18n();
  const [result, setResult] = useState(null);
  const name = value.trim();
  const valid = name.length >= 3 && name.length <= 30 && !/\s/.test(name);
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
  const state = !valid ? "idle" : result?.name === name ? result.state : "checking";
  const key = { idle: "signup.pseudoHint", checking: "setup.checking", available: "setup.available", unavailable: "signup.errPseudoTaken", error: "setup.checkFailed" }[state];
  return <p id={id} className="setup-status" data-status={state} role="status" aria-live="polite">{t(key)}</p>;
}
