import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import { translate } from "../lib/i18n";
import { contentLangForPath } from "../lib/seo";
import { useAuth } from "./AuthContext";

const I18nContext = createContext({
  lang: "fr",
  appLang: "fr",
  langPref: "auto",
  setLangPref: () => {},
  setLang: () => {},
  t: (k) => k,
});

const PREF_KEY = "bt_lang_pref"; // "fr" | "en" — présent UNIQUEMENT si choix manuel
const LEGACY_KEY = "bt_lang";    // ancien key (pollué en "fr" pour tout le monde par l'ancien sync profil)
const SUPPORTED = ["fr", "en"];

// Langue de l'appareil → "fr" ou "en". Seule la langue principale compte :
// un appareil allemand qui accepte aussi le français reste un appareil
// allemand. Français → français ; toute autre langue → anglais.
export function detectDeviceLang() {
  if (typeof navigator === "undefined") return "en";
  const primary = (navigator.languages && navigator.languages[0]) || navigator.language;
  const code = String(primary || "").toLowerCase();
  return code === "fr" || code.startsWith("fr-") ? "fr" : "en";
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
  const { pathname } = useRouter();
  const { user } = useAuth();
  const [deviceLang, setDeviceLang] = useState(null);    // langue de l'appareil, connue au montage
  const [langPref, setLangPrefState] = useState("auto"); // préférence (auto/fr/en)

  // Résolu au montage (client) : navigator n'existe pas au rendu serveur, on
  // part donc de "fr" puis on corrige ici — même schéma que l'ancien restore.
  useEffect(() => {
    setLangPrefState(readPref());
    setDeviceLang(detectDeviceLang());
  }, []);

  const setLangPref = useCallback((pref) => {
    const p = SUPPORTED.includes(pref) ? pref : "auto";
    setLangPrefState(p);
    try {
      if (p === "auto") localStorage.removeItem(PREF_KEY);
      else localStorage.setItem(PREF_KEY, p);
    } catch {}
    if (p === "auto") setDeviceLang(detectDeviceLang());
  }, []);

  // Compat : setLang("fr"|"en") = choix manuel (ancienne API).
  const setLang = useCallback((l) => {
    if (l === "fr" || l === "en") setLangPref(l);
  }, [setLangPref]);

  // Langue de l'utilisateur : son choix manuel, sinon celle de l'appareil.
  // C'est celle de l'app, et celle de ses notifications push.
  const appLang = langPref === "auto" ? (deviceLang || "fr") : langPref;

  // Langue AFFICHÉE. Une page publique indexable parle la langue de son
  // adresse (lib/seo.js) à tout visiteur non connecté — donc aussi à Google,
  // qui exécute les pages avec un navigateur américain. Quand l'appareil
  // pilotait aussi ces pages, Google indexait un titre français sur un texte
  // anglais. Un choix manuel reste respecté partout ; un compte connecté garde
  // la langue de l'app, comme avant, y compris sur ces pages.
  const routeLang = contentLangForPath(pathname);
  const lang = routeLang && langPref === "auto" && !user ? routeLang : appLang;

  // _document.js sert toujours lang="fr" : on aligne la page sur la langue affichée.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback((key) => translate(lang, key), [lang]);

  // Le fournisseur se redessine désormais à chaque changement d'auth : sans
  // mémo, tous les textes de l'app se redessineraient avec lui.
  const value = useMemo(
    () => ({ lang, appLang, langPref, setLangPref, setLang, t }),
    [lang, appLang, langPref, setLangPref, setLang, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
