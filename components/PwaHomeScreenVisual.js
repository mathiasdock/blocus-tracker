import Glyph from "./Glyph";
import { useI18n } from "../contexts/I18nContext";

// One recognizable Safari menu row, not a simulated browser screenshot. The
// label remains the exact platform term in both supported languages.
export default function PwaHomeScreenVisual() {
  const { t } = useI18n();

  return (
    <span
      className="flex min-w-0 select-none items-center gap-2.5 rounded-xl px-3 py-2.5"
      style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-1)" }}
      role="img"
      aria-label={t("pwa.visualAlt")}
    >
      <span className="flex shrink-0" aria-hidden="true">
        <Glyph size={19}>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M12 8v8M8 12h8" />
        </Glyph>
      </span>
      <span className="min-w-0 text-[13px] font-semibold leading-tight">
        {t("pwa.visualRow")}
      </span>
    </span>
  );
}
