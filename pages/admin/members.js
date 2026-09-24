// Admin · Membres — recherche, filtres, tri et pages, tous côté serveur
// (admin_members, v61). L'URL porte l'état (?q=&seg=&sort=&page=&id=) : le
// bouton Retour et un lien partagé rouvrent exactement la même vue. La fiche
// d'un membre s'ouvre par-dessus la liste (?id=…).
//
// Export CSV : la même lecture sans limite de lignes, avec les mêmes filtres.
// Aucune colonne email — la base ne la renvoie d'ailleurs jamais ici.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import AdminShell from "../../components/admin/AdminShell";
import MemberDetail, { activationLabel } from "../../components/admin/MemberDetail";
import {
  DownloadIcon, EmptyLine, ErrorLine, Freshness, Pager, Panel, SearchIcon, SkeletonRows, StateMark,
  adminStyles as s, errorText,
} from "../../components/admin/AdminUi";
import { Avatar } from "../../components/Layout";
import { useI18n } from "../../contexts/I18nContext";
import { adminRpc } from "../../lib/adminApi";
import {
  MEMBERS_PAGE_SIZE, MEMBER_SEGMENTS, MEMBER_SORTS, formatAgo, formatCount, formatDate, formatDuration,
  membersQueryString, parseMembersQuery, toCsv,
} from "../../lib/adminFormat.mjs";

const ACTIVATION_TONE = { activated: "ok", pending: "quiet", late: "neutral", not_activated: "neutral" };

function MemberFlags({ row, t }) {
  return (
    <>
      {row.suspended && <StateMark tone="danger">{t("adm.member.suspended")}</StateMark>}
      {!row.suspended && row.placeholder_email && <StateMark tone="warn">{t("adm.member.placeholderShort")}</StateMark>}
    </>
  );
}

function schoolLine(row) {
  return [row.university, row.study_year].filter(Boolean).join(" · ");
}

export default function AdminMembers() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const query = useMemo(() => parseMembersQuery(router.query), [router.query]);
  const [searchDraft, setSearchDraft] = useState(query.search);
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [tick, setTick] = useState(0);

  const go = useCallback((patch, { push = false } = {}) => {
    const next = { ...query, ...patch };
    const url = `/admin/members${membersQueryString(next)}`;
    router[push ? "push" : "replace"](url, undefined, { shallow: true, scroll: false });
  }, [query, router]);

  // L'URL change (Retour, lien) → le champ suit.
  useEffect(() => { setSearchDraft(query.search); }, [query.search]);

  // Recherche : une requête 300 ms après la dernière frappe, pas à chaque touche.
  useEffect(() => {
    if (!router.isReady || searchDraft.trim() === query.search) return undefined;
    const timer = setTimeout(() => go({ search: searchDraft.trim(), page: 1, id: query.id }), 300);
    return () => clearTimeout(timer);
  }, [searchDraft, query.search, query.id, router.isReady, go]);

  const offset = (query.page - 1) * MEMBERS_PAGE_SIZE;

  useEffect(() => {
    if (!router.isReady) return undefined;
    let alive = true;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    adminRpc("admin_members", {
      p_search: query.search || null,
      p_segment: query.segment,
      p_sort: query.sort,
      p_limit: MEMBERS_PAGE_SIZE,
      p_offset: offset,
    }).then((result) => {
      if (!alive) return;
      setState({ data: result.data, error: result.error, loading: false });
    });
    return () => { alive = false; };
  }, [router.isReady, query.search, query.segment, query.sort, offset, tick]);

  const data = state.data;
  const rows = data?.rows || [];
  const reload = () => setTick((value) => value + 1);
  const open = (id) => go({ id }, { push: true });
  const close = () => go({ id: null });

  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    const result = await adminRpc("admin_members", {
      p_search: query.search || null, p_segment: query.segment, p_sort: query.sort, p_limit: null, p_offset: 0,
    });
    setExporting(false);
    if (result.error || !result.data) { setExportError(result.error || "failed"); return; }
    const yes = t("adm.common.yes");
    const no = t("adm.common.no");
    const minutes = (seconds) => Math.round((Number(seconds) || 0) / 60);
    const columns = [
      ["pseudo", (r) => r.pseudo],
      ["firstName", (r) => r.first_name],
      ["lastName", (r) => r.last_name],
      ["university", (r) => r.university],
      ["studyYear", (r) => r.study_year],
      ["signedUp", (r) => r.signed_up_at],
      ["suspended", (r) => (r.suspended ? yes : no)],
      ["placeholderEmail", (r) => (r.placeholder_email ? yes : no)],
      ["profile", (r) => (r.has_profile ? yes : no)],
      ["studiesCompleted", (r) => (r.studies_completed ? yes : no)],
      ["courses", (r) => r.courses_count],
      ["realSessions", (r) => r.real_sessions],
      ["realDays", (r) => r.real_days],
      ["firstReal", (r) => r.first_real_session_at],
      ["lastReal", (r) => r.last_real_session_at],
      ["minutes7d", (r) => minutes(r.real_seconds_7d)],
      ["minutes30d", (r) => minutes(r.real_seconds_30d)],
      ["minutesTotal", (r) => minutes(r.real_seconds_total)],
      ["activation", (r) => activationLabel(t, r.activation_status)],
      ["returnedWeek2", (r) => (r.returned_week2 === null ? "" : r.returned_week2 ? yes : no)],
    ].map(([key, value]) => ({ header: t(`adm.members.csv.${key}`), value }));
    const blob = new Blob([toCsv(result.data.rows, columns)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `blocus-${t("adm.members.csv.file")}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const counts = data?.counts || {};
  const now = data?.generated_at ? new Date(data.generated_at) : new Date();

  return (
    <AdminShell section="members" title={t("adm.nav.members")}
      aside={<Freshness at={data?.generated_at} busy={state.loading} onRefresh={reload} />}>

      <div className="mt-5 space-y-3">
        <div className={s.toolbar}>
          <label className={s.search}>
            <span className="sr-only">{t("adm.members.search")}</span>
            <span className={s.searchIcon}><SearchIcon /></span>
            <input type="search" className="input" value={searchDraft} maxLength={100}
              placeholder={t("adm.members.searchPlaceholder")} autoComplete="off" spellCheck="false"
              onChange={(event) => setSearchDraft(event.target.value)} />
          </label>
          <label className="flex items-center gap-2">
            <span className="sr-only">{t("adm.members.sortLabel")}</span>
            <select className={`input ${s.select}`} value={query.sort}
              onChange={(event) => go({ sort: event.target.value, page: 1 })}>
              {MEMBER_SORTS.map((key) => <option key={key} value={key}>{t(`adm.members.sort.${key}`)}</option>)}
            </select>
          </label>
          <button type="button" className="btn-ghost min-h-[44px]" onClick={exportCsv} disabled={exporting || !data}>
            <DownloadIcon /> {exporting ? t("adm.members.exporting") : t("adm.members.export")}
          </button>
        </div>
        {exportError && <p className="text-sm" role="alert" style={{ color: "var(--bt-danger)" }}>{errorText(t, exportError)}</p>}

        <div className={s.chips} role="group" aria-label={t("adm.members.segmentLabel")}>
          {MEMBER_SEGMENTS.map((key) => (
            <button key={key} type="button" className={s.chip} aria-pressed={query.segment === key}
              onClick={() => go({ segment: key, page: 1 })}>
              {t(`adm.members.segment.${key}`)}
              {counts[key] !== undefined && <span className={s.chipCount}>{formatCount(counts[key], lang)}</span>}
            </button>
          ))}
        </div>
        <p className={s.note}>{t(`adm.members.segmentHint.${query.segment}`)}</p>
      </div>

      <Panel className={`mt-4 ${s.cq}`}>
        {state.error ? <ErrorLine code={state.error} onRetry={reload} />
          : state.loading && !data ? <SkeletonRows rows={8} />
          : rows.length === 0 ? <EmptyLine>{query.search ? t("adm.members.noMatch") : t("adm.members.empty")}</EmptyLine>
          : (
            <div style={{ opacity: state.loading ? 0.6 : 1, transition: "opacity 0.15s ease" }}>
              <div className={`${s.wideOnly} ${s.tableWrap}`}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th scope="col">{t("adm.members.col.member")}</th>
                      <th scope="col">{t("adm.members.col.signedUp")}</th>
                      <th scope="col">{t("adm.members.col.lastReal")}</th>
                      <th scope="col" className={s.num}>{t("adm.members.col.time30d")}</th>
                      <th scope="col" className={s.num}>{t("adm.members.col.timeTotal")}</th>
                      <th scope="col">{t("adm.members.col.activation")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.user_id} className={s.clickRow} onClick={() => open(row.user_id)}>
                        <td>
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar url={row.avatar_url} pseudo={row.pseudo} size={32} />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                <button type="button" className={s.rowTitle} style={{ textAlign: "left" }}
                                  onClick={(event) => { event.stopPropagation(); open(row.user_id); }}>
                                  @{row.pseudo || "?"}
                                </button>
                                <MemberFlags row={row} t={t} />
                              </div>
                              <p className={s.rowMeta} style={{ maxWidth: 340, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {[[row.first_name, row.last_name].filter(Boolean).join(" "), schoolLine(row)].filter(Boolean).join(" — ") || t("adm.member.noProfile")}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className={s.nowrap}>{formatDate(row.signed_up_at, lang, "day")}</td>
                        <td className={`${s.nowrap} ${row.last_real_session_at ? "" : s.muted}`}>
                          {row.last_real_session_at ? formatAgo(row.last_real_session_at, now, lang) : t("adm.member.never")}
                        </td>
                        <td className={s.num}>{formatDuration(row.real_seconds_30d, lang)}</td>
                        <td className={s.num}>{formatDuration(row.real_seconds_total, lang)}</td>
                        <td><StateMark tone={ACTIVATION_TONE[row.activation_status]}>{activationLabel(t, row.activation_status)}</StateMark></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className={`${s.rows} ${s.narrowOnly}`}>
                {rows.map((row) => (
                  <li key={row.user_id}>
                    <button type="button" className={s.row} onClick={() => open(row.user_id)}>
                      <Avatar url={row.avatar_url} pseudo={row.pseudo} size={36} />
                      <span className={s.rowMain}>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <span className={s.rowTitle}>@{row.pseudo || "?"}</span>
                          <MemberFlags row={row} t={t} />
                        </span>
                        <span className={s.rowMeta} style={{ display: "block" }}>
                          {t("adm.members.narrowMeta")
                            .replace("{date}", formatDate(row.signed_up_at, lang, "day"))
                            .replace("{last}", row.last_real_session_at ? formatAgo(row.last_real_session_at, now, lang) : t("adm.member.never").toLowerCase())}
                        </span>
                      </span>
                      <span className={s.rowEnd}>
                        <span>
                          <span style={{ display: "block", fontWeight: 700 }}>{formatDuration(row.real_seconds_30d, lang)}</span>
                          <span className={s.rowMeta} style={{ display: "block" }}>{t("adm.members.col.time30d")}</span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              <Pager offset={offset} limit={MEMBERS_PAGE_SIZE} total={data.total}
                onPage={(direction) => { go({ page: query.page + direction }); window.scrollTo({ top: 0 }); }} />
            </div>
          )}
      </Panel>
      <p className={s.note} style={{ marginTop: 10 }}>{t("adm.members.footnote")}</p>

      {query.id && (
        <MemberDetail key={query.id} userId={query.id} onClose={close}
          onChanged={reload} />
      )}
    </AdminShell>
  );
}
