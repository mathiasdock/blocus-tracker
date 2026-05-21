import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { translate } from "../lib/i18n";

const I18nContext = createContext({ lang: "fr", setLang: () => {}, t: (k) => k });
const KEY = "bt_lang";

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState("fr");

  // Restore preference on mount.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "fr" || saved === "en") setLangState(saved);
    } catch {}
  }, []);

  const setLang = useCallback((l) => {
    setLangState(l);
    try { localStorage.setItem(KEY, l); } catch {}
  }, []);

  const t = useCallback((key) => translate(lang, key), [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext);
