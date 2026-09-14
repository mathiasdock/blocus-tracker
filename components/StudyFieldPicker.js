import { useI18n } from "../contexts/I18nContext";
import { STUDY_FIELDS } from "../lib/studySpaces.mjs";

export default function StudyFieldPicker({ value, onChange, disabled, id = "broad-study-field" }) {
  const { lang } = useI18n();
  return <div>
    <label className="label" htmlFor={id}>{lang === "fr" ? "Domaine d’étude" : "Field of study"}</label>
    <select id={id} className="input" value={value || ""} onChange={event => onChange(event.target.value)} disabled={disabled}>
      <option value="">{lang === "fr" ? "Choisir un domaine (facultatif)" : "Choose a field (optional)"}</option>
      {STUDY_FIELDS.map(field => <option key={field.id} value={field.id}>{field[lang === "fr" ? "fr" : "en"]}</option>)}
    </select>
  </div>;
}
