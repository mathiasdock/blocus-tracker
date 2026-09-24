// Annonces dans l'app — onglet de Communications.
//
// Une annonce s'affiche dans la cloche des notifications quand le membre
// ouvre l'app ; contrairement à une notification push, elle ne fait pas
// sonner le téléphone. Écriture directe dans app_announcements : la RLS la
// réserve aux admins et chaque création, (dés)activation ou suppression est
// tracée par la base (journal d'audit, v55).

import { useId, useState } from "react";
import { ConfirmDialog, EmptyLine, ErrorLine, SkeletonRows, StateMark, adminStyles as s, errorText, useAdminLoad } from "./AdminUi";
import { useAuth } from "../../contexts/AuthContext";
import { useI18n } from "../../contexts/I18nContext";
import { formatDate } from "../../lib/adminFormat.mjs";
import { TEXT_LIMITS, clientRateLimit, isSafeInternalHref, trimmedText } from "../../lib/security";
import { supabase } from "../../lib/supabaseClient";

const TYPES = ["new", "info", "important"];
const TYPE_KEY = { new: "ann.typeNew", info: "ann.typeInfo", important: "ann.typeImportant" };
const EMPTY = { title: "", message: "", type: "new", href: "" };

async function listAnnouncements() {
  const { data, error } = await supabase.from("app_announcements")
    .select("id, title, message, type, href, is_active, created_at")
    .order("created_at", { ascending: false })
    .then((result) => result);
  return error ? { data: null, error: "failed" } : { data: data || [], error: null };
}

export default function AnnouncementsPanel() {
  const { t, lang } = useI18n();
  const { profile } = useAuth();
  const ids = useId();
  const list = useAdminLoad(listAnnouncements, []);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [rowError, setRowError] = useState(null);
  const [removing, setRemoving] = useState(null);

  async function create(event) {
    event.preventDefault();
    const title = trimmedText(form.title, TEXT_LIMITS.announcementTitle);
    const message = trimmedText(form.message, TEXT_LIMITS.announcementMessage);
    const href = trimmedText(form.href, TEXT_LIMITS.announcementHref);
    if (!title || !message) { setError(t("adm.ann.required")); return; }
    if (!isSafeInternalHref(href)) { setError(errorText(t, "invalid_link")); return; }
    const limited = clientRateLimit(`admin:announcement:${profile?.id}`, 12, 60_000);
    if (!limited.ok) { setError(errorText(t, "rate_limited")); return; }
    setBusy(true); setError(null);
    const { error: insertError } = await supabase.from("app_announcements")
      .insert({ title, message, type: form.type, href: href || null, is_active: true, created_by: profile?.id })
      .then((result) => result);
    setBusy(false);
    if (insertError) { setError(errorText(t, "failed")); return; }
    setForm(EMPTY);
    list.reload();
  }

  async function toggle(row) {
    setRowError(null);
    const { error: updateError } = await supabase.from("app_announcements")
      .update({ is_active: !row.is_active }).eq("id", row.id).then((result) => result);
    if (updateError) { setRowError(errorText(t, "failed")); return; }
    list.setData((rows) => rows.map((item) => (item.id === row.id ? { ...item, is_active: !item.is_active } : item)));
  }

  async function remove() {
    const row = removing;
    setBusy(true);
    const { error: deleteError } = await supabase.from("app_announcements").delete().eq("id", row.id).then((result) => result);
    setBusy(false);
    if (deleteError) { setRowError(errorText(t, "failed")); setRemoving(null); return; }
    list.setData((rows) => rows.filter((item) => item.id !== row.id));
    setRemoving(null);
  }

  const rows = list.data || [];

  return (
    <div className="space-y-4">
      <p className={s.note}>{t("adm.ann.lead")}</p>

      <form onSubmit={create} className={`${s.panel} ${s.panelPad}`} noValidate>
        <div className={s.formGrid}>
          <h3 className={s.h3}>{t("adm.ann.new")}</h3>
          <div>
            <div className={s.fieldHead}>
              <label htmlFor={`${ids}-title`} className={s.fieldLabel}>{t("adm.ann.title")}</label>
              <span className={s.counter}>{`${form.title.length}/${TEXT_LIMITS.announcementTitle}`}</span>
            </div>
            <input id={`${ids}-title`} className="input" style={{ fontSize: 16 }} maxLength={TEXT_LIMITS.announcementTitle}
              value={form.title} onChange={(event) => setForm((f) => ({ ...f, title: event.target.value }))} />
          </div>
          <div>
            <div className={s.fieldHead}>
              <label htmlFor={`${ids}-message`} className={s.fieldLabel}>{t("adm.ann.message")}</label>
              <span className={s.counter}>{`${form.message.length}/${TEXT_LIMITS.announcementMessage}`}</span>
            </div>
            <textarea id={`${ids}-message`} className="input" style={{ fontSize: 16 }} rows={3} maxLength={TEXT_LIMITS.announcementMessage}
              value={form.message} onChange={(event) => setForm((f) => ({ ...f, message: event.target.value }))} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className={s.fieldHead}><label htmlFor={`${ids}-type`} className={s.fieldLabel}>{t("adm.ann.type")}</label></div>
              <select id={`${ids}-type`} className="input" style={{ fontSize: 16 }} value={form.type}
                onChange={(event) => setForm((f) => ({ ...f, type: event.target.value }))}>
                {TYPES.map((type) => <option key={type} value={type}>{t(TYPE_KEY[type])}</option>)}
              </select>
            </div>
            <div>
              <div className={s.fieldHead}><label htmlFor={`${ids}-href`} className={s.fieldLabel}>{t("adm.ann.link")}</label></div>
              <input id={`${ids}-href`} className="input" style={{ fontSize: 16 }} maxLength={TEXT_LIMITS.announcementHref}
                placeholder="/planning" value={form.href} onChange={(event) => setForm((f) => ({ ...f, href: event.target.value }))} />
            </div>
          </div>
          {error && <p className="text-sm" role="alert" style={{ color: "var(--bt-danger)" }}>{error}</p>}
          <div>
            <button type="submit" className="btn-primary min-h-[44px]" disabled={busy}>
              {busy ? t("adm.common.working") : t("adm.ann.publish")}
            </button>
          </div>
        </div>
      </form>

      <div>
        <h3 className={s.h3} style={{ marginBottom: 8 }}>{t("adm.ann.history")}</h3>
        {rowError && <p className="text-sm mb-2" role="alert" style={{ color: "var(--bt-danger)" }}>{rowError}</p>}
        <div className={s.panel}>
          {list.error ? <ErrorLine code={list.error} onRetry={list.reload} />
            : list.loading && !list.data ? <SkeletonRows rows={3} />
            : rows.length === 0 ? <EmptyLine>{t("adm.ann.empty")}</EmptyLine>
            : (
              <ul className={s.rows}>
                {rows.map((row) => (
                  <li key={row.id} className={s.row} style={{ alignItems: "flex-start", paddingTop: 12, paddingBottom: 12 }}>
                    <div className={s.rowMain}>
                      <p className={s.rowTitle}>{row.title}</p>
                      <p className={s.rowMeta}>{row.message}</p>
                      <p className={s.rowMeta} style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
                        <StateMark tone={row.is_active ? "ok" : "quiet"}>{row.is_active ? t("adm.ann.active") : t("adm.ann.inactive")}</StateMark>
                        <span>{t(TYPE_KEY[row.type] || "ann.typeNew")}</span>
                        <span>{formatDate(row.created_at, lang, "day")}</span>
                        {row.href && <span className={s.mono}>{row.href}</span>}
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                      <button type="button" className="btn-ghost min-h-[44px]" onClick={() => toggle(row)}>
                        {row.is_active ? t("adm.ann.deactivate") : t("adm.ann.activate")}
                      </button>
                      <button type="button" className={`btn min-h-[44px] ${s.danger}`} onClick={() => setRemoving(row)}>
                        {t("adm.ann.delete")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </div>
      </div>

      {removing && (
        <ConfirmDialog title={t("adm.ann.deleteTitle")} danger busy={busy} confirmLabel={t("adm.ann.delete")}
          onClose={() => setRemoving(null)} onConfirm={remove}>
          {t("adm.ann.deleteBody").replace("{title}", removing.title)}
        </ConfirmDialog>
      )}
    </div>
  );
}
