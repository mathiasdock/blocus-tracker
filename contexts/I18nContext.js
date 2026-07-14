import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { translate } from "../lib/i18n";

const I18nContext = createContext({
  lang: "fr",
  langPref: "auto",
  setLangPref: () => {},
  setLang: () => {},
  t: (k) => k,
});

const PREF_KEY = "bt_lang_pref"; // "fr" | "en" — présent UNIQUEMENT si choix manuel
const LEGACY_KEY = "bt_lang";    // ancien key (pollué en "fr" pour tout le monde par l'ancien sync profil)
const SUPPORTED = ["fr", "en"];

// Langue de l'appareil → "fr" ou "en". Tout ce qui n'est ni anglais ni
// français retombe sur le français (public principal francophone).
export function detectDeviceLang() {
  if (typeof navigator === "undefined") return "fr";
  const list = navigator.languages && navigator.languages.length
    ? navigator.languages
    : [navigator.language];
  for (const raw of list) {
    const code = String(raw || "").toLowerCase();
    if (code.startsWith("en")) return "en";
    if (code.startsWith("fr")) return "fr";
  }
  return "fr";
}

// Préférence de langue enregistrée localement, sinon "auto" (= suivre l'appareil).
function readPref() {
  try {
    const p = localStorage.getItem(PREF_KEY);
    if (p === "fr" || p === "en") return p;
    // Migration douce : un ancien bt_lang === "en" est un choix explicite FIABLE
    // (le défaut historique était "fr", donc "en" ne pouvait venir que d'un choix
    // manuel). On le promeut en préférence. Un ancien "fr" est ambigu (c'était le
    // défaut de tout le monde) → ignoré : l'utilisateur suit désormais son appareil.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy === "en") {
      localStorage.setItem(PREF_KEY, "en");
      return "en";
    }
  } catch {}
  return "auto";
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState("fr");          // langue effective (fr/en)
  const [langPref, setLangPrefState] = useState("auto"); // préférence (auto/fr/en)

  // Résolu au montage (client) : navigator n'existe pas au rendu serveur, on
  // part donc de "fr" puis on corrige ici — même schéma que l'ancien restore.
  useEffect(() => {
    const pref = readPref();
    setLangPrefState(pref);
    setLangState(pref === "auto" ? detectDeviceLang() : pref);
  }, []);

  const setLangPref = useCallback((pref) => {
    const p = SUPPORTED.includes(pref) ? pref : "auto";
    setLangPrefState(p);
    try {
      if (p === "auto") localStorage.removeItem(PREF_KEY);
      else localStorage.setItem(PREF_KEY, p);
    } catch {}
    setLangState(p === "auto" ? detectDeviceLang() : p);
  }, []);

  // Compat : setLang("fr"|"en") = choix manuel (ancienne API).
  const setLang = useCallback((l) => {
    if (l === "fr" || l === "en") setLangPref(l);
  }, [setLangPref]);

  const t = useCallback((key) => translate(lang, key), [lang]);

  return (
    <I18nContext.Provider value={{ lang, langPref, setLangPref, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext);
