// Historique des notifications — onglet de Communications.
//
// Source : notre registre (notification_sends, v62) via admin_notification_sends,
// pas l'historique OneSignal (30 jours, 20 lignes, rappels automatiques
// mêlés aux envois manuels). Filtres : origine, période, auteur. Chaque envoi
// dit ce qui a été ciblé, exclu (et pourquoi), confié à OneSignal, échoué.
// La livraison aux appareils se relit chez OneSignal à la demande ; les clics
// restent « non disponible » tant qu'aucune mesure fiable n'est vérifiée —
// jamais un zéro qui ferait croire que personne n'a cliqué.

import { useState } from "react";
import {
  ConfirmDialog, EmptyLine, ErrorLine, Pager, Panel, SkeletonRows, StateMark, adminStyles as s, errorText, useAdminLoad,
} from "./AdminUi";
import { AT_SEND_REASONS, PRE_SEND_REASONS, exclusionLabel } from "./PushComposer";
import { useI18n } from "../../contexts/I18nContext";
import { adminFetch, adminRpc } from "../../lib/adminApi";
import { formatCount, formatDate } from "../../lib/adminFormat.mjs";

const PAGE = 20;
const SOURCES = ["", "admin", "automation", "social"];
const PERIODS = { "7": 7, "30": 30, "90": 90, all: null };
const STATUS_TONE = { sent: "ok", scheduled: "ok", partial: "warn", failed: "danger", cancelled: "quiet", skipped: "quiet", pending: "quiet" };

export function kindLabel(t, kind) {
  const key = `adm.notif.kind.${kind}`;
  const text = t(key);
  return text === key ? kind : text;
}

function targetText(t, lang, row) {
  if (row.target_type === "all") return t("adm.history.everyone");
  if (row.target_type === "university") return t("adm.notif.history.school").replace("{name}", row.target_label || "?");
  if (row.target_type === "self") return t("adm.notif.history.self");
  if (row.target_type === "automation") return t("adm.notif.history.evening");
  return t(`adm.history.members.${row.targeted === 1 ? "one" : "other"}`).replace("{n}", formatCount(row.targeted, lang));
}

function whoText(t, row) {
  if (row.source === "admin") return row.author_pseudo ? `@${row.author_pseudo}` : t("adm.notif.history.formerAdmin");
  return t(`adm.notif.source.${row.source}`);
}

function HistoryRow({ row, onCancel, onDelivery, deliveryBusy }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const title = row.title?.fr || row.title?.en || t("adm.history.untitled");
  const excluded = row.excluded || {};
  const before = PRE_SEND_REASONS.filter((reason) => excluded[reason] > 0);
  const atSend = AT_SEND_REASONS.filter((reason) => excluded[reason] > 0);
  const when = row.status === "scheduled" && row.scheduled_for
    ? t("adm.history.scheduledFor").replace("{date}", formatDate(row.scheduled_for, lang, "dateTime"))
    : formatDate(row.created_at, lang, "dateTime");

  return (
    <li style={{ padding: "12px 16px" }}>
      <div className="flex items-start gap-3">
        <div className={s.rowMain}>
          <p className={s.rowTitle}>{title}</p>
          <p className={s.rowMeta}>
            {kindLabel(t, row.kind)}{" · "}{when}{" · "}{whoText(t, row)}{" · "}{targetText(t, lang, row)}
          </p>
          <p className={s.rowMeta} style={{ marginTop: 2 }}>
            {t("adm.notif.history.numbers")
              .replace("{targeted}", formatCount(row.targeted, lang))
              .replace("{sent}", formatCount(row.sent, lang))
              .replace("{failed}", formatCount(row.failed, lang))}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <StateMark tone={STATUS_TONE[row.status] || "neutral"}>{t(`adm.notif.status.${row.status}`)}</StateMark>
          <button type="button" className={s.linkBtn} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            {open ? t("adm.notif.history.less") : t("adm.notif.history.more")}
          </button>
        </div>
      </div>
      {open && (
        <div className={s.details}>
          <dl className={s.counts}>
            <div className={s.countRow}><dt>{t("adm.notif.audience.targeted")}</dt><dd>{formatCount(row.targeted, lang)}</dd></div>
            {before.map((reason) => (
              <div key={reason} className={`${s.countRow} ${s.countMuted}`}><dt>{`− ${exclusionLabel(t, reason, row.category)}`}</dt><dd>{formatCount(excluded[reason], lang)}</dd></div>
            ))}
            <div className={s.countRow}><dt>{t("adm.notif.audience.eligible")}</dt><dd>{formatCount(row.eligible, lang)}</dd></div>
            {atSend.map((reason) => (
              <div key={reason} className={`${s.countRow} ${s.countMuted}`}><dt>{`− ${exclusionLabel(t, reason, row.category)}`}</dt><dd>{formatCount(excluded[reason], lang)}</dd></div>
            ))}
            <div className={`${s.countRow} ${s.countStrong}`}><dt>{t("adm.notif.history.handed")}</dt><dd>{formatCount(row.sent, lang)}</dd></div>
            {row.failed > 0 && (
              <div className={s.countRow}><dt style={{ color: "var(--bt-danger)" }}>{t("adm.notif.history.failedLabel")}</dt><dd>{formatCount(row.failed, lang)}</dd></div>
            )}
            <div className={`${s.countRow} ${s.countMuted}`}>
              <dt>{t("adm.notif.history.delivered")}</dt>
              <dd>
                {row.delivery
                  ? t("adm.notif.history.deliveredValue")
                    .replace("{ok}", formatCount(row.delivery.successful, lang))
                    .replace("{ko}", formatCount((row.delivery.failed || 0) + (row.delivery.errored || 0), lang))
                  : t("adm.notif.history.notFetched")}
              </dd>
            </div>
            <div className={`${s.countRow} ${s.countMuted}`}><dt>{t("adm.notif.history.clicks")}</dt><dd>{t("adm.notif.history.unavailable")}</dd></div>
          </dl>
          <p className="mt-2">
            {t("adm.notif.history.langs").replace("{langs}", (row.langs || ["fr"]).map((code) => code.toUpperCase()).join(" + "))}
            {row.url ? <>{" · "}<span className={s.mono}>{row.url}</span></> : null}
            {row.error ? <>{" · "}<span style={{ color: "var(--bt-danger)" }}>{errorText(t, row.error)}</span></> : null}
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            {row.onesignal_batches > 0 && (
              <button type="button" className="btn-ghost min-h-[44px]" disabled={deliveryBusy} onClick={() => onDelivery(row)}>
                {deliveryBusy ? t("adm.common.working") : t("adm.notif.history.refreshDelivery")}
              </button>
            )}
            {row.status === "scheduled" && (
              <button type="button" className={`btn min-h-[44px] ${s.danger}`} onClick={() => onCancel(row)}>
                {t("adm.history.cancel")}
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export default function NotificationHistory() {
  const { t } = useI18n();
  const [source, setSource] = useState("");
  const [period, setPeriod] = useState("30");
  const [author, setAuthor] = useState("");
  const [offset, setOffset] = useState(0);
  const [cancelling, setCancelling] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cancelError, setCancelError] = useState(null);
  const [deliveryFor, setDeliveryFor] = useState(null);
  const [rowError, setRowError] = useState(null);

  const history = useAdminLoad(() => {
    const days = PERIODS[period];
    return adminRpc("admin_notification_sends", {
      p_source: source || null,
      p_from: days ? new Date(Date.now() - days * 864e5).toISOString() : null,
      p_to: null,
      p_author: author || null,
      p_limit: PAGE,
      p_offset: offset,
    });
  }, [source, period, author, offset]);
  const rows = history.data?.rows || [];
  const authors = history.data?.authors || [];

  function change(setter) {
    return (value) => { setter(value); setOffset(0); };
  }

  async function cancel() {
    setBusy(true);
    setCancelError(null);
    const response = await adminFetch("/api/admin/push", { method: "DELETE", query: { id: cancelling.id } });
    setBusy(false);
    if (response.error) { setCancelError(errorText(t, response.error)); return; }
    setCancelling(null);
    history.reload();
  }

  async function delivery(row) {
    setDeliveryFor(row.id);
    setRowError(null);
    const response = await adminFetch("/api/admin/push", { method: "POST", body: { action: "delivery", sendId: row.id } });
    setDeliveryFor(null);
    if (response.error) { setRowError(errorText(t, response.error)); return; }
    history.setData((data) => data && ({
      ...data,
      rows: data.rows.map((item) => (item.id === row.id ? { ...item, delivery: response.data?.delivery || null } : item)),
    }));
  }

  return (
    <div className="space-y-3">
      <p className={s.note}>{t("adm.notif.history.lead")}</p>
      <div className={s.toolbar}>
        <div className={s.chips} role="group" aria-label={t("adm.notif.history.sourceLabel")}>
          {SOURCES.map((key) => (
            <button key={key || "all"} type="button" className={s.chip} aria-pressed={source === key}
              onClick={() => change(setSource)(key)}>
              {key ? t(`adm.notif.sourceFilter.${key}`) : t("adm.notif.sourceFilter.all")}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2">
          <span className={s.note}>{t("adm.notif.history.period")}</span>
          <select className={`input ${s.select}`} value={period} onChange={(event) => change(setPeriod)(event.target.value)}>
            {Object.keys(PERIODS).map((key) => <option key={key} value={key}>{t(`adm.notif.period.${key}`)}</option>)}
          </select>
        </label>
        {authors.length > 0 && (
          <label className="flex items-center gap-2">
            <span className={s.note}>{t("adm.notif.history.author")}</span>
            <select className={`input ${s.select}`} value={author} onChange={(event) => change(setAuthor)(event.target.value)}>
              <option value="">{t("adm.notif.history.anyAuthor")}</option>
              {authors.map((item) => <option key={item.id} value={item.id}>@{item.pseudo}</option>)}
            </select>
          </label>
        )}
      </div>
      {rowError && <p className="text-sm" role="alert" style={{ color: "var(--bt-danger)" }}>{rowError}</p>}
      <Panel>
        {history.error ? <ErrorLine code={history.error} onRetry={history.reload} />
          : history.loading && !history.data ? <SkeletonRows rows={5} />
          : rows.length === 0 ? <EmptyLine>{t("adm.notif.history.empty")}</EmptyLine>
          : (
            <>
              <ul className={s.rows} style={{ opacity: history.loading ? 0.6 : 1 }}>
                {rows.map((row) => (
                  <HistoryRow key={row.id} row={row} deliveryBusy={deliveryFor === row.id}
                    onDelivery={delivery} onCancel={(item) => { setCancelError(null); setCancelling(item); }} />
                ))}
              </ul>
              <Pager offset={offset} limit={PAGE} total={history.data.total}
                onPage={(direction) => setOffset((value) => Math.max(0, value + direction * PAGE))} />
            </>
          )}
      </Panel>
      <p className={s.note}>{t("adm.notif.history.note")}</p>

      {cancelling && (
        <ConfirmDialog title={t("adm.history.cancelTitle")} danger busy={busy} error={cancelError}
          confirmLabel={t("adm.history.cancel")} onClose={() => setCancelling(null)} onConfirm={cancel}>
          {t("adm.history.cancelBody").replace("{title}", cancelling.title?.fr || t("adm.history.untitled"))}
        </ConfirmDialog>
      )}
    </div>
  );
}
