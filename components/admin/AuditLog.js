// Journal admin — section de la page Système. Une page à la fois, filtrable
// par action (admin_audit_page, v61_3). Pseudos de l'acteur et de la cible,
// jamais d'email ; la cible mène à sa fiche quand le compte existe encore.

import { useState } from "react";
import Link from "next/link";
import { auditActionLabel } from "./MemberDetail";
import { EmptyLine, ErrorLine, Pager, Panel, SkeletonRows, adminStyles as s, useAdminLoad } from "./AdminUi";
import { useI18n } from "../../contexts/I18nContext";
import { adminRpc } from "../../lib/adminApi";
import { AUDIT_PAGE_SIZE, formatDate } from "../../lib/adminFormat.mjs";

// Détails utiles à relire, sans afficher tout le JSON.
function detailLine(t, details) {
  if (!details || typeof details !== "object") return null;
  const parts = [];
  if (details.title) parts.push(t("adm.common.quoted").replace("{text}", details.title));
  if (details.scope) parts.push(t(`adm.audit.scope.${details.scope}`) === `adm.audit.scope.${details.scope}` ? details.scope : t(`adm.audit.scope.${details.scope}`));
  if (details.recipients !== undefined && details.recipients !== null) parts.push(t("adm.audit.recipients").replace("{n}", details.recipients));
  if (details.deleted !== undefined) parts.push(t("adm.audit.deletedFiles").replace("{n}", details.deleted));
  if (details.from && details.to) {
    // Statuts d'une suggestion (new / read / done) : écrits dans la langue de l'admin.
    const status = (value) => (t(`adm.inbox.status.${value}`) === `adm.inbox.status.${value}` ? value : t(`adm.inbox.status.${value}`));
    parts.push(`${status(details.from)} → ${status(details.to)}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

export default function AuditLog() {
  const { t, lang } = useI18n();
  const [action, setAction] = useState("");
  const [offset, setOffset] = useState(0);
  const log = useAdminLoad(
    () => adminRpc("admin_audit_page", { p_limit: AUDIT_PAGE_SIZE, p_offset: offset, p_action: action || null }),
    [offset, action],
  );
  const data = log.data;
  const rows = data?.rows || [];

  return (
    <div className="space-y-3">
      <div className={s.toolbar}>
        <label className="flex items-center gap-2">
          <span className={s.note}>{t("adm.audit.filter")}</span>
          <select className={`input ${s.select}`} value={action} onChange={(event) => { setAction(event.target.value); setOffset(0); }}>
            <option value="">{t("adm.audit.all")}</option>
            {(data?.actions || []).map((key) => <option key={key} value={key}>{auditActionLabel(t, key)}</option>)}
          </select>
        </label>
      </div>
      <Panel>
        {log.error ? <ErrorLine code={log.error} onRetry={log.reload} />
          : log.loading && !data ? <SkeletonRows rows={5} />
          : rows.length === 0 ? <EmptyLine>{t("adm.audit.empty")}</EmptyLine>
          : (
            <>
              <ul className={s.rows} style={{ opacity: log.loading ? 0.6 : 1 }}>
                {rows.map((row) => {
                  const detail = detailLine(t, row.details);
                  return (
                    <li key={row.id} className={s.row} style={{ alignItems: "flex-start", paddingTop: 10, paddingBottom: 10 }}>
                      <div className={s.rowMain}>
                        <p className={s.rowTitle}>
                          {auditActionLabel(t, row.action)}
                          {row.target_user_id && (row.target_pseudo || row.action !== "account_deleted") && (
                            <>
                              {" · "}
                              {row.target_pseudo
                                ? <Link href={`/admin/members?id=${row.target_user_id}`} className="underline underline-offset-2">@{row.target_pseudo}</Link>
                                : <span className={s.muted}>{t("adm.audit.goneAccount")}</span>}
                            </>
                          )}
                        </p>
                        <p className={s.rowMeta}>
                          {row.actor_kind === "admin" ? `@${row.actor_pseudo || "?"}` : t(`adm.audit.actor.${row.actor_kind}`)}
                          {row.reason ? ` · ${row.reason}` : ""}
                          {detail ? ` · ${detail}` : ""}
                        </p>
                      </div>
                      <span className={s.rowMeta} style={{ whiteSpace: "nowrap" }}>{formatDate(row.at, lang, "dateTimeYear")}</span>
                    </li>
                  );
                })}
              </ul>
              <Pager offset={offset} limit={AUDIT_PAGE_SIZE} total={data.total}
                onPage={(direction) => setOffset((value) => Math.max(0, value + direction * AUDIT_PAGE_SIZE))} />
            </>
          )}
      </Panel>
    </div>
  );
}
