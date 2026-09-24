// Admin · Communications — envoyer une notification, relire l'historique,
// régler les notifications automatiques, publier une annonce dans l'app.
//
// L'onglet est dans l'URL (?tab=) ; « ?to=<membre> » ouvre l'envoi ciblé
// depuis une fiche membre. L'audience et l'historique viennent de
// /api/admin/push (OneSignal, côté serveur) : l'historique comprend aussi les
// envois automatiques de l'app.

import { useState } from "react";
import { useRouter } from "next/router";
import AdminShell from "../../components/admin/AdminShell";
import AnnouncementsPanel from "../../components/admin/AnnouncementsPanel";
import AutomationsList from "../../components/admin/AutomationsList";
import PushComposer from "../../components/admin/PushComposer";
import {
  ConfirmDialog, EmptyLine, ErrorLine, Freshness, Panel, SkeletonRows, StateMark, adminStyles as s, errorText, useAdminLoad,
} from "../../components/admin/AdminUi";
import { useI18n } from "../../contexts/I18nContext";
import { adminFetch } from "../../lib/adminApi";
import { formatCount, formatDate } from "../../lib/adminFormat.mjs";

const TABS = ["send", "history", "automatic", "announcements"];
const ALL_SUBSCRIBERS = "Total Subscriptions";

function audienceLabel(t, lang, row) {
  if ((row.segments || []).includes(ALL_SUBSCRIBERS)) return t("adm.history.everyone");
  if ((row.segments || []).length) return row.segments.join(", ");
  return t(`adm.history.members.${row.targeted === 1 ? "one" : "other"}`).replace("{n}", formatCount(row.targeted, lang));
}

function PushHistory({ push, error, loading, reload }) {
  const { t, lang } = useI18n();
  const [cancelling, setCancelling] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cancelError, setCancelError] = useState(null);
  const rows = push?.history || [];

  async function cancel() {
    setBusy(true);
    setCancelError(null);
    const response = await adminFetch("/api/admin/push", { method: "DELETE", query: { id: cancelling.id } });
    setBusy(false);
    if (response.error) { setCancelError(errorText(t, response.error)); return; }
    setCancelling(null);
    reload();
  }

  return (
    <div className="space-y-3">
      <p className={s.note}>{t("adm.history.lead")}</p>
      <Panel>
        {error && !push ? <ErrorLine code={error} onRetry={reload} />
          : loading && !push ? <SkeletonRows rows={5} />
          : rows.length === 0 ? <EmptyLine>{t("adm.history.empty")}</EmptyLine>
          : (
            <ul className={s.rows}>
              {rows.map((row) => (
                <li key={row.id} className={s.row} style={{ alignItems: "flex-start", paddingTop: 12, paddingBottom: 12 }}>
                  <div className={s.rowMain}>
                    <p className={s.rowTitle}>{row.title || t("adm.history.untitled")}</p>
                    {row.body && <p className={s.rowMeta}>{row.body}</p>}
                    <p className={s.rowMeta} style={{ marginTop: 4 }}>
                      {row.scheduledFor
                        ? t("adm.history.scheduledFor").replace("{date}", formatDate(row.scheduledFor, lang, "dateTime"))
                        : row.sentAt ? formatDate(row.sentAt, lang, "dateTime") : "—"}
                      {" · "}{audienceLabel(t, lang, row)}
                      {row.url ? <>{" · "}<span className={s.mono}>{row.url.replace(/^https?:\/\/[^/]+/, "")}</span></> : null}
                    </p>
                  </div>
                  <div className={s.rowEnd} style={{ flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                    {row.scheduledFor ? (
                      <button type="button" className={`btn min-h-[44px] ${s.danger}`} onClick={() => { setCancelError(null); setCancelling(row); }}>
                        {t("adm.history.cancel")}
                      </button>
                    ) : row.canceled ? (
                      <StateMark tone="quiet">{t("adm.history.canceled")}</StateMark>
                    ) : (
                      <>
                        <span style={{ fontWeight: 700 }}>{formatCount(row.successful, lang)}</span>
                        <span className={s.rowMeta}>{t("adm.history.delivered")}</span>
                        {row.failed > 0 && (
                          <span className={s.rowMeta} style={{ color: "var(--bt-danger)" }}>
                            {t("adm.history.failed").replace("{n}", formatCount(row.failed, lang))}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
      </Panel>
      <p className={s.note}>{t("adm.history.deliveredHint")}</p>

      {cancelling && (
        <ConfirmDialog title={t("adm.history.cancelTitle")} danger busy={busy} error={cancelError}
          confirmLabel={t("adm.history.cancel")} onClose={() => setCancelling(null)} onConfirm={cancel}>
          {t("adm.history.cancelBody").replace("{title}", cancelling.title || t("adm.history.untitled"))}
        </ConfirmDialog>
      )}
    </div>
  );
}

export default function AdminCommunications() {
  const { t } = useI18n();
  const router = useRouter();
  const tab = TABS.includes(router.query.tab) ? router.query.tab : "send";
  const to = typeof router.query.to === "string" && /^[0-9a-f-]{36}$/i.test(router.query.to) ? router.query.to : null;
  const push = useAdminLoad(() => adminFetch("/api/admin/push"), []);

  function setTab(next) {
    router.replace(next === "send" ? "/admin/communications" : `/admin/communications?tab=${next}`, undefined, { shallow: true, scroll: false });
  }

  return (
    <AdminShell section="communications" title={t("adm.nav.communications")}
      aside={(tab === "send" || tab === "history")
        ? <Freshness busy={push.loading} onRefresh={push.reload} />
        : null}>

      <div className={`${s.chips} mt-5`} role="tablist" aria-label={t("adm.comm.tabsLabel")}>
        {TABS.map((key) => (
          <button key={key} type="button" role="tab" className={s.chip} aria-selected={tab === key} onClick={() => setTab(key)}>
            {t(`adm.comm.tab.${key}`)}
          </button>
        ))}
      </div>

      <div className="mt-5" role="tabpanel">
        {tab === "send" && (
          <PushComposer key={to || "all"} push={push.data} pushError={push.error} initialTo={to} onSent={push.reload} />
        )}
        {tab === "history" && <PushHistory push={push.data} error={push.error} loading={push.loading} reload={push.reload} />}
        {tab === "automatic" && <AutomationsList />}
        {tab === "announcements" && <AnnouncementsPanel />}
      </div>
    </AdminShell>
  );
}
