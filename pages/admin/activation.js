// Admin · Activation — un entonnoir, les cohortes par semaine, l'usage des
// fonctions. Tout vient d'admin_activation (v61) : définitions, comptes et
// taux. Quand la base ne donne pas de taux (moins de 5 personnes, fenêtre
// pas finie, donnée inconnue), la page n'en invente pas : elle écrit le
// compte brut ou dit pourquoi la case est vide.
//
// Les barres de l'entonnoir ne sont qu'une forme : leur longueur suit les
// comptes affichés à côté, sur la même échelle (le total des comptes).

import AdminShell from "../../components/admin/AdminShell";
import {
  ErrorLine, Freshness, Panel, Section, SkeletonRows, StateMark, adminStyles as s, useAdminLoad,
} from "../../components/admin/AdminUi";
import { useI18n } from "../../contexts/I18nContext";
import { adminRpc } from "../../lib/adminApi";
import { cohortCell, describeRate, formatCount, formatDate, formatPercent } from "../../lib/adminFormat.mjs";

const FUNNEL = ["accounts", "profile_created", "studies_completed", "course_added", "real_session", "real_days_2", "real_days_5"];

function CohortCell({ cell, t, lang }) {
  if (cell.state === "pending") {
    return <span className={s.muted}>{t("adm.activation.pending").replace("{date}", formatDate(cell.until, lang, "dayShort"))}</span>;
  }
  if (cell.state === "empty" || cell.state === "none") return <span className={s.muted}>—</span>;
  if (cell.state === "unknown") return <span className={s.muted}>{t("adm.activation.unknown")}</span>;
  const nOfM = t("adm.common.nOfM").replace("{n}", formatCount(cell.count, lang)).replace("{m}", formatCount(cell.base, lang));
  // Trop peu d'inscrits pour un taux : le compte seul (la note de section le dit).
  if (cell.state === "small") return <span className={s.muted}>{nOfM}</span>;
  return (
    <span>
      <strong style={{ fontWeight: 700 }}>{formatPercent(cell.rate, lang)}</strong>
      <span className={s.muted}>{` · ${nOfM}`}</span>
    </span>
  );
}

function RateRow({ label, hint, part, t, lang }) {
  const rate = describeRate(part, lang, t);
  return (
    <li className={s.row}>
      <span className={s.rowMain}>
        <span className={s.rowTitle} style={{ display: "block" }}>{label}</span>
        <span className={s.rowMeta} style={{ display: "block" }}>{hint}</span>
      </span>
      <span className={s.rowEnd}>
        <span>
          <span style={{ display: "block", fontSize: 20, fontWeight: 700 }}>{rate.value}</span>
          {rate.detail && <span className={s.rowMeta} style={{ display: "block" }}>{rate.detail}</span>}
          {!rate.hasRate && <span className={s.rowMeta} style={{ display: "block" }}>{t("adm.common.tooSmall")}</span>}
        </span>
      </span>
    </li>
  );
}

export default function AdminActivation() {
  const { t, lang } = useI18n();
  const load = useAdminLoad(() => adminRpc("admin_activation"), []);
  const data = load.data;
  const defs = data?.definitions;
  const funnel = data?.funnel;
  const usage = data?.feature_usage;
  const deletions = data?.deletions;
  // Les semaines les plus récentes d'abord ; la semaine en cours y figure.
  const cohorts = data ? [...(data.cohorts || [])].reverse() : [];

  const lead = defs ? t("adm.activation.definitions")
    .replace("{min}", formatCount(defs.real_session_seconds / 60, lang))
    .replace("{days}", formatCount(defs.activation_hours / 24, lang))
    .replace("{from}", formatCount(defs.return_window_hours[0] / 24, lang))
    .replace("{to}", formatCount(defs.return_window_hours[1] / 24, lang))
    .replace("{small}", formatCount(defs.min_cohort_size, lang)) : null;

  return (
    <AdminShell section="activation" title={t("adm.nav.activation")} lead={lead}
      aside={<Freshness at={data?.generated_at} busy={load.loading} onRefresh={load.reload} />}>

      {load.error && !data && <Panel className="mt-6"><ErrorLine code={load.error} onRetry={load.reload} /></Panel>}
      {load.loading && !data && <Panel className="mt-6"><SkeletonRows rows={7} /></Panel>}

      {funnel && (
        <Section id="funnel" title={t("adm.activation.funnel")} note={t("adm.activation.funnelNote")}>
          <Panel>
            <ol className={s.rows}>
              {FUNNEL.map((key) => {
                const value = funnel[key];
                const width = funnel.accounts ? Math.max(0, Math.min(100, (value / funnel.accounts) * 100)) : 0;
                return (
                  <li key={key} className={s.funnelRow}>
                    <span className={s.rowTitle} style={{ fontWeight: key === "accounts" ? 700 : 600 }}>{t(`adm.activation.step.${key}`)}</span>
                    <span className={s.bar} aria-hidden="true"><span className={s.barFill} style={{ display: "block", width: `${width}%` }} /></span>
                    <span className={s.rowEnd} style={{ fontWeight: 700, justifyContent: "flex-end" }}>{formatCount(value, lang)}</span>
                  </li>
                );
              })}
            </ol>
            <ul className={s.rows} style={{ borderTop: "1px solid var(--bt-border)" }}>
              <RateRow t={t} lang={lang} label={t("adm.activation.activated")}
                hint={t("adm.activation.activatedHint")}
                part={{ count: funnel.activation.activated, base: funnel.activation.eligible, rate: funnel.activation.rate }} />
              <RateRow t={t} lang={lang} label={t("adm.activation.returned")}
                hint={t("adm.activation.returnedHint")}
                part={{ count: funnel.return_week2.returned, base: funnel.return_week2.eligible, rate: funnel.return_week2.rate }} />
            </ul>
          </Panel>
        </Section>
      )}

      {data && (
        <Section id="cohorts" title={t("adm.activation.cohorts")} note={t("adm.activation.cohortsNote")}>
          <Panel>
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th scope="col">{t("adm.activation.col.week")}</th>
                    <th scope="col" className={s.num}>{t("adm.activation.col.size")}</th>
                    <th scope="col">{t("adm.activation.col.activated")}</th>
                    <th scope="col">{t("adm.activation.col.returned")}</th>
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map((row) => {
                    const activation = cohortCell(row.activation, row.cohort_size, row.activation.activated);
                    const returned = cohortCell(row.return_week2, row.cohort_size, row.return_week2.returned);
                    return (
                      <tr key={row.week_start}>
                        <th scope="row" className={s.nowrap} style={{ fontSize: 14, fontWeight: 600, color: "var(--bt-text-1)" }}>
                          {t("adm.activation.weekOf").replace("{date}", formatDate(row.week_start, lang, "day"))}
                        </th>
                        <td className={s.num}>
                          {row.cohort_size ? formatCount(row.cohort_size, lang) : <span className={s.muted}>0</span>}
                          {row.deleted > 0 && (
                            <span className={s.rowMeta} style={{ display: "block" }}>
                              {t("adm.activation.deletedIn").replace("{n}", formatCount(row.deleted, lang))}
                            </span>
                          )}
                        </td>
                        <td><CohortCell cell={activation} t={t} lang={lang} /></td>
                        <td><CohortCell cell={returned} t={t} lang={lang} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
          {deletions && (
            <p className={s.note} style={{ marginTop: 10 }}>
              {t("adm.activation.deletions")
                .replace("{total}", formatCount(deletions.total, lang))
                .replace("{in}", formatCount(deletions.in_cohorts, lang))
                .replace("{without}", formatCount(deletions.without_signup_week, lang))
                .replace("{excluded}", formatCount(deletions.excluded, lang))}
            </p>
          )}
        </Section>
      )}

      {usage && (
        <Section id="usage" title={t("adm.activation.usage")}
          note={t("adm.activation.usageNote").replace("{n}", formatCount(usage.active_30d, lang))}>
          <Panel>
            <ul className={s.rows}>
              {[
                ["planning", usage.planning, usage.planning_rate],
                ["friends", usage.friends, usage.friends_rate],
                ["course_rooms", usage.course_rooms, usage.course_rooms_rate],
              ].map(([key, count, rate]) => {
                const described = describeRate({ count, base: usage.active_30d, rate }, lang, t);
                return (
                  <li key={key} className={s.row}>
                    <span className={s.rowMain}>
                      <span className={s.rowTitle} style={{ display: "block" }}>{t(`adm.activation.feature.${key}`)}</span>
                      <span className={s.rowMeta} style={{ display: "block" }}>{t(`adm.activation.feature.${key}Hint`)}</span>
                    </span>
                    <span className={s.rowEnd}>
                      <span>
                        <span style={{ display: "block", fontWeight: 700 }}>{described.value}</span>
                        {described.detail && <span className={s.rowMeta} style={{ display: "block" }}>{described.detail}</span>}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>
          {usage.active_30d < (defs?.min_cohort_size ?? 5) && (
            <p className={s.note} style={{ marginTop: 10 }}><StateMark tone="quiet">{t("adm.activation.usageSmall")}</StateMark></p>
          )}
        </Section>
      )}
    </AdminShell>
  );
}
