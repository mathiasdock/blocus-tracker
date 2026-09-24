// Notifications automatiques — onglet de Communications.
//
// Chaque ligne dit D'ABORD quand la notification part : c'est ce qui manque
// quand on découvre qu'une app envoie des choses toute seule. Couper se fait
// sans déplier ; le texte (FR et EN) se modifie ensuite. Le déclencheur reste
// fixé par le code (lib/pushAutomations.js). Lecture et écriture passent par
// /api/admin/push-automations (service role, journal d'audit).

import { useId, useState } from "react";
import { EmptyLine, ErrorLine, SkeletonRows, StateMark, Switch, adminStyles as s, errorText, useAdminLoad } from "./AdminUi";
import { useI18n } from "../../contexts/I18nContext";
import { adminFetch } from "../../lib/adminApi";
import { isSafeInternalHref } from "../../lib/security";

const MAX_TITLE = 60;
const MAX_BODY = 160;

function formFrom(current) {
  return {
    enabled: current.enabled,
    titleFr: current.title.fr, bodyFr: current.body.fr,
    titleEn: current.title.en, bodyEn: current.body.en,
    url: current.url || "",
  };
}

function AutomationRow({ item }) {
  const { t, lang } = useI18n();
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => formFrom(item.current));
  const [saved, setSaved] = useState(() => formFrom(item.current));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const pick = (value) => (lang === "en" ? value.en : value.fr) || value.fr;
  const modified = saved.titleFr !== item.defaults.title.fr || saved.bodyFr !== item.defaults.body.fr;

  async function persist(values) {
    if (!isSafeInternalHref(values.url)) { setError("invalid_link"); return false; }
    setBusy(true); setError(null); setNotice(null);
    const response = await adminFetch("/api/admin/push-automations", { method: "PUT", body: { key: item.key, ...values } });
    setBusy(false);
    if (response.error) { setError(response.error); return false; }
    setSaved(values);
    setNotice(t("adm.auto.saved"));
    return true;
  }

  // Couper / rallumer n'enregistre que l'interrupteur : un texte en cours de
  // modification reste dans le formulaire, non envoyé.
  async function toggle(enabled) {
    if (await persist({ ...saved, enabled })) setForm((previous) => ({ ...previous, enabled }));
  }

  async function save(values = form) {
    if (await persist(values)) setForm(values);
  }

  const field = (key, label, max, multiline = false) => (
    <div>
      <div className={s.fieldHead}>
        <label htmlFor={`${ids}-${key}`} className={s.fieldLabel}>{label}</label>
        <span className={s.counter}>{`${form[key].length}/${max}`}</span>
      </div>
      {multiline
        ? <textarea id={`${ids}-${key}`} className="input" style={{ fontSize: 16 }} rows={2} maxLength={max} value={form[key]}
            onChange={(event) => setForm((previous) => ({ ...previous, [key]: event.target.value }))} />
        : <input id={`${ids}-${key}`} className="input" style={{ fontSize: 16 }} maxLength={max} value={form[key]}
            onChange={(event) => setForm((previous) => ({ ...previous, [key]: event.target.value }))} />}
    </div>
  );

  return (
    <li>
      <div className={s.row} style={{ alignItems: "flex-start", paddingTop: 14, paddingBottom: 14 }}>
        <div className={s.rowMain}>
          <p className={s.rowTitle}>{pick(item.label)}</p>
          <p className={s.rowMeta}>{pick(item.trigger)}</p>
          <p className={s.rowMeta} style={{ marginTop: 6, color: "var(--bt-text-1)" }}>
            <strong>{lang === "en" ? saved.titleEn : saved.titleFr}</strong>{" — "}{lang === "en" ? saved.bodyEn : saved.bodyFr}
          </p>
          <p className={s.rowMeta} style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
            {!saved.enabled && <StateMark tone="quiet">{t("adm.auto.off")}</StateMark>}
            {modified && <StateMark tone="neutral">{t("adm.auto.modified")}</StateMark>}
            <button type="button" className={s.linkBtn} style={{ minHeight: 32 }} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
              {open ? t("adm.auto.close") : t("adm.auto.edit")}
            </button>
          </p>
        </div>
        <Switch checked={form.enabled} disabled={busy}
          label={t(form.enabled ? "adm.auto.turnOff" : "adm.auto.turnOn").replace("{name}", pick(item.label))}
          onChange={toggle} />
      </div>
      {(error || notice) && !open && (
        <p className="px-4 pb-3 text-sm" role={error ? "alert" : "status"} style={{ color: error ? "var(--bt-danger)" : "var(--bt-accent-text)" }}>
          {error ? errorText(t, error).replace("{token}", item.vars.join(", ")) : notice}
        </p>
      )}
      {open && (
        <div className="px-4 pb-4 space-y-3" style={{ borderTop: "1px solid var(--bt-hairline)", paddingTop: 12 }}>
          {item.vars.length > 0 && <p className={s.hint}>{t("adm.auto.vars").replace("{vars}", item.vars.join(", "))}</p>}
          <p className={s.h3}>{t("adm.auto.french")}</p>
          {field("titleFr", t("adm.push.title"), MAX_TITLE)}
          {field("bodyFr", t("adm.push.body"), MAX_BODY, true)}
          <p className={s.h3} style={{ paddingTop: 4 }}>{t("adm.auto.english")}</p>
          {field("titleEn", t("adm.push.title"), MAX_TITLE)}
          {field("bodyEn", t("adm.push.body"), MAX_BODY, true)}
          <div>
            <div className={s.fieldHead}><label htmlFor={`${ids}-url`} className={s.fieldLabel}>{t("adm.auto.page")}</label></div>
            <input id={`${ids}-url`} className="input" style={{ fontSize: 16 }} value={form.url} placeholder={item.defaults.url}
              onChange={(event) => setForm((previous) => ({ ...previous, url: event.target.value }))} />
          </div>
          {error && <p className="text-sm" role="alert" style={{ color: "var(--bt-danger)" }}>{errorText(t, error).replace("{token}", item.vars.join(", "))}</p>}
          {notice && <p className="text-sm" role="status" style={{ color: "var(--bt-accent-text)" }}>{notice}</p>}
          <div className={s.actions}>
            <button type="button" className="btn-primary min-h-[44px]" disabled={busy} onClick={() => save()}>
              {busy ? t("adm.common.working") : t("adm.auto.save")}
            </button>
            <button type="button" className="btn-ghost min-h-[44px]" disabled={busy}
              onClick={() => {
                const original = {
                  ...form,
                  titleFr: item.defaults.title.fr, bodyFr: item.defaults.body.fr,
                  titleEn: item.defaults.title.en, bodyEn: item.defaults.body.en, url: item.defaults.url,
                };
                setForm(original);
                save(original);
              }}>
              {t("adm.auto.restore")}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function AutomationsList() {
  const { t } = useI18n();
  const load = useAdminLoad(() => adminFetch("/api/admin/push-automations"), []);
  const items = load.data?.automations;
  return (
    <div className="space-y-3">
      <p className={s.note}>{t("adm.auto.lead")}</p>
      <div className={s.panel}>
        {load.error ? <ErrorLine code={load.error} onRetry={load.reload} />
          : !items ? <SkeletonRows rows={4} />
          : items.length === 0 ? <EmptyLine>{t("adm.auto.empty")}</EmptyLine>
          : <ul className={s.rows}>{items.map((item) => <AutomationRow key={item.key} item={item} />)}</ul>}
      </div>
    </div>
  );
}
