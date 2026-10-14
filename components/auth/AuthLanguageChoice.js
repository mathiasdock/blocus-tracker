import { useI18n } from "../../contexts/I18nContext";

// Choisir sa langue depuis la connexion ou l'inscription. C'est un choix
// explicite, enregistré comme celui du Profil (bt_lang_pref) : l'app le
// suivra. Chaque langue est écrite dans sa propre langue.
const CHOICES = [
  ["fr", "auth.languageFr"],
  ["en", "auth.languageEn"],
];

export default function AuthLanguageChoice() {
  const { t, lang, setLangPref } = useI18n();
  return (
    <div className="bt-auth-language" role="group" aria-label={t("auth.languageLabel")}>
      {CHOICES.map(([code, key]) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-pressed={lang === code}
          onClick={() => setLangPref(code)}
        >
          {t(key)}
        </button>
      ))}
    </div>
  );
}
