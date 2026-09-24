// Admin · Système — l'état de la machine, pas des membres.
//
// Tâches planifiées, échecs d'activation des notifications, fonctions lentes,
// anomalies de données : admin_system (v61_3). Audience OneSignal : route
// /api/admin/push. Stockage : outils serveur lancés à la demande. Journal :
// admin_audit_page. Version : le commit inscrit au moment du build Vercel.
//
// Fonctions « en erreur » : pg_stat_statements ne garde que les appels qui
// ont abouti. Un appel coupé par le délai de 8 s n'y figure pas ; un maximum
// proche de ce délai est le seul signe lisible ici.

import Link from "next/link";
import AdminShell from "../../components/admin/AdminShell";
import AuditLog from "../../components/admin/AuditLog";
import StoragePanel from "../../components/admin/StoragePanel";
import { pushReason } from "../../components/admin/MemberDetail";
import {
  ChevronIcon, ErrorLine, Freshness, Panel, Section, SkeletonRows, StateMark, adminStyles as s, useAdminLoad,
} from "../../components/admin/AdminUi";
import { useI18n } from "../../contexts/I18nContext";
import { adminFetch, adminRpc } from "../../lib/adminApi";
import { formatAgo, formatCount, formatDate, formatDuration, shortSha } from "../../lib/adminFormat.mjs";
import { AUTOMATION_BY_KEY } from "../../lib/pushAutomations.mjs";

const BUILD = {
  sha: process.env.BT_BUILD_SHA || "",
  ref: process.env.BT_BUILD_REF || "",
  env: process.env.BT_BUILD_ENV || "",
  at: process.env.BT_BUILD_AT || "",
  repo: process.env.BT_BUILD_REPO || "",
};

const STATUS_TONE = { ok: "ok", error: "danger", running: "quiet", skipped: "quiet" };

function jobDetail(t, lang, job, run) {
  const details = run?.details || {};
  if (run?.status === "error") return details.stage ? t("adm.system.jobStage").replace("{stage}", details.stage) : null;
  if (job === "purge_posts") {
    return t("adm.system.purgeDetail")
      .replace("{posts}", formatCount(details.posts ?? 0, lang))
      .replace("{files}", formatCount(details.files ?? 0, lang));
  }
  // Rappel du soir (v62) : éligibles, envoyés, erreurs, puis le détail par type.
  if (job === "push_daily" && typeof details.sent === "number") {
    const head = t("adm.system.dailyDetail")
      .replace("{eligible}", formatCount(details.eligible ?? 0, lang))
      .replace("{sent}", formatCount(details.sent, lang))
      .replace("{failed}", formatCount(details.failed ?? 0, lang));
    const parts = Object.entries(details.kinds || {}).filter(([, entry]) => entry?.planned).map(([key, entry]) => {
      const label = AUTOMATION_BY_KEY[key]?.label?.[lang === "en" ? "en" : "fr"] || key;
      return t("adm.common.labelValue").replace("{label}", label).replace("{value}", formatCount(entry.sent ?? 0, lang));
    });
    return [head, ...parts].join(" · ");
  }
  return null;
}

function JobRow({ job, now }) {
  const { t, lang } = useI18n();
  const last = job.runs?.[0];
  const status = last?.status;
  const duration = last?.finished_at ? (new Date(last.finished_at) - new Date(last.started_at)) / 1000 : null;
  return (
    <li className={s.item}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className={s.rowTitle}>{t(`adm.job.${job.job}`)}</p>
        {!last ? <StateMark tone="quiet">{t("adm.system.noRun")}</StateMark>
          : job.overdue ? <StateMark tone="danger">{t("adm.system.overdue")}</StateMark>
          : <StateMark tone={STATUS_TONE[status] || "neutral"}>{t(`adm.system.status.${status}`)}</StateMark>}
      </div>
      <p className={s.rowMeta}>{t(`adm.job.${job.job}Hint`)}</p>
      {last && (
        <p className={s.rowMeta} style={{ marginTop: 4 }}>
          {t("adm.system.lastRun")
            .replace("{when}", formatAgo(last.started_at, now, lang))
            .replace("{date}", formatDate(last.started_at, lang, "dateTime"))}
          {duration !== null && duration >= 0 ? ` · ${duration < 60 ? `${Math.round(duration)} s` : formatDuration(duration, lang)}` : ""}
          {jobDetail(t, lang, job.job, last) ? ` · ${jobDetail(t, lang, job.job, last)}` : ""}
        </p>
      )}
      {!last && <p className={s.rowMeta} style={{ marginTop: 4 }}>{t("adm.today.jobNeverHint")}</p>}
      {job.runs?.length > 1 && (
        <details className="mt-2">
          <summary className={s.linkBtn} style={{ minHeight: 32, cursor: "pointer" }}>{t("adm.system.previousRuns").replace("{n}", job.runs.length - 1)}</summary>
          <ul className="mt-1">
            {job.runs.slice(1).map((run) => (
              <li key={run.started_at} className={s.rowMeta} style={{ padding: "3px 0" }}>
                <StateMark tone={STATUS_TONE[run.status] || "neutral"}>{t(`adm.system.status.${run.status}`)}</StateMark>
                {" · "}{formatDate(run.started_at, lang, "dateTime")}
                {jobDetail(t, lang, job.job, run) ? ` · ${jobDetail(t, lang, job.job, run)}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

function AnomalyRow({ title, meta, value, tone = "neutral", href }) {
  const content = (
    <>
      <span className={s.rowMain}>
        <span className={s.rowTitle} style={{ display: "block" }}>{title}</span>
        {meta && <span className={s.rowMeta} style={{ display: "block" }}>{meta}</span>}
      </span>
      <span className={s.rowEnd}>
        {tone === "neutral" ? <strong>{value}</strong> : <StateMark tone={tone}><strong style={{ color: "var(--bt-text-1)" }}>{value}</strong></StateMark>}
        {href && <span className={s.chevron}><ChevronIcon /></span>}
      </span>
    </>
  );
  return <li>{href ? <Link href={href} className={s.row}>{content}</Link> : <div className={s.row}>{content}</div>}</li>;
}

export default function AdminSystem() {
  const { t, lang } = useI18n();
  const system = useAdminLoad(() => adminRpc("admin_system"), []);
  const push = useAdminLoad(() => adminFetch("/api/admin/push"), []);
  const data = system.data;
  const now = data?.generated_at ? new Date(data.generated_at) : new Date();
  const a = data?.anomalies;
  const pf = data?.push_failures;
  const fn = data?.functions;
  const sha = shortSha(BUILD.sha);
  const reload = () => { system.reload(); push.reload(); };

  return (
    <AdminShell section="system" title={t("adm.nav.system")}
      aside={<Freshness at={data?.generated_at} busy={system.loading} onRefresh={reload} />}>

      <p className={s.lead}>
        {sha ? (
          <>
            {t("adm.system.version")}{" "}
            {BUILD.repo
              ? <a href={`https://github.com/${BUILD.repo}/commit/${BUILD.sha}`} target="_blank" rel="noopener noreferrer" className={`${s.mono} underline underline-offset-2`}>{sha}</a>
              : <span className={s.mono}>{sha}</span>}
            {BUILD.ref ? ` · ${BUILD.ref}` : ""}
            {BUILD.env ? ` · ${BUILD.env}` : ""}
            {BUILD.at ? ` · ${t("adm.system.builtAt").replace("{date}", formatDate(BUILD.at, lang, "dateTimeYear"))}` : ""}
          </>
        ) : t("adm.system.versionLocal")}
      </p>

      {system.error && !data && <Panel className="mt-6"><ErrorLine code={system.error} onRetry={system.reload} /></Panel>}
      {system.loading && !data && <Panel className="mt-6"><SkeletonRows rows={5} /></Panel>}

      {data && (
        <Section id="jobs" title={t("adm.system.jobs")}>
          <Panel><ul className={s.rows}>{data.jobs.map((job) => <JobRow key={job.job} job={job} now={now} />)}</ul></Panel>
        </Section>
      )}

      {data && (
        <Section id="push" title={t("adm.system.push")}>
          <Panel>
            <ul className={s.rows}>
              <AnomalyRow title={t("adm.system.subscriptions")}
                meta={t("adm.push.audienceHint")}
                value={push.data?.audience
                  ? t("adm.system.subscriptionsValue")
                    .replace("{reachable}", formatCount(push.data.audience.messageable, lang))
                    .replace("{total}", formatCount(push.data.audience.total, lang))
                  : push.error ? t("adm.system.unavailable") : "…"} />
              <AnomalyRow title={t("adm.system.pushFailures7d")}
                meta={t("adm.system.pushFailuresHint").replace("{n}", formatCount(pf.members_7d, lang))}
                value={formatCount(pf.failures_7d, lang)} tone={pf.failures_7d > 0 ? "warn" : "neutral"} />
              <AnomalyRow title={t("adm.system.pushFailures30d")}
                meta={pf.by_reason.length
                  ? pf.by_reason.map((row) => t("adm.common.labelValue").replace("{label}", pushReason(t, row.reason)).replace("{value}", formatCount(row.count, lang))).join(" · ")
                  : t("adm.system.none")}
                value={formatCount(pf.failures_30d, lang)} />
              {pf.last_at && <AnomalyRow title={t("adm.system.pushLast")} value={formatAgo(pf.last_at, now, lang)} />}
            </ul>
          </Panel>
        </Section>
      )}

      {a && (
        <Section id="anomalies" title={t("adm.system.anomalies")} note={t("adm.system.anomaliesNote")}>
          <Panel>
            <ul className={s.rows}>
              <AnomalyRow title={t("adm.system.a.long")}
                meta={t("adm.system.a.longMeta")
                  .replace("{members}", formatCount(a.long_sessions_members, lang))
                  .replace("{over12}", formatCount(a.over_12h_sessions, lang))
                  .replace("{week}", formatCount(a.long_sessions_7d, lang))
                  .replace("{excess}", formatDuration(a.long_sessions_excess_seconds, lang))}
                value={formatCount(a.long_sessions, lang)} tone={a.long_sessions_7d > 0 ? "warn" : "neutral"} />
              <AnomalyRow title={t("adm.system.a.overlap")}
                meta={t("adm.system.a.overlapMeta").replace("{members}", formatCount(a.overlapping_members, lang))}
                value={formatCount(a.overlapping_pairs, lang)} />
              <AnomalyRow title={t("adm.system.a.short")}
                meta={t("adm.system.a.shortMeta").replace("{time}", formatDuration(a.short_sessions_seconds, lang))}
                value={formatCount(a.short_sessions, lang)} />
              <AnomalyRow title={t("adm.system.a.beforeSignup")} meta={t("adm.system.a.beforeSignupMeta")}
                value={formatCount(a.sessions_before_signup, lang)} />
              <AnomalyRow title={t("adm.system.a.noProfile")}
                meta={t("adm.system.a.noProfileMeta").replace("{n}", formatCount(a.accounts_without_profile_with_data, lang))}
                value={formatCount(a.accounts_without_profile, lang)} />
              <AnomalyRow title={t("adm.system.a.placeholder")} meta={t("adm.system.a.placeholderMeta")}
                value={formatCount(a.placeholder_emails, lang)} href="/admin/members?seg=placeholder_email" />
              <AnomalyRow title={t("adm.system.a.deletions")} meta={t("adm.system.a.deletionsMeta")}
                value={formatCount(a.deletions_without_week, lang)} />
            </ul>
          </Panel>
        </Section>
      )}

      {data && (
        <Section id="functions" title={t("adm.system.functions")}
          note={fn?.since
            ? t("adm.system.functionsNote").replace("{date}", formatDate(fn.since, lang, "day"))
            : t("adm.system.functionsNoteNoDate")}>
          <Panel>
            {!fn?.rows ? <p className={s.message}>{t("adm.system.functionsUnavailable")}</p>
              : fn.rows.length === 0 ? <p className={s.message}>{t("adm.system.none")}</p>
              : (
                <div className={s.tableWrap}>
                  <table className={s.table}>
                    <thead>
                      <tr>
                        <th scope="col">{t("adm.system.col.function")}</th>
                        <th scope="col" className={s.num}>{t("adm.system.col.calls")}</th>
                        <th scope="col" className={s.num}>{t("adm.system.col.mean")}</th>
                        <th scope="col" className={s.num}>{t("adm.system.col.max")}</th>
                        <th scope="col">{t("adm.system.col.state")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fn.rows.map((row) => (
                        <tr key={row.name}>
                          <td className={s.mono}>{row.name}</td>
                          <td className={s.num}>{formatCount(row.calls, lang)}</td>
                          <td className={s.num}>{`${formatCount(row.mean_ms, lang)} ms`}</td>
                          <td className={s.num}>{`${formatCount(row.max_ms, lang)} ms`}</td>
                          <td className={s.nowrap}>
                            {row.flag === "near_timeout" ? <StateMark tone="danger">{t("adm.system.nearTimeout")}</StateMark>
                              : row.flag === "slow" ? <StateMark tone="warn">{t("adm.system.slow")}</StateMark>
                              : <StateMark tone="quiet">{t("adm.system.fine")}</StateMark>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </Panel>
        </Section>
      )}

      <Section id="storage" title={t("adm.system.storage")}>
        <StoragePanel />
      </Section>

      <Section id="audit" title={t("adm.system.audit")} note={t("adm.system.auditNote")}>
        <AuditLog />
      </Section>
    </AdminShell>
  );
}
