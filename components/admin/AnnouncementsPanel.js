// Annonces dans l'app — onglet de Communications.
//
// Une annonce s'affiche dans la cloche des notifications quand le membre
// ouvre l'app ; elle ne fait pas sonner le téléphone, sauf si l'admin coche
// « Envoyer aussi une notification push » — qui passe alors par le point
// d'envoi unique (préférence « Annonces » respectée, suspendus exclus).
// Français obligatoire, anglais facultatif (le français sert de repli) ; début
// et fin facultatifs ; tous les membres ou une école. La base applique les
// dates et l'école (v62) : une annonce sans dates ni cible vit exactement
// comme avant, et aucune annonce existante n'est modifiée ici sans un geste.
//
// Écriture directe dans app_announcements : la RLS la réserve aux admins et
// chaque création, (dés)activation ou suppression est tracée par la base
// (journal d'audit, v55).

import { useId, useMemo, useState } from "react";
import {
  ConfirmDialog, EmptyLine, ErrorLine, Panel, Segmented, SkeletonRows, StateMark, adminStyles as s, errorText, useAdminLoad,
} from "./AdminUi";
import { PushPreview } from "./PushComposer";
import { useAuth } from "../../contexts/AuthContext";
import { useI18n } from "../../contexts/I18nContext";
import { adminFetch, adminRpc } from "../../lib/adminApi";
import { adminInputToIso, formatDate } from "../../lib/adminFormat.mjs";
import {
  ANNOUNCEMENT_MESSAGE_MAX, ANNOUNCEMENT_TITLE_MAX, announcementPushContent, announcementWindowState, validateAnnouncement,
} from "../../lib/notificationRules.mjs";
import { clientRateLimit } from "../../lib/security";
import { supabase } from "../../lib/supabaseClient";

const TYPES = ["new", "info", "important"];
const TYPE_KEY = { new: "ann.typeNew", info: "ann.typeInfo", important: "ann.typeImportant" };
const EMPTY = {
  titleFr: "", messageFr: "", titleEn: "", messageEn: "", type: "new", href: "",
  audience: "all", university: "", startsAt: "", endsAt: "", push: false,
};
const STATE_TONE = { live: "ok", scheduled: "neutral", expired: "quiet", inactive: "quiet" };

async function listAnnouncements() {
  const [rowsRes, pushesRes] = await Promise.all([
    supabase.from("app_announcements")
      .select("id, title, message, title_en, message_en, type, href, is_active, created_at, starts_at, ends_at, audience, audience_university")
      .order("created_at", { ascending: false })
      .then((result) => result),
    // Quelles annonces ont déjà été poussées : le registre le dit.
    adminRpc("admin_notification_sends", { p_source: "admin", p_limit: 100, p_offset: 0 }),
  ]);
  if (rowsRes.error) return { data: null, error: "failed" };
  const pushed = new Map();
  for (const send of pushesRes.data?.rows || []) {
    if (send.announcement_id && !pushed.has(send.announcement_id)) pushed.set(send.announcement_id, send);
  }
  return { data: { rows: rowsRes.data || [], pushed }, error: null };
}

/** La rangée telle que la cloche l'affichera. */
function BellPreview({ title, message, type, lang }) {
  const { t } = useI18n();
  return (
    <div className={s.preview} lang={lang}>
      <span className="min-w-0">
        <span className={s.rowMeta} style={{ display: "block", fontSize: 12 }}>{t(TYPE_KEY[type] || "ann.typeInfo")}</span>
        <span className={s.rowTitle} style={{ display: "block" }}>{title || t("adm.ann.previewTitle")}</span>
        <span className={s.rowMeta} style={{ display: "block" }}>{message || t("adm.ann.previewBody")}</span>
      </span>
    </div>
  );
}

export default function AnnouncementsPanel({ universities = [] }) {
  const { t, lang } = useI18n();
  const { profile } = useAuth();
  const ids = useId();
  const list = useAdminLoad(listAnnouncements, []);
  const [form, setForm] = useState(EMPTY);
  const [previewLang, setPreviewLang] = useState("fr");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [rowError, setRowError] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [pushing, setPushing] = useState(null);

  const set = (key) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };
  // Dates saisies en heure de Bruxelles, comme tout ce que l'admin affiche.
  const validated = useMemo(() => validateAnnouncement({
    ...form,
    startsAt: form.startsAt ? adminInputToIso(form.startsAt) || "invalid" : "",
    endsAt: form.endsAt ? adminInputToIso(form.endsAt) || "invalid" : "",
  }), [form]);
  const pushContent = validated.ok ? announcementPushContent(validated.row) : null;
  const english = previewLang === "en";

  function submit(event) {
    event.preventDefault();
    setNotice(null);
    if (!validated.ok) { setError(validated.error); return; }
    setError(null);
    // Une notification push ne se rattrape pas : confirmation d'abord.
    if (form.push) { setConfirming(true); return; }
    publish();
  }

  async function publish() {
    if (!validated.ok) return;
    const limited = clientRateLimit(`admin:announcement:${profile?.id}`, 12, 60_000);
    if (!limited.ok) { setError("rate_limited"); return; }
    setBusy(true);
    setError(null);
    const { data, error: insertError } = await supabase.from("app_announcements")
      .insert({ ...validated.row, is_active: true, created_by: profile?.id })
      .select("id").single()
      .then((result) => result);
    if (insertError || !data?.id) { setBusy(false); setError("failed"); setConfirming(false); return; }

    let pushOutcome = null;
    if (form.push) {
      const response = await adminFetch("/api/admin/push", { method: "POST", body: { action: "announcement", announcementId: data.id } });
      pushOutcome = response.error ? { error: response.error } : response.data;
    }
    setBusy(false);
    setConfirming(false);
    setForm(EMPTY);
    setNotice(pushOutcome?.error
      ? { tone: "warn", text: `${t("adm.ann.publishedPushFailed")} ${errorText(t, pushOutcome.error)}` }
      : { tone: "ok", text: form.push ? t("adm.ann.publishedWithPush") : t("adm.ann.published") });
    list.reload();
  }

  async function toggle(row) {
    setRowError(null);
    const { error: updateError } = await supabase.from("app_announcements")
      .update({ is_active: !row.is_active }).eq("id", row.id).then((result) => result);
    if (updateError) { setRowError(errorText(t, "failed")); return; }
    list.setData((data) => ({ ...data, rows: data.rows.map((item) => (item.id === row.id ? { ...item, is_active: !item.is_active } : item)) }));
  }

  async function remove() {
    const row = removing;
    setBusy(true);
    const { error: deleteError } = await supabase.from("app_announcements").delete().eq("id", row.id).then((result) => result);
    setBusy(false);
    if (deleteError) { setRowError(errorText(t, "failed")); setRemoving(null); return; }
    list.setData((data) => ({ ...data, rows: data.rows.filter((item) => item.id !== row.id) }));
    setRemoving(null);
  }

  async function pushExisting() {
    const row = pushing;
    setBusy(true);
    const response = await adminFetch("/api/admin/push", { method: "POST", body: { action: "announcement", announcementId: row.id } });
    setBusy(false);
    setPushing(null);
    if (response.error) { setRowError(errorText(t, response.error)); return; }
    list.reload();
  }

  const rows = list.data?.rows || [];
  const pushed = list.data?.pushed || new Map();

  return (
    <div className="space-y-4">
      <p className={s.note}>{t("adm.ann.lead")}</p>

      <div className={s.split}>
        <form onSubmit={submit} className={`${s.panel} ${s.panelPad}`} noValidate>
          <div className={s.formGrid}>
            <h3 className={s.h3}>{t("adm.ann.new")}</h3>
            <div className={s.langGrid}>
              <div className={s.formGrid}>
                <p className={s.langHead} style={{ marginBottom: -6 }}>{t("adm.notif.lang.fr")}</p>
                <div>
                  <div className={s.fieldHead}>
                    <label htmlFor={`${ids}-tfr`} className={s.fieldLabel}>{t("adm.ann.title")}</label>
                    <span className={s.counter}>{`${form.titleFr.length}/${ANNOUNCEMENT_TITLE_MAX}`}</span>
                  </div>
                  <input id={`${ids}-tfr`} className="input" style={{ fontSize: 16 }} maxLength={ANNOUNCEMENT_TITLE_MAX} lang="fr"
                    value={form.titleFr} onChange={set("titleFr")} />
                </div>
                <div>
                  <div className={s.fieldHead}>
                    <label htmlFor={`${ids}-mfr`} className={s.fieldLabel}>{t("adm.ann.message")}</label>
                    <span className={s.counter}>{`${form.messageFr.length}/${ANNOUNCEMENT_MESSAGE_MAX}`}</span>
                  </div>
                  <textarea id={`${ids}-mfr`} className="input" style={{ fontSize: 16 }} rows={3} maxLength={ANNOUNCEMENT_MESSAGE_MAX} lang="fr"
                    value={form.messageFr} onChange={set("messageFr")} />
                </div>
              </div>
              <div className={s.formGrid}>
                <p className={s.langHead} style={{ marginBottom: -6 }}>{t("adm.notif.lang.en")} <span>{t("adm.notif.lang.optional")}</span></p>
                <div>
                  <div className={s.fieldHead}>
                    <label htmlFor={`${ids}-ten`} className={s.fieldLabel}>{t("adm.ann.title")}</label>
                    <span className={s.counter}>{`${form.titleEn.length}/${ANNOUNCEMENT_TITLE_MAX}`}</span>
                  </div>
                  <input id={`${ids}-ten`} className="input" style={{ fontSize: 16 }} maxLength={ANNOUNCEMENT_TITLE_MAX} lang="en"
                    value={form.titleEn} onChange={set("titleEn")} placeholder={form.titleFr} />
                </div>
                <div>
                  <div className={s.fieldHead}>
                    <label htmlFor={`${ids}-men`} className={s.fieldLabel}>{t("adm.ann.message")}</label>
                    <span className={s.counter}>{`${form.messageEn.length}/${ANNOUNCEMENT_MESSAGE_MAX}`}</span>
                  </div>
                  <textarea id={`${ids}-men`} className="input" style={{ fontSize: 16 }} rows={3} maxLength={ANNOUNCEMENT_MESSAGE_MAX} lang="en"
                    value={form.messageEn} onChange={set("messageEn")} placeholder={form.messageFr} />
                </div>
              </div>
            </div>
            <p className={s.hint} style={{ marginTop: -6 }}>{t("adm.notif.lang.fallback")}</p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className={s.fieldHead}><label htmlFor={`${ids}-type`} className={s.fieldLabel}>{t("adm.ann.type")}</label></div>
                <select id={`${ids}-type`} className="input" style={{ fontSize: 16 }} value={form.type} onChange={set("type")}>
                  {TYPES.map((type) => <option key={type} value={type}>{t(TYPE_KEY[type])}</option>)}
                </select>
              </div>
              <div>
                <div className={s.fieldHead}><label htmlFor={`${ids}-href`} className={s.fieldLabel}>{t("adm.ann.link")}</label></div>
                <input id={`${ids}-href`} className="input" style={{ fontSize: 16 }} placeholder="/planning" value={form.href} onChange={set("href")} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className={s.fieldHead}><label htmlFor={`${ids}-aud`} className={s.fieldLabel}>{t("adm.ann.audience")}</label></div>
                <select id={`${ids}-aud`} className="input" style={{ fontSize: 16 }} value={form.audience} onChange={set("audience")}>
                  <option value="all">{t("adm.ann.audienceAll")}</option>
                  <option value="university">{t("adm.ann.audienceSchool")}</option>
                </select>
              </div>
              {form.audience === "university" && (
                <div>
                  <div className={s.fieldHead}><label htmlFor={`${ids}-uni`} className={s.fieldLabel}>{t("adm.push.pickUniversity")}</label></div>
                  <select id={`${ids}-uni`} className="input" style={{ fontSize: 16 }} value={form.university} onChange={set("university")}>
                    <option value="">{t("adm.push.pickUniversity")}</option>
                    {universities.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className={s.fieldHead}><label htmlFor={`${ids}-start`} className={s.fieldLabel}>{t("adm.ann.startsAt")}</label></div>
                <input id={`${ids}-start`} type="datetime-local" className="input" style={{ fontSize: 16 }} value={form.startsAt} onChange={set("startsAt")} />
                <p className={s.hint}>{t("adm.ann.startsAtHint")}</p>
              </div>
              <div>
                <div className={s.fieldHead}><label htmlFor={`${ids}-end`} className={s.fieldLabel}>{t("adm.ann.endsAt")}</label></div>
                <input id={`${ids}-end`} type="datetime-local" className="input" style={{ fontSize: 16 }} value={form.endsAt} onChange={set("endsAt")} />
                <p className={s.hint}>{t("adm.ann.endsAtHint")}</p>
              </div>
            </div>

            <label className={s.checkRow}>
              <input type="checkbox" checked={form.push} onChange={set("push")} />
              <span>
                <span className={s.rowTitle} style={{ display: "block" }}>{t("adm.ann.pushToggle")}</span>
                <span className={s.rowMeta} style={{ display: "block" }}>{t("adm.ann.pushToggleHint")}</span>
              </span>
            </label>

            {error && <p className="text-sm" role="alert" style={{ color: "var(--bt-danger)" }}>{errorText(t, error)}</p>}
            {notice && <p className="text-sm" role="status"><StateMark tone={notice.tone}>{notice.text}</StateMark></p>}
            <div>
              <button type="submit" className="btn-primary min-h-[44px]" disabled={busy}>
                {busy ? t("adm.common.working") : form.push ? t("adm.ann.publishAndPush") : t("adm.ann.publish")}
              </button>
            </div>
          </div>
        </form>

        <div className={s.sticky}>
          <Panel pad>
            <div className={s.fieldHead} style={{ marginBottom: 10 }}>
              <h3 className={s.h3}>{t("adm.push.preview")}</h3>
              <Segmented label={t("adm.notif.lang.previewLabel")} value={previewLang} onChange={setPreviewLang}
                options={[{ value: "fr", label: "FR" }, { value: "en", label: "EN" }]} />
            </div>
            <p className={s.rowMeta} style={{ marginBottom: 6 }}>{t("adm.ann.previewBell")}</p>
            <BellPreview type={form.type} lang={previewLang}
              title={(english && form.titleEn.trim()) || form.titleFr}
              message={(english && form.messageEn.trim()) || form.messageFr} />
            {form.push && (
              <>
                <p className={s.rowMeta} style={{ margin: "12px 0 6px" }}>{t("adm.ann.previewPush")}</p>
                <PushPreview lang={previewLang}
                  title={pushContent ? pushContent.title[english ? "en" : "fr"] : form.titleFr}
                  message={pushContent ? pushContent.body[english ? "en" : "fr"] : form.messageFr} />
              </>
            )}
          </Panel>
        </div>
      </div>

      <div>
        <h3 className={s.h3} style={{ marginBottom: 8 }}>{t("adm.ann.history")}</h3>
        {rowError && <p className="text-sm mb-2" role="alert" style={{ color: "var(--bt-danger)" }}>{rowError}</p>}
        <div className={s.panel}>
          {list.error ? <ErrorLine code={list.error} onRetry={list.reload} />
            : list.loading && !list.data ? <SkeletonRows rows={3} />
            : rows.length === 0 ? <EmptyLine>{t("adm.ann.empty")}</EmptyLine>
            : (
              <ul className={s.rows}>
                {rows.map((row) => {
                  const state = announcementWindowState(row);
                  const pushedSend = pushed.get(row.id);
                  const canPush = !pushedSend && (state === "live" || state === "scheduled");
                  return (
                    <li key={row.id} className={s.row} style={{ alignItems: "flex-start", paddingTop: 12, paddingBottom: 12 }}>
                      <div className={s.rowMain}>
                        <p className={s.rowTitle}>{(lang === "en" && row.title_en) || row.title}</p>
                        <p className={s.rowMeta}>{(lang === "en" && row.message_en) || row.message}</p>
                        <p className={s.rowMeta} style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
                          <StateMark tone={STATE_TONE[state]}>{t(`adm.ann.state.${state}`)}</StateMark>
                          <span>{t(TYPE_KEY[row.type] || "ann.typeNew")}</span>
                          <span>{row.audience === "university" ? t("adm.notif.history.school").replace("{name}", row.audience_university) : t("adm.ann.audienceAll")}</span>
                          <span>{row.title_en ? "FR + EN" : t("adm.ann.frOnly")}</span>
                          <span>{formatDate(row.created_at, lang, "day")}</span>
                          {row.starts_at && <span>{t("adm.ann.from").replace("{date}", formatDate(row.starts_at, lang, "dateTime"))}</span>}
                          {row.ends_at && <span>{t("adm.ann.until").replace("{date}", formatDate(row.ends_at, lang, "dateTime"))}</span>}
                          {pushedSend && <span>{t("adm.ann.pushedOn").replace("{date}", formatDate(pushedSend.created_at, lang, "dateTime"))}</span>}
                          {row.href && <span className={s.mono}>{row.href}</span>}
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                        {canPush && (
                          <button type="button" className="btn-ghost min-h-[44px]" onClick={() => { setRowError(null); setPushing(row); }}>
                            {t("adm.ann.pushExisting")}
                          </button>
                        )}
                        <button type="button" className="btn-ghost min-h-[44px]" onClick={() => toggle(row)}>
                          {row.is_active ? t("adm.ann.deactivate") : t("adm.ann.activate")}
                        </button>
                        <button type="button" className={`btn min-h-[44px] ${s.danger}`} onClick={() => setRemoving(row)}>
                          {t("adm.ann.delete")}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
        </div>
      </div>

      {confirming && validated.ok && (
        <ConfirmDialog title={t("adm.ann.confirmPushTitle")} busy={busy} error={error ? errorText(t, error) : null}
          confirmLabel={t("adm.ann.publishAndPush")} onClose={() => setConfirming(false)} onConfirm={publish}>
          <p>
            {(validated.row.audience === "university"
              ? t("adm.ann.confirmPushSchool").replace("{name}", validated.row.audience_university)
              : t("adm.ann.confirmPushAll"))}
          </p>
          <p className="mt-2">{validated.row.starts_at
            ? t("adm.ann.confirmPushLater").replace("{date}", formatDate(validated.row.starts_at, lang, "dateTimeYear"))
            : t("adm.push.confirmNow")}</p>
          <div className="mt-3 space-y-2">
            <PushPreview title={pushContent.title.fr} message={pushContent.body.fr} lang="fr" />
            {pushContent.langs.includes("en") && <PushPreview title={pushContent.title.en} message={pushContent.body.en} lang="en" />}
          </div>
        </ConfirmDialog>
      )}
      {pushing && (
        <ConfirmDialog title={t("adm.ann.confirmPushTitle")} busy={busy}
          confirmLabel={t("adm.ann.pushExisting")} onClose={() => setPushing(null)} onConfirm={pushExisting}>
          <p>{pushing.audience === "university"
            ? t("adm.ann.confirmPushSchool").replace("{name}", pushing.audience_university)
            : t("adm.ann.confirmPushAll")}</p>
          <div className="mt-3">
            <PushPreview title={announcementPushContent(pushing).title.fr} message={announcementPushContent(pushing).body.fr} lang="fr" />
          </div>
        </ConfirmDialog>
      )}
      {removing && (
        <ConfirmDialog title={t("adm.ann.deleteTitle")} danger busy={busy} confirmLabel={t("adm.ann.delete")}
          onClose={() => setRemoving(null)} onConfirm={remove}>
          {t("adm.ann.deleteBody").replace("{title}", removing.title)}
        </ConfirmDialog>
      )}
    </div>
  );
}

