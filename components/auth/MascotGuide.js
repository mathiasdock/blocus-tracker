import Mascot from "../Mascot";
import { useI18n } from "../../contexts/I18nContext";

// The mascot as the guide of sign-up and onboarding: one short line per step,
// and a reaction when something real happens (a name given, a university
// chosen, a course added). It speaks through a bubble drawn as one shape —
// body and tail share a single silhouette and a single soft shadow — and the
// line slides in when it changes. The line is plain text in the page: nothing
// the student needs lives only in the bubble.
//
// Size follows the layout (CSS --guide-size), so the same element sits above
// the form on a phone and stands on the student's space on a wide screen.

export default function MascotGuide({ message, mood = "neutral", reaction, variant = "default" }) {
  const { t } = useI18n();
  if (!message) return null;
  return (
    <div className={`bt-guide is-${variant}`}>
      <span className="bt-guide-art">
        <Mascot mood={mood} size={104} reactionKey={reaction} ariaLabel={t("mascot.label")} />
      </span>
      <div className="bt-guide-bubble">
        <svg className="bt-guide-tail" width="14" height="18" viewBox="0 0 14 18" aria-hidden="true" focusable="false">
          <path d="M14 1.5C12.6 7.4 8 10.6.5 11.4c6 .9 10.5 3 13.5 5.6Z" />
        </svg>
        {/* Keyed on the reaction, not the words: a name corrected after the
            greeting updates in place instead of replaying the entrance. */}
        <p className="bt-guide-text" key={reaction || message}>{message}</p>
      </div>
    </div>
  );
}
