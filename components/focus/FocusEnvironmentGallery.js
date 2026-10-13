import Glyph from "../Glyph";
import { useI18n } from "../../contexts/I18nContext";
import { FOCUS_ENVIRONMENTS, environmentState, nextFocusUnlock } from "../../lib/focusEnvironments.mjs";
import styles from "./FocusEnvironments.module.css";

export default function FocusEnvironmentGallery({ preferences, inFocus = false, onSelected }) {
  const { t } = useI18n();
  const { environmentId, highestLevel, loading, saving, error, equip, refresh, retry } = preferences;
  const next = nextFocusUnlock(highestLevel);
  const levelLabel = level => t("focusEnv.level").replace("{n}", level);

  async function select(id) {
    if (id === environmentId) { onSelected?.(); return; }
    if (await equip(id)) onSelected?.();
  }

  return <div className={`${styles.gallery} ${inFocus ? styles.inFocus : ""}`}>
    <div className={styles.options} aria-busy={loading || saving}>
      {FOCUS_ENVIRONMENTS.filter(environment => environment.available).map(environment => {
        const state = environmentState(environment, highestLevel);
        const selected = environmentId === environment.id;
        return <button key={environment.id} type="button" className={styles.option}
          data-selected={selected || undefined} aria-pressed={selected}
          disabled={loading || saving || state !== "unlocked"}
          onClick={() => select(environment.id)}>
          <span className={styles.preview} aria-hidden="true" style={{ background: environment.preview }} />
          <span className={styles.optionName}>{t(environment.nameKey)}</span>
          <span className={styles.optionMeta}>
            <span>{levelLabel(environment.requiredLevel)}</span>
            <span className={styles.state}>
              <Glyph size={13}>{state === "locked"
                ? <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>
                : selected ? <path d="m5 12 4 4L19 6"/> : <path d="m9 5 7 7-7 7"/>}</Glyph>
              {t(state === "locked" ? "focusEnv.locked" : selected ? "focusEnv.equipped" : "focusEnv.available")}
            </span>
          </span>
        </button>;
      })}
    </div>
    {loading && <p className={styles.feedback} role="status">{t("common.loading")}</p>}
    {saving && <p className={styles.feedback} role="status">{t("common.saving")}</p>}
    {error && <p className={styles.feedback} role="alert">{t("focusEnv.saveError")} <button type="button" onClick={() => (retry || refresh)()}>{t("focusEnv.retry")}</button></p>}
    {!loading && next && <p className={styles.next}>{t("focusEnv.next").replace("{name}", t(next.nameKey)).replace("{n}", next.requiredLevel)}</p>}
    <ul className={styles.reserved}>
      {FOCUS_ENVIRONMENTS.filter(environment => !environment.available).map(environment => <li key={environment.id}>
        <span>{t(environment.nameKey)} <span className={styles.reservedLevel}>· {levelLabel(environment.requiredLevel)}</span></span>
        <span>{t("focusEnv.comingSoon")}</span>
      </li>)}
    </ul>
  </div>;
}
