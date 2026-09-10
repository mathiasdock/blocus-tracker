import { useState } from "react";
import Glyph from "../Glyph";
import { useI18n } from "../../contexts/I18nContext";
import { formatMinutesShort } from "../../lib/format";

// « Anciens cours » — ce que tu as retiré de tes listes, et ce que ça pesait.
//
// Le podium au-dessus répond à « sur quoi je passe mon temps », question du
// présent : il est classé, coloré, filtré par période. Ici la question est
// autre — « qu'est-ce que j'ai déjà travaillé, et que j'ai rangé ». Donc pas
// de couleur de cours (elle sert à relier une barre à un cours ACTIF dans le
// chrono et le planning, et ne veut plus rien dire pour un cours retiré) : une
// seule teinte, la barre disant la proportion et le chiffre disant les heures.
//
// C'est aussi le seul endroit d'où l'on peut supprimer POUR DE BON. Le geste
// est rare et irréversible : il se cherche exprès, il ne se croise pas.

function IconRestore() {
  return (
    <Glyph size={16}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </Glyph>
  );
}

function IconTrash() {
  return (
    <Glyph size={16}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </Glyph>
  );
}

export default function ArchivedCourses({ rows, busyId, onRestore, onDelete }) {
  const { t } = useI18n();
  const [confirmId, setConfirmId] = useState(null);

  // L'échelle se prend sur le plus gros ANCIEN cours, pas sur le total de tous
  // les cours : sinon, quelqu'un qui a archivé deux petites matières verrait
  // deux traits invisibles et n'aurait aucun moyen de les comparer entre eux.
  const max = rows.reduce((m, r) => Math.max(m, r.secs), 0) || 1;

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold" style={{ color: "var(--bt-text-1)" }}>{t("stats.archivedTitle")}</h3>
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--bt-text-3)" }}>{t("stats.archivedSub")}</p>
        </div>
        {rows.length > 0 && (
          <span className="shrink-0 rounded-full px-2 py-0.5 font-num text-xs tabular-nums"
            style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-2)" }}>
            {rows.length}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm leading-relaxed" style={{ color: "var(--bt-text-3)" }}>
          {t("stats.archivedEmpty")}
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {rows.map((row) => {
            const confirming = confirmId === row.id;
            const busy = busyId === row.id;

            if (confirming) {
              return (
                <li key={row.id}>
                  <div className="rounded-xl p-3" role="alert"
                    style={{ backgroundColor: "var(--bt-danger-bg)", border: "1px solid var(--bt-danger-border)" }}>
                    <p className="text-sm font-semibold" style={{ color: "var(--bt-danger)" }}>
                      {t("stats.archivedDeleteTitle").replace("{name}", row.name)}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
                      {row.secs > 0
                        ? t("stats.archivedDeleteKept").replace("{time}", formatMinutesShort(row.secs))
                        : t("stats.archivedDeleteEmpty")}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => setConfirmId(null)} disabled={busy}
                        className="btn-ghost min-h-11 flex-1">
                        {t("common.cancel")}
                      </button>
                      <button type="button" disabled={busy}
                        onClick={async () => { await onDelete(row.id); setConfirmId(null); }}
                        className="btn min-h-11 flex-1 text-white disabled:opacity-50"
                        style={{ backgroundColor: "var(--bt-danger-solid)" }}>
                        {busy && <span className="bt-button-spinner" aria-hidden="true" />}
                        {t("common.delete")}
                      </button>
                    </div>
                  </div>
                </li>
              );
            }

            return (
              <li key={row.id}>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: "var(--bt-text-1)" }}>
                    {row.name}
                  </span>
                  <button type="button" onClick={() => onRestore(row.id)} disabled={busy}
                    className="bt-stats-quiet-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-xl disabled:opacity-50"
                    style={{ color: "var(--bt-accent-text)" }}
                    aria-label={`${t("stats.archivedRestore")} — ${row.name}`}
                    title={t("stats.archivedRestore")}>
                    <IconRestore />
                  </button>
                  <button type="button" onClick={() => setConfirmId(row.id)} disabled={busy}
                    className="bt-stats-quiet-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-xl disabled:opacity-50"
                    style={{ color: "var(--bt-text-3)" }}
                    aria-label={`${t("stats.archivedDelete")} — ${row.name}`}
                    title={t("stats.archivedDelete")}>
                    <IconTrash />
                  </button>
                </div>
                <div className="mt-1.5 flex items-center gap-2.5">
                  <span className="h-2 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: "var(--bt-subtle)" }} aria-hidden="true">
                    <span className="block h-full origin-left rounded-full transition-transform duration-300 motion-reduce:transition-none"
                      style={{ transform: `scaleX(${Math.max(0.03, row.secs / max)})`, backgroundColor: "var(--bt-accent)" }} />
                  </span>
                  <span className="shrink-0 font-num text-sm font-semibold tabular-nums" style={{ color: "var(--bt-text-1)" }}>
                    {formatMinutesShort(row.secs)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
