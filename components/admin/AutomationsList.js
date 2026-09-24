// Notifications automatiques — onglet de Communications.
//
// En tête, le rappel du soir tel qu'il tourne vraiment : dernier passage et
// ses chiffres (évalués, éligibles, envoyés, erreurs, exclusions), prochain
// passage, plafond de relances réglable, et « Voir qui recevrait ce soir » —
// le vrai calcul, sans rien écrire ni envoyer.
// Ensuite, chaque notification automatique dit D'ABORD quand elle part et
// combien elle a envoyé. Couper se fait sans déplier ; le texte (FR et EN) se
// modifie ensuite. Le déclencheur reste fixé par le code
// (lib/pushAutomations.mjs). Lecture et écriture passent par
// /api/admin/push-automations (service role, journal d'audit).

import { useId, useState } from "react";
import {
  CountRow, EmptyLine, ErrorLine, Panel, SkeletonRows, StateMark, Switch, adminStyles as s, errorText, useAdminLoad,
} from "./AdminUi";
import { AT_SEND_REASONS, PRE_SEND_REASONS, exclusionLabel } from "./PushComposer";
import { kindLabel } from "./NotificationHistory";
import { useI18n } from "../../contexts/I18nContext";
import { adminFetch } from "../../lib/adminApi";
import { formatAgo, formatCount, formatDate } from "../../lib/adminFormat.mjs";
import { isSafeInternalHref } from "../../lib/safeHref.mjs";

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

function AutomationRow({ item, stats }) {
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
          <p className={s.rowMeta}>
            {t(`adm.notif.auto.pref.${item.category || "reminder"}`)}
            {" · "}
            {stats
              ? t("adm.notif.auto.stats")
                .replace("{week}", formatCount(stats.sent7d || 0, lang))
                .replace("{month}", formatCount(stats.sent30d || 0, lang))
              : t("adm.notif.auto.noStats")}
            {stats?.lastSentAt ? ` · ${t("adm.notif.auto.lastSent").replace("{ago}", formatAgo(stats.lastSentAt, new Date(), lang))}` : ""}
            {stats?.failed7d ? <span style={{ color: "var(--bt-danger)" }}>{` · ${t("adm.notif.auto.failed").replace("{n}", formatCount(stats.failed7d, lang))}`}</span> : null}
          </p>
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

const KIND_ORDER = ["exam_tomorrow", "streak_at_risk", "nudge_planning", "nudge_study", "comeback_day3"];

// Dans l'ordre du calcul : évalués → rappels prévus → exclus avant l'envoi →
// éligibles → écartés au moment de l'envoi → envoyés. Chaque soustraction
// tombe juste. Un aperçu (dryRun) s'arrête aux éligibles : rien n'est envoyé.
function RunNumbers({ details, preview = false }) {
  const { t, lang } = useI18n();
  const excluded = details?.excluded || {};
  const before = PRE_SEND_REASONS.filter((reason) => excluded[reason] > 0);
  const atSend = AT_SEND_REASONS.filter((reason) => excluded[reason] > 0);
  return (
    <dl className={s.counts}>
      <CountRow label={t("adm.notif.auto.evaluated")} value={formatCount(details?.evaluated ?? 0, lang)}
        note={t("adm.notif.auto.evaluatedNote")} />
      <CountRow label={t("adm.notif.auto.planned")} value={formatCount(details?.planned ?? 0, lang)}
        note={t("adm.notif.auto.plannedNote").replace("{quiet}", formatCount(details?.skipped?.quiet_hours ?? 0, lang))} />
      {before.map((reason) => (
        <CountRow key={reason} muted label={`− ${exclusionLabel(t, reason, "reminder")}`} value={formatCount(excluded[reason], lang)} />
      ))}
      <CountRow strong label={t("adm.notif.auto.eligible")} value={formatCount(details?.eligible ?? 0, lang)} />
      {!preview && atSend.map((reason) => (
        <CountRow key={reason} muted label={`− ${exclusionLabel(t, reason, "reminder")}`} value={formatCount(excluded[reason], lang)} />
      ))}
      {!preview && <CountRow label={t("adm.notif.auto.sent")} value={formatCount(details?.sent ?? 0, lang)} />}
      {!preview && (details?.failed ?? 0) > 0 && <CountRow label={t("adm.notif.auto.errors")} value={formatCount(details.failed, lang)} />}
    </dl>
  );
}

function EveningRun({ status, onSaved }) {
  const { t, lang } = useI18n();
  const ids = useId();
  const [cap, setCap] = useState(status.cap);
  const [savingCap, setSavingCap] = useState(false);
  const [capNotice, setCapNotice] = useState(null);
  const [preview, setPreview] = useState({ data: null, loading: false, error: null });
  const run = status.lastRun;
  const details = run?.details || null;
  const tone = !run ? "quiet" : run.status === "ok" ? "ok" : run.status === "running" ? "warn" : "danger";

  async function saveCap() {
    setSavingCap(true);
    setCapNotice(null);
    const response = await adminFetch("/api/admin/push-automations", { method: "PUT", body: { settings: { remindersWeeklyCap: Number(cap) } } });
    setSavingCap(false);
    setCapNotice(response.error ? { error: true, text: errorText(t, response.error) } : { text: t("adm.auto.saved") });
    if (!response.error) onSaved?.();
  }

  async function dryRun() {
    setPreview({ data: null, loading: true, error: null });
    const response = await adminFetch("/api/admin/push-automations", { method: "POST", body: { action: "dry-run" } });
    setPreview({ data: response.data?.preview || null, loading: false, error: response.error });
  }

  return (
    <Panel pad>
      <div className={s.fieldHead}>
        <h3 className={s.h3}>{t("adm.notif.auto.evening")}</h3>
        <StateMark tone={tone}>
          {!run ? t("adm.notif.auto.neverRan")
            : t(`adm.notif.auto.runStatus.${run.status}`)}
        </StateMark>
      </div>
      <p className={s.rowMeta}>
        {run
          ? t("adm.notif.auto.lastRun").replace("{date}", formatDate(run.started_at, lang, "dateTime"))
          : t("adm.notif.auto.lastRunNone")}
        {" · "}
        {t("adm.notif.auto.nextRun").replace("{date}", formatDate(status.nextRunAt, lang, "dateTime"))}
      </p>
      <p className={s.hint} style={{ marginTop: 2 }}>{t("adm.notif.auto.rules")}</p>

      {details && <div className="mt-3"><RunNumbers details={details} /></div>}

      <div className="mt-4" style={{ borderTop: "1px solid var(--bt-border)", paddingTop: 14 }}>
        <div className={s.inlineField}>
          <label htmlFor={`${ids}-cap`} className={s.fieldLabel}>{t("adm.notif.auto.capLabel")}</label>
          <select id={`${ids}-cap`} className={`input ${s.select}`} value={cap} onChange={(event) => setCap(Number(event.target.value))}>
            {Array.from({ length: status.capRange[1] - status.capRange[0] + 1 }, (_, i) => status.capRange[0] + i).map((value) => (
              <option key={value} value={value}>{t(`adm.notif.auto.capOption.${value === 1 ? "one" : "other"}`).replace("{n}", String(value))}</option>
            ))}
          </select>
          {cap !== status.cap && (
            <button type="button" className="btn-primary min-h-[44px]" disabled={savingCap} onClick={saveCap}>
              {savingCap ? t("adm.common.working") : t("adm.auto.save")}
            </button>
          )}
        </div>
        <p className={s.hint}>{t("adm.notif.auto.capHint")}</p>
        {capNotice && <p className="text-sm mt-1" role={capNotice.error ? "alert" : "status"} style={{ color: capNotice.error ? "var(--bt-danger)" : "var(--bt-accent-text)" }}>{capNotice.text}</p>}
      </div>

      <div className="mt-4" style={{ borderTop: "1px solid var(--bt-border)", paddingTop: 14 }}>
        <button type="button" className="btn-ghost min-h-[44px]" disabled={preview.loading} onClick={dryRun} aria-busy={preview.loading}>
          {preview.loading ? t("adm.common.working") : t("adm.notif.auto.dryRun")}
        </button>
        <p className={s.hint}>{t("adm.notif.auto.dryRunHint")}</p>
        {preview.error && <p className="text-sm mt-2" role="alert" style={{ color: "var(--bt-danger)" }}>{errorText(t, preview.error)}</p>}
        {preview.data && (
          <div className={s.details} role="status">
            <RunNumbers details={preview.data} preview />
            {KIND_ORDER.filter((kind) => preview.data.members?.[kind]?.total).map((kind) => {
              const entry = preview.data.members[kind];
              const more = entry.total - entry.pseudos.length;
              return (
                <div key={kind} className="mt-3">
                  <p className={s.rowTitle}>{`${kindLabel(t, kind)} · ${formatCount(entry.total, lang)}`}</p>
                  <p className={s.nameList}>
                    {entry.pseudos.map((pseudo) => `@${pseudo}`).join(", ")}
                    {more > 0 ? ` ${t(`adm.notif.auto.andMore.${more === 1 ? "one" : "other"}`).replace("{n}", formatCount(more, lang))}` : ""}
                  </p>
                </div>
              );
            })}
            {!KIND_ORDER.some((kind) => preview.data.members?.[kind]?.total) && (
              <p className="mt-2">{t("adm.notif.auto.nobodyTonight")}</p>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

export default function AutomationsList() {
  const { t } = useI18n();
  const load = useAdminLoad(() => adminFetch("/api/admin/push-automations"), []);
  const items = load.data?.automations;
  const status = load.data?.status;
  return (
    <div className="space-y-4">
      <p className={s.note}>{t("adm.auto.lead")}</p>
      {status && <EveningRun key={status.cap} status={status} onSaved={load.reload} />}
      <div className={s.panel}>
        {load.error ? <ErrorLine code={load.error} onRetry={load.reload} />
          : !items ? <SkeletonRows rows={4} />
          : items.length === 0 ? <EmptyLine>{t("adm.auto.empty")}</EmptyLine>
          : <ul className={s.rows}>{items.map((item) => <AutomationRow key={item.key} item={item} stats={status?.stats?.[item.key]} />)}</ul>}
      </div>
    </div>
  );
}
