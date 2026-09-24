// Stockage — section de la page Système.
//
// Deux outils serveur repris de l'ancienne admin, lancés à la demande (ils
// parcourent les buckets : pas au chargement de la page) :
//   /api/admin/egress-guard     → poids des fichiers par bucket, fichiers
//                                  lourds, images de publications expirées ;
//   /api/admin/storage-cleanup  → aperçu des fichiers supprimables, puis
//                                  suppression des seuls éléments sûrs
//                                  sélectionnés (les DM sont toujours exclus).

import { useState } from "react";
import { ConfirmDialog, ErrorLine, Panel, StateMark, adminStyles as s, errorText } from "./AdminUi";
import { useI18n } from "../../contexts/I18nContext";
import { adminFetch } from "../../lib/adminApi";
import { formatBytes, formatCount, formatDate } from "../../lib/adminFormat.mjs";

const BUCKETS = ["posts", "avatars", "dm", "community", "group"];

function EgressReport({ data }) {
  const { t, lang } = useI18n();
  const flags = [];
  if (data.heavy.over1Mb > 0) flags.push(["danger", t("adm.storage.over1Mb").replace("{n}", formatCount(data.heavy.over1Mb, lang))]);
  if (data.heavy.over500Kb > 0) flags.push(["warn", t("adm.storage.over500Kb").replace("{n}", formatCount(data.heavy.over500Kb, lang))]);
  if (data.posts.expiredWithImage > 0) flags.push(["warn", t("adm.storage.expiredImages").replace("{n}", formatCount(data.posts.expiredWithImage, lang))]);
  return (
    <>
      <div className="px-4 py-3" style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
        {flags.length === 0
          ? <StateMark tone="ok">{t("adm.storage.fine")}</StateMark>
          : flags.map(([tone, text]) => <StateMark key={text} tone={tone}>{text}</StateMark>)}
      </div>
      <div className={s.tableWrap} style={{ borderTop: "1px solid var(--bt-border)" }}>
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col">{t("adm.storage.col.bucket")}</th>
              <th scope="col" className={s.num}>{t("adm.storage.col.files")}</th>
              <th scope="col" className={s.num}>{t("adm.storage.col.size")}</th>
              <th scope="col" className={s.num}>{t("adm.storage.col.average")}</th>
              <th scope="col" className={s.num}>{t("adm.storage.col.p90")}</th>
              <th scope="col" className={s.num}>{t("adm.storage.col.orphans")}</th>
              <th scope="col" className={s.num}>{t("adm.storage.col.recent")}</th>
            </tr>
          </thead>
          <tbody>
            {BUCKETS.map((bucket) => {
              const row = data.buckets?.[bucket] || {};
              return (
                <tr key={bucket}>
                  <td className={s.mono}>{bucket}</td>
                  <td className={s.num}>{formatCount(row.count, lang)}</td>
                  <td className={s.num}>{formatBytes(row.totalBytes, lang)}</td>
                  <td className={s.num}>{formatBytes(row.averageBytes, lang)}</td>
                  <td className={s.num}>{formatBytes(row.p90Bytes, lang)}</td>
                  <td className={s.num}>{row.orphanCount === null || row.orphanCount === undefined ? t("adm.storage.unknown") : formatCount(row.orphanCount, lang)}</td>
                  <td className={s.num}>{formatCount(row.recent24h, lang)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data.heavy.top.length > 0 && (
        <>
          <p className={`${s.h3} px-4 pt-4 pb-1`}>{t("adm.storage.heaviest")}</p>
          <ul className={s.rows}>
            {data.heavy.top.map((file) => (
              <li key={`${file.bucket}:${file.path}`} className={s.row} style={{ minHeight: 44 }}>
                <span className={s.rowMain}>
                  <span className={s.mono} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={file.path}>
                    {file.bucket}/{file.path}
                  </span>
                </span>
                <span className={s.rowEnd}>
                  {file.status === "orphan" && <StateMark tone="warn">{t("adm.storage.orphan")}</StateMark>}
                  <span>{formatBytes(file.sizeBytes, lang)}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className={`${s.note} px-4 py-3`} style={{ borderTop: "1px solid var(--bt-border)" }}>
        {t("adm.storage.scanned")
          .replace("{date}", formatDate(data.generatedAt, lang, "dateTime"))
          .replace("{max}", formatCount(data.limits.maxFilesPerBucket, lang))}
        {data.scan?.warnings?.length ? ` ${t("adm.storage.warnings").replace("{n}", formatCount(data.scan.warnings.length, lang))}` : ""}
      </p>
    </>
  );
}

function Cleanup({ scan, selected, setSelected, onDelete, result }) {
  const { t, lang } = useI18n();
  const safe = scan.candidates.filter((item) => item.safeDelete);
  const chosen = safe.filter((item) => selected.has(item.id));
  const chosenBytes = chosen.reduce((sum, item) => sum + (item.sizeBytes || 0), 0);
  return (
    <>
      {result && (
        <p className="px-4 pt-3 text-sm" role="status" style={{ color: "var(--bt-accent-text)" }}>
          {t("adm.storage.deleted")
            .replace("{n}", formatCount(result.deletedCount, lang))
            .replace("{size}", formatBytes(result.deletedBytes, lang))}
          {result.skippedCount > 0 ? ` ${t("adm.storage.skipped").replace("{n}", formatCount(result.skippedCount, lang))}` : ""}
        </p>
      )}
      <div className="px-4 py-3" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px" }}>
        <span className={s.note}>
          {t("adm.storage.candidates")
            .replace("{n}", formatCount(scan.summary.candidateCount, lang))
            .replace("{safe}", formatCount(scan.summary.safeCount, lang))
            .replace("{size}", formatBytes(scan.summary.safeSizeBytes, lang))}
        </span>
        <button type="button" className={`btn min-h-[44px] ${s.danger}`} disabled={chosen.length === 0}
          onClick={() => onDelete(chosen, chosenBytes)}>
          {t("adm.storage.deleteSelected").replace("{n}", formatCount(chosen.length, lang))}
        </button>
      </div>
      {scan.candidates.length === 0 ? <p className={s.message}>{t("adm.storage.nothing")}</p> : (
        <ul className={s.rows} style={{ borderTop: "1px solid var(--bt-border)", maxHeight: 420, overflowY: "auto" }}>
          {scan.candidates.map((item) => (
            <li key={item.id}>
              <label className={s.row} style={{ cursor: item.safeDelete ? "pointer" : "default", minHeight: 48 }}>
                <input type="checkbox" checked={selected.has(item.id)} disabled={!item.safeDelete}
                  onChange={() => setSelected((previous) => {
                    const next = new Set(previous);
                    if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                    return next;
                  })} />
                <span className={s.rowMain}>
                  <span className={s.mono} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.path}>
                    {item.bucket}/{item.path}
                  </span>
                  <span className={s.rowMeta} style={{ display: "block" }}>
                    {t(`adm.storage.reason.${item.category}`) === `adm.storage.reason.${item.category}` ? item.category : t(`adm.storage.reason.${item.category}`)}
                    {!item.safeDelete ? ` · ${t("adm.storage.manualOnly")}` : ""}
                  </span>
                </span>
                <span className={s.rowEnd}>{formatBytes(item.sizeBytes, lang)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function StoragePanel() {
  const { t, lang } = useI18n();
  const [egress, setEgress] = useState({ data: null, error: null, loading: false });
  const [scan, setScan] = useState({ data: null, error: null, loading: false });
  const [selected, setSelected] = useState(() => new Set());
  const [confirm, setConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [result, setResult] = useState(null);

  async function runEgress() {
    setEgress((previous) => ({ ...previous, loading: true, error: null }));
    const response = await adminFetch("/api/admin/egress-guard");
    setEgress({ data: response.data, error: response.error, loading: false });
  }

  async function runScan() {
    setScan((previous) => ({ ...previous, loading: true, error: null }));
    const response = await adminFetch("/api/admin/storage-cleanup");
    setScan({ data: response.data, error: response.error, loading: false });
    setSelected(new Set((response.data?.candidates || []).filter((item) => item.safeDelete).map((item) => item.id)));
  }

  async function remove() {
    setDeleting(true);
    setDeleteError(null);
    const response = await adminFetch("/api/admin/storage-cleanup", { method: "POST", body: { ids: confirm.items.map((item) => item.id) } });
    setDeleting(false);
    if (response.error) { setDeleteError(errorText(t, response.error)); return; }
    setResult(response.data);
    setConfirm(null);
    runScan();
    if (egress.data) runEgress();
  }

  return (
    <div className="space-y-4">
      <Panel>
        <div className={s.row}>
          <span className={s.rowMain}>
            <span className={s.rowTitle} style={{ display: "block" }}>{t("adm.storage.egressTitle")}</span>
            <span className={s.rowMeta} style={{ display: "block" }}>{t("adm.storage.egressHint")}</span>
          </span>
          <button type="button" className="btn-ghost min-h-[44px]" onClick={runEgress} disabled={egress.loading}>
            {egress.loading ? t("adm.common.working") : egress.data ? t("adm.storage.rerun") : t("adm.storage.run")}
          </button>
        </div>
        {egress.error && <ErrorLine code={egress.error} onRetry={runEgress} />}
        {egress.data && <div style={{ borderTop: "1px solid var(--bt-border)" }}><EgressReport data={egress.data} /></div>}
      </Panel>

      <Panel>
        <div className={s.row}>
          <span className={s.rowMain}>
            <span className={s.rowTitle} style={{ display: "block" }}>{t("adm.storage.cleanupTitle")}</span>
            <span className={s.rowMeta} style={{ display: "block" }}>{t("adm.storage.cleanupHint")}</span>
          </span>
          <button type="button" className="btn-ghost min-h-[44px]" onClick={runScan} disabled={scan.loading || deleting}>
            {scan.loading ? t("adm.common.working") : scan.data ? t("adm.storage.rerun") : t("adm.storage.scan")}
          </button>
        </div>
        {scan.error && <ErrorLine code={scan.error} onRetry={runScan} />}
        {scan.data && (
          <div style={{ borderTop: "1px solid var(--bt-border)" }}>
            <Cleanup scan={scan.data} selected={selected} setSelected={setSelected} result={result}
              onDelete={(items, bytes) => { setDeleteError(null); setConfirm({ items, bytes }); }} />
          </div>
        )}
      </Panel>

      {confirm && (
        <ConfirmDialog title={t("adm.storage.confirmTitle")} danger busy={deleting} error={deleteError}
          confirmLabel={t("adm.storage.confirmDelete")} onClose={() => setConfirm(null)} onConfirm={remove}>
          {t("adm.storage.confirmBody")
            .replace("{n}", formatCount(confirm.items.length, lang))
            .replace("{size}", formatBytes(confirm.bytes, lang))}
        </ConfirmDialog>
      )}
    </div>
  );
}
