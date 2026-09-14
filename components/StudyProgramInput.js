import { useI18n } from "../contexts/I18nContext";

// Collapsing this optional precision never clears an existing program.
export default function StudyProgramInput({ value, onChange, disabled, id = "study-program", maxLength = 180 }) {
  const { lang } = useI18n();
  const fr = lang === "fr";
  return <details className="rounded-xl border p-3" style={{ borderColor: "var(--bt-border)" }}>
    <summary className="cursor-pointer text-sm font-medium py-2 min-h-[44px]" style={{ color: "var(--bt-text-2)" }}>
      {value?.trim()
        ? (fr ? "Spécialisation / diplôme précis · renseigné (facultatif)" : "Specialization / specific degree · saved (optional)")
        : (fr ? "Ajouter une spécialisation / un diplôme précis" : "Add a specialization / specific degree")}
    </summary>
    <p className="text-xs leading-relaxed my-2" style={{ color: "var(--bt-text-2)" }}>
      {fr ? "Le domaine suffit. Ajoute ce détail uniquement s’il est plus précis, par exemple « Finance internationale » ou « Droit fiscal »." : "Your field is enough. Only add a more specific detail, such as “International Finance” or “Tax Law”."}
    </p>
    <label className="label" htmlFor={id}>{fr ? "Spécialisation / diplôme (facultatif)" : "Specialization / degree (optional)"}</label>
    <input id={id} className="input" maxLength={maxLength} autoComplete="organization-title" value={value || ""} onChange={event => onChange(event.target.value)} disabled={disabled}/>
  </details>;
}
