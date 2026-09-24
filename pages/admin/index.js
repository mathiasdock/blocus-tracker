// Admin · Aujourd'hui — la page d'arrivée.
//
// Deux blocs seulement : ce qui demande une action (vide = rien à faire), puis
// quatre chiffres de la semaine. Tout vient d'admin_today (v61) ; la page ne
// compte rien elle-même et ne compare pas : elle montre la valeur de la
// semaine d'avant à côté, telle que la base la donne.

import Link from "next/link";
import AdminShell, { loadAdminToday } from "../../components/admin/AdminShell";
import {
  ChevronIcon, ErrorLine, Freshness, Panel, Section, SkeletonRows, StateMark, adminStyles as s, plural, useAdminLoad,
} from "../../components/admin/AdminUi";
import { useI18n } from "../../contexts/I18nContext";
import {
  describeRate, formatAgo, formatCount, formatDate, formatDuration, todayAttention,
} from "../../lib/adminFormat.mjs";

function AttentionRow({ item, now }) {
  const { t, lang } = useI18n();
  const job = item.job ? t(`adm.job.${item.job}`) : "";
  let title;
  let meta = null;
  if (item.key === "reports") title = plural(t, "adm.today.reports", item.count);
  else if (item.key === "feedback") title = plural(t, "adm.today.feedback", item.count);
  else if (item.key === "jobOverdue") {
    title = t("adm.today.jobOverdue").replace("{job}", job);
    meta = t("adm.today.lastRun").replace("{when}", formatAgo(item.at, now, lang));
  } else if (item.key === "jobFailed") {
    title = t("adm.today.jobFailed").replace("{job}", job);
    meta = t("adm.today.lastRun").replace("{when}", formatAgo(item.at, now, lang));
  } else if (item.key === "jobNever") {
    title = t("adm.today.jobNever").replace("{job}", job);
    meta = t("adm.today.jobNeverHint");
  } else if (item.key === "pushFailures") {
    title = plural(t, "adm.today.pushFailures", item.count);
    meta = plural(t, "adm.today.members", item.members || 0);
  } else if (item.key === "longSessions") {
    title = plural(t, "adm.today.longSessions", item.count);
    meta = t("adm.today.longSessionsHint");
  }
  const tone = item.tone === "danger" ? "danger" : item.tone === "act" ? "neutral" : "quiet";
  return (
    <li>
      <Link href={item.href} className={s.row}>
        <StateMark tone={tone}><span className="sr-only">{t(`adm.tone.${item.tone}`)}</span></StateMark>
        <span className={s.rowMain}>
          <span className={s.rowTitle} style={{ display: "block" }}>{title}</span>
          {meta && <span className={s.rowMeta} style={{ display: "block" }}>{meta}</span>}
        </span>
        <span className={s.chevron}><ChevronIcon /></span>
      </Link>
    </li>
  );
}

function Stat({ label, value, sub, small }) {
  return (
    <div className={s.stat}>
      <p className={s.statLabel}>{label}</p>
      <p className={`${s.statValue} ${small ? s.statValueSmall : ""}`}>{value}</p>
      {sub && <p className={s.statSub}>{sub}</p>}
    </div>
  );
}

export default function AdminToday() {
  const { t, lang } = useI18n();
  const today = useAdminLoad(async () => {
    const result = await loadAdminToday({ force: true });
    // Le compte de la navigation relit la même réponse, fraîche.
    window.dispatchEvent(new Event("bt-admin-queue"));
    return result;
  }, []);
  const data = today.data;
  const now = data?.generated_at ? new Date(data.generated_at) : new Date();
  const items = todayAttention(data);
  const cohort = data?.latest_complete_cohort;
  const activation = cohort
    ? describeRate({ count: cohort.activated, base: cohort.cohort_size, rate: cohort.activation_rate }, lang, t)
    : null;
  const previous = (value) => t("adm.today.previous").replace("{value}", value);

  return (
    <AdminShell section="today" title={t("adm.nav.today")}
      aside={<Freshness at={data?.generated_at} busy={today.loading} onRefresh={today.reload} />}>

      <Section id="attention" title={t("adm.today.attention")}>
        <Panel>
          {today.loading && !data ? <SkeletonRows rows={2} />
            : today.error && !data ? <ErrorLine code={today.error} onRetry={today.reload} />
            : items.length === 0 ? (
              <div className={s.row}>
                <StateMark tone="ok">{t("adm.today.nothing")}</StateMark>
              </div>
            ) : (
              <ul className={s.rows}>
                {items.map((item) => <AttentionRow key={`${item.key}-${item.job || ""}`} item={item} now={now} />)}
              </ul>
            )}
        </Panel>
      </Section>

      <Section id="week" title={t("adm.today.week")}
        aside={<Link href="/admin/activation" className={s.linkBtn}>{t("adm.today.toActivation")}<ChevronIcon size={16} /></Link>}>
        <Panel>
          {!data ? (today.error ? <ErrorLine code={today.error} onRetry={today.reload} /> : <SkeletonRows rows={2} />) : (
            <div className={s.stats}>
              <Stat label={t("adm.today.active")}
                value={formatCount(data.active_members.current, lang)}
                sub={previous(formatCount(data.active_members.previous, lang))} />
              <Stat label={t("adm.today.newAccounts")}
                value={formatCount(data.new_accounts.current, lang)}
                sub={previous(formatCount(data.new_accounts.previous, lang))} />
              <Stat label={t("adm.today.activation")}
                value={activation ? activation.value : "—"}
                small={activation && !activation.hasRate}
                sub={cohort
                  ? `${t("adm.today.cohortOf").replace("{week}", formatDate(cohort.week_start, lang, "dayShort"))}${activation.hasRate ? ` · ${activation.detail}` : ` · ${t("adm.common.tooSmall")}`}`
                  : t("adm.today.noCohort")} />
              <Stat label={t("adm.today.hours")}
                value={formatDuration(data.study_seconds.current, lang)}
                sub={previous(formatDuration(data.study_seconds.previous, lang))} />
            </div>
          )}
        </Panel>
        {data && (
          <p className={s.note} style={{ marginTop: 10 }}>
            {t("adm.today.footnote")
              .replace("{accounts}", formatCount(data.members.accounts, lang))
              .replace("{suspended}", formatCount(data.members.suspended, lang))}
          </p>
        )}
      </Section>
    </AdminShell>
  );
}
