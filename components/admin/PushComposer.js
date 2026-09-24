// Envoi d'une notification push — onglet « Envoyer » de Communications.
//
// Une notification part sur des téléphones et ne se rattrape pas : avant la
// confirmation, l'admin voit QUI la recevrait, calculé par le serveur avec
// les mêmes règles que l'envoi (lib/server/notify.mjs) — ciblés, exclus par
// préférence ou suspension, éligibles, appareils actifs connus. Le texte
// s'écrit en français et, si on veut, en anglais (sinon le français part
// partout) ; l'aperçu montre les deux. « M'envoyer un test » ne vise que
// l'admin. Toute la mécanique OneSignal vit dans /api/admin/push.
//
// Choisir des membres : recherche côté serveur (admin_members), jamais une
// liste complète chargée dans la page.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BellIcon, ConfirmDialog, CountRow, Panel, Segmented, StateMark, adminStyles as s, errorText,
} from "./AdminUi";
import { useI18n } from "../../contexts/I18nContext";
import { adminFetch, adminRpc } from "../../lib/adminApi";
import { adminInputToIso, formatCount, formatDate } from "../../lib/adminFormat.mjs";
import { PUSH_BODY_MAX, PUSH_TITLE_MAX, validatePushContent } from "../../lib/notificationRules.mjs";
import { isSafeInternalHref } from "../../lib/safeHref.mjs";

function newRequestId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return null;
}

function Field({ id, label, counter, hint, children }) {
  return (
    <div>
      <div className={s.fieldHead}>
        <label htmlFor={id} className={s.fieldLabel}>{label}</label>
        {counter && <span className={s.counter}>{counter}</span>}
      </div>
      {children}
      {hint && <p className={s.hint}>{hint}</p>}
    </div>
  );
}

/** Aperçu d'une notification telle qu'elle s'affiche sur un téléphone. */
export function PushPreview({ title, message, lang }) {
  const { t } = useI18n();
  return (
    <div className={s.preview} aria-label={t("adm.push.preview")} lang={lang}>
      <span className={s.previewIcon}><BellIcon /></span>
      <span className="min-w-0">
        <span className={s.rowTitle} style={{ display: "block" }}>{title || t("adm.push.previewTitle")}</span>
        <span className={s.rowMeta} style={{ display: "block" }}>{message || t("adm.push.previewBody")}</span>
        <span className={s.rowMeta} style={{ display: "block", fontSize: 12 }}>{t("adm.push.previewApp")}</span>
      </span>
    </div>
  );
}

// Raisons d'exclusion, dans l'ordre où le calcul les applique : avant l'envoi
// (préférences, suspension, blocage, fréquence…), puis au moment de l'envoi
// (déjà reçu, aucun appareil abonné).
export const PRE_SEND_REASONS = ["missing", "suspended", "general_off", "category_off", "blocked", "frequency", "disabled"];
export const AT_SEND_REASONS = ["duplicate", "unreachable"];

// « Annonces refusées » plutôt que « catégorie refusée » quand on sait laquelle.
export function exclusionLabel(t, reason, category = null) {
  const keys = reason === "category_off" && category
    ? [`adm.notif.reason.category_off_${category}`, "adm.notif.reason.category_off"]
    : [`adm.notif.reason.${reason}`];
  for (const key of keys) {
    const text = t(key);
    if (text !== key) return text;
  }
  return reason;
}

/** « Qui recevra » : des lignes, un total, jamais des tuiles. */
export function AudienceBreakdown({ audience, loading, error, app, lang }) {
  const { t } = useI18n();
  if (error) return <p className={s.note} role="alert" style={{ color: "var(--bt-danger)" }}>{errorText(t, error)}</p>;
  if (!audience) return <p className={s.note}>{loading ? t("common.loading") : t("adm.notif.audience.pick")}</p>;
  const excluded = PRE_SEND_REASONS.filter((reason) => audience.excluded?.[reason]);
  return (
    <div style={{ opacity: loading ? 0.6 : 1 }} aria-busy={loading}>
      <dl className={s.counts}>
        <CountRow label={t("adm.notif.audience.targeted")} value={formatCount(audience.targeted, lang)} />
        {excluded.map((reason) => (
          <CountRow key={reason} muted label={`− ${exclusionLabel(t, reason, "announcement")}`} value={formatCount(audience.excluded[reason], lang)} />
        ))}
        <CountRow strong label={t("adm.notif.audience.eligible")} value={formatCount(audience.eligible, lang)} />
        <CountRow muted label={t("adm.notif.audience.reachable")}
          note={t("adm.notif.audience.reachableNote")}
          value={formatCount(audience.reachable, lang)} />
      </dl>
      {app && (
        <p className={s.hint}>
          {t("adm.notif.audience.app").replace("{n}", formatCount(app.messageable, lang))}
        </p>
      )}
    </div>
  );
}

function MemberPicker({ picked, setPicked, initialTo }) {
  const { t } = useI18n();
  const ids = useId();
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState([]);
  const [searching, setSearching] = useState(false);

  // Venu d'une fiche membre (?to=…) : la recherche accepte l'identifiant.
  useEffect(() => {
    if (!initialTo) return;
    adminRpc("admin_members", { p_search: initialTo, p_segment: "all", p_sort: "pseudo_asc", p_limit: 1, p_offset: 0 })
      .then(({ data }) => {
        const row = data?.rows?.[0];
        if (row && !row.suspended) setPicked((list) => (list.some((item) => item.user_id === row.user_id) ? list : [...list, row]));
      });
  }, [initialTo, setPicked]);

  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) { setMatches([]); return undefined; }
    let alive = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      const { data } = await adminRpc("admin_members", { p_search: needle, p_segment: "all", p_sort: "pseudo_asc", p_limit: 6, p_offset: 0 });
      if (!alive) return;
      setSearching(false);
      setMatches(data?.rows || []);
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [query]);

  return (
    <div className="mt-3">
      <label htmlFor={`${ids}-q`} className="sr-only">{t("adm.push.searchMember")}</label>
      <input id={`${ids}-q`} type="search" className="input" style={{ fontSize: 16 }} value={query} autoComplete="off"
        placeholder={t("adm.push.searchMember")} onChange={(event) => setQuery(event.target.value)} />
      {searching && <p className={s.hint}>{t("common.loading")}</p>}
      {matches.length > 0 && (
        <ul className={`${s.rows} mt-2`} style={{ border: "1px solid var(--bt-border)", borderRadius: 12 }}>
          {matches.map((row) => {
            const already = picked.some((item) => item.user_id === row.user_id);
            return (
              <li key={row.user_id}>
                <button type="button" className={s.row} disabled={row.suspended || already}
                  onClick={() => { setPicked((list) => [...list, row]); setQuery(""); setMatches([]); }}>
                  <span className={s.rowMain}>
                    <span className={s.rowTitle}>@{row.pseudo || "?"}</span>
                    <span className={s.rowMeta} style={{ display: "block" }}>
                      {[[row.first_name, row.last_name].filter(Boolean).join(" "), row.university].filter(Boolean).join(" — ")}
                    </span>
                  </span>
                  {row.suspended && <StateMark tone="danger">{t("adm.member.suspended")}</StateMark>}
                  {already && <span className={s.rowMeta}>{t("adm.push.alreadyPicked")}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {picked.length > 0 && (
        <div className={`${s.chips} mt-3`} style={{ flexWrap: "wrap" }}>
          {picked.map((row) => (
            <button key={row.user_id} type="button" className={s.chip}
              aria-label={t("adm.push.removePicked").replace("{pseudo}", row.pseudo || "?")}
              onClick={() => setPicked((list) => list.filter((item) => item.user_id !== row.user_id))}>
              @{row.pseudo || "?"} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
      <p className={s.hint}>{t("adm.push.membersHint")}</p>
    </div>
  );
}

function resultText(t, lang, result) {
  if (!result) return null;
  if (result.duplicate) return { tone: "quiet", text: t("adm.notif.result.duplicate") };
  const counts = result.counts || {};
  if (result.status === "scheduled") return { tone: "ok", text: t("adm.push.scheduled") };
  if (result.status === "sent") {
    let text = t(`adm.notif.result.sent.${counts.sent === 1 ? "one" : "other"}`).replace("{n}", formatCount(counts.sent || 0, lang));
    if (counts.unreachable) text += ` ${t("adm.notif.result.unreachable").replace("{n}", formatCount(counts.unreachable, lang))}`;
    return { tone: "ok", text };
  }
  if (result.status === "partial") return { tone: "warn", text: t("adm.notif.result.partial").replace("{sent}", formatCount(counts.sent || 0, lang)).replace("{failed}", formatCount(counts.failed || 0, lang)) };
  if (result.status === "failed") return { tone: "danger", text: t("adm.notif.result.failed") };
  if (counts.unreachable) return { tone: "quiet", text: t("adm.notif.result.nobodyReachable") };
  return { tone: "quiet", text: t("adm.notif.result.nobodyEligible") };
}

export default function PushComposer({ push, pushError, initialTo, onSent }) {
  const { t, lang } = useI18n();
  const ids = useId();
  const [form, setForm] = useState({ titleFr: "", bodyFr: "", titleEn: "", bodyEn: "", url: "" });
  const [target, setTarget] = useState(initialTo ? "users" : "all");
  const [university, setUniversity] = useState("");
  const [picked, setPicked] = useState([]);
  const [sendAfter, setSendAfter] = useState("");
  const [previewLang, setPreviewLang] = useState("fr");
  const [audience, setAudience] = useState({ data: null, loading: false, error: null });
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const requestId = useRef(newRequestId());

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const content = validatePushContent(form);
  const urlOk = isSafeInternalHref(form.url);
  const englishHalf = Boolean(form.titleEn.trim()) !== Boolean(form.bodyEn.trim());

  const targetPayload = useMemo(() => (
    target === "university" ? (university ? { type: "university", university } : null)
      : target === "users" ? (picked.length ? { type: "users", userIds: picked.map((row) => row.user_id) } : null)
      : { type: "all" }
  ), [target, university, picked]);
  const targetKey = JSON.stringify(targetPayload);

  // « Qui recevra » : recalculé par le serveur à chaque changement de cible.
  useEffect(() => {
    if (!targetPayload) { setAudience({ data: null, loading: false, error: null }); return undefined; }
    let alive = true;
    setAudience((current) => ({ ...current, loading: true, error: null }));
    const timer = setTimeout(async () => {
      const response = await adminFetch("/api/admin/push", { method: "POST", body: { action: "preview", target: targetPayload } });
      if (!alive) return;
      setAudience({ data: response.data?.audience || null, loading: false, error: response.error });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);

  const universities = push?.universities || [];
  const pickedUni = universities.find((item) => item.name === university);
  const eligible = audience.data?.eligible ?? 0;
  const ready = content.ok && targetPayload && !audience.loading && !audience.error && eligible > 0;

  const audienceText = target === "all" ? t("adm.push.targetAllShort")
    : target === "university" ? t("adm.push.targetUniShort").replace("{name}", university).replace("{n}", formatCount(pickedUni?.members ?? 0, lang))
    : picked.length <= 3
      ? picked.map((row) => `@${row.pseudo || "?"}`).join(", ")
      : t("adm.push.targetUsersShort.other").replace("{n}", String(picked.length));

  const shown = previewLang === "en" && content.ok ? content.content : null;
  const previewTitle = shown ? shown.title.en : (form.titleFr || "");
  const previewBody = shown ? shown.body.en : (form.bodyFr || "");

  async function send() {
    setSending(true);
    setError(null);
    const response = await adminFetch("/api/admin/push", {
      method: "POST",
      body: {
        action: "send",
        requestId: requestId.current,
        content: form,
        target: targetPayload,
        // Saisi en heure de Bruxelles, comme tout ce que l'admin affiche.
        sendAfter: sendAfter ? adminInputToIso(sendAfter) : undefined,
      },
    });
    setSending(false);
    if (response.error) { setError(response.error); return; }
    setResult({ ...response.data, scheduledFor: sendAfter || null });
    setConfirming(false);
    setForm({ titleFr: "", bodyFr: "", titleEn: "", bodyEn: "", url: "" });
    setPicked([]);
    setSendAfter("");
    requestId.current = newRequestId();
    onSent?.();
  }

  async function sendTest() {
    setTesting(true);
    setTestResult(null);
    const response = await adminFetch("/api/admin/push", { method: "POST", body: { action: "test", content: form } });
    setTesting(false);
    if (response.error) { setTestResult({ tone: "danger", text: errorText(t, response.error) }); return; }
    setTestResult(response.data?.reachable
      ? { tone: "ok", text: t("adm.notif.test.sent") }
      : { tone: "warn", text: t("adm.notif.test.noDevice") });
  }

  const outcome = resultText(t, lang, result);
  const excludedTotal = Object.entries(audience.data?.excluded || {}).reduce((sum, [, n]) => sum + n, 0);

  return (
    <div className={s.split}>
      <Panel pad>
        <div className={s.formGrid}>
          <div className={s.langGrid}>
            <div>
              <p className={s.langHead}>{t("adm.notif.lang.fr")}</p>
              <div className={s.formGrid}>
                <Field id={`${ids}-tfr`} label={t("adm.push.title")} counter={`${form.titleFr.length}/${PUSH_TITLE_MAX}`}>
                  <input id={`${ids}-tfr`} className="input" style={{ fontSize: 16 }} maxLength={PUSH_TITLE_MAX} lang="fr"
                    value={form.titleFr} onChange={set("titleFr")} />
                </Field>
                <Field id={`${ids}-bfr`} label={t("adm.push.body")} counter={`${form.bodyFr.length}/${PUSH_BODY_MAX}`}>
                  <textarea id={`${ids}-bfr`} className="input" style={{ fontSize: 16 }} rows={3} maxLength={PUSH_BODY_MAX} lang="fr"
                    value={form.bodyFr} onChange={set("bodyFr")} />
                </Field>
              </div>
            </div>
            <div>
              <p className={s.langHead}>{t("adm.notif.lang.en")} <span>{t("adm.notif.lang.optional")}</span></p>
              <div className={s.formGrid}>
                <Field id={`${ids}-ten`} label={t("adm.push.title")} counter={`${form.titleEn.length}/${PUSH_TITLE_MAX}`}>
                  <input id={`${ids}-ten`} className="input" style={{ fontSize: 16 }} maxLength={PUSH_TITLE_MAX} lang="en"
                    value={form.titleEn} onChange={set("titleEn")} placeholder={form.titleFr} />
                </Field>
                <Field id={`${ids}-ben`} label={t("adm.push.body")} counter={`${form.bodyEn.length}/${PUSH_BODY_MAX}`}>
                  <textarea id={`${ids}-ben`} className="input" style={{ fontSize: 16 }} rows={3} maxLength={PUSH_BODY_MAX} lang="en"
                    value={form.bodyEn} onChange={set("bodyEn")} placeholder={form.bodyFr} />
                </Field>
              </div>
            </div>
          </div>
          <p className={s.hint} style={{ marginTop: -6, color: englishHalf ? "var(--bt-danger)" : undefined }} role={englishHalf ? "alert" : undefined}>
            {englishHalf ? errorText(t, "english_incomplete") : t("adm.notif.lang.fallback")}
          </p>

          <Field id={`${ids}-url`} label={t("adm.push.link")} hint={urlOk ? t("adm.push.linkHint") : null}>
            <input id={`${ids}-url`} className={`input ${urlOk ? "" : "input-error"}`} style={{ fontSize: 16 }} value={form.url}
              placeholder="/planning" onChange={set("url")} aria-invalid={!urlOk} />
            {!urlOk && <p className={s.hint} role="alert" style={{ color: "var(--bt-danger)" }}>{errorText(t, "invalid_link")}</p>}
          </Field>

          <fieldset>
            <legend className={s.fieldLabel} style={{ marginBottom: 6 }}>{t("adm.push.target")}</legend>
            <div className={s.choiceGrid}>
              {["all", "university", "users"].map((key) => (
                <label key={key} className={s.choice}>
                  <input type="radio" name={`${ids}-target`} value={key} checked={target === key} onChange={() => setTarget(key)} />
                  <span>
                    <span className={s.rowTitle} style={{ display: "block" }}>{t(`adm.push.targetOption.${key}`)}</span>
                    <span className={s.rowMeta} style={{ display: "block" }}>{t(`adm.push.targetOption.${key}Hint`)}</span>
                  </span>
                </label>
              ))}
            </div>
            {target === "university" && (
              <>
                <label htmlFor={`${ids}-uni`} className="sr-only">{t("adm.push.pickUniversity")}</label>
                <select id={`${ids}-uni`} className="input mt-3" style={{ fontSize: 16 }} value={university}
                  onChange={(event) => setUniversity(event.target.value)}>
                  <option value="">{t("adm.push.pickUniversity")}</option>
                  {universities.map((item) => (
                    <option key={item.name} value={item.name}>
                      {`${item.name} · ${t(`adm.push.uniMembers.${item.members === 1 ? "one" : "other"}`).replace("{n}", formatCount(item.members, lang))}`}
                    </option>
                  ))}
                </select>
              </>
            )}
            {target === "users" && <MemberPicker picked={picked} setPicked={setPicked} initialTo={initialTo} />}
          </fieldset>

          <Field id={`${ids}-when`} label={t("adm.push.when")} hint={sendAfter ? t("adm.push.whenLater") : t("adm.push.whenNow")}>
            <input id={`${ids}-when`} type="datetime-local" className="input" style={{ fontSize: 16 }} value={sendAfter}
              onChange={(event) => setSendAfter(event.target.value)} />
          </Field>

          {error && !confirming && <p className="text-sm" role="alert" style={{ color: "var(--bt-danger)" }}>{errorText(t, error)}</p>}
          {outcome && (
            <p className="text-sm" role="status">
              <StateMark tone={outcome.tone}>{outcome.text}</StateMark>{" "}
              <Link href="/admin/communications?tab=history" className={s.linkBtn}>{t("adm.notif.result.seeHistory")}</Link>
            </p>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <button type="button" className="btn-ghost min-h-[44px]" disabled={!content.ok || testing}
              onClick={sendTest} aria-busy={testing}>
              {testing ? t("adm.common.working") : t("adm.notif.test.button")}
            </button>
            <button type="button" className="btn-primary min-h-[44px]" disabled={!ready || sending}
              onClick={() => { setError(null); setResult(null); setConfirming(true); }}>
              {sendAfter ? t("adm.push.schedule") : t("adm.push.send")}
            </button>
          </div>
          {testResult && <p className="text-sm" role="status"><StateMark tone={testResult.tone}>{testResult.text}</StateMark></p>}
          {!testResult && <p className={s.hint} style={{ marginTop: -8 }}>{t("adm.notif.test.hint")}</p>}
        </div>
      </Panel>

      <div className={`${s.sticky} space-y-4`}>
        <Panel pad>
          <h3 className={s.h3} style={{ marginBottom: 8 }}>{t("adm.notif.audience.title")}</h3>
          <AudienceBreakdown audience={audience.data} loading={audience.loading} error={audience.error || pushError}
            app={push?.app} lang={lang} />
        </Panel>
        <Panel pad>
          <div className={s.fieldHead} style={{ marginBottom: 10 }}>
            <h3 className={s.h3}>{t("adm.push.preview")}</h3>
            <Segmented label={t("adm.notif.lang.previewLabel")} value={previewLang} onChange={setPreviewLang}
              options={[{ value: "fr", label: "FR" }, { value: "en", label: "EN" }]} />
          </div>
          <PushPreview title={previewTitle} message={previewBody} lang={previewLang} />
          {previewLang === "en" && !form.titleEn.trim() && form.titleFr.trim() && (
            <p className={s.hint}>{t("adm.notif.lang.previewFallback")}</p>
          )}
        </Panel>
      </div>

      {confirming && content.ok && (
        <ConfirmDialog
          title={t(`adm.notif.confirm.${sendAfter ? "laterTitle" : "nowTitle"}.${eligible === 1 ? "one" : "other"}`)
            .replace("{n}", formatCount(eligible, lang))}
          confirmLabel={sendAfter ? t("adm.push.schedule") : t("adm.push.send")}
          busy={sending} error={error ? errorText(t, error) : null}
          onClose={() => setConfirming(false)} onConfirm={send}>
          <p>{t("adm.push.confirmTarget").replace("{target}", audienceText)}</p>
          <p className="mt-2">
            {t("adm.notif.confirm.counts")
              .replace("{eligible}", formatCount(eligible, lang))
              .replace("{targeted}", formatCount(audience.data?.targeted ?? 0, lang))
              .replace("{excluded}", formatCount(excludedTotal, lang))}
            {" "}
            {t("adm.notif.confirm.reachable").replace("{n}", formatCount(audience.data?.reachable ?? 0, lang))}
          </p>
          <p className="mt-2">
            {sendAfter
              ? t("adm.push.confirmLater").replace("{date}", formatDate(adminInputToIso(sendAfter), lang, "dateTimeYear"))
              : t("adm.push.confirmNow")}
          </p>
          <div className="mt-3 space-y-2">
            <PushPreview title={content.content.title.fr} message={content.content.body.fr} lang="fr" />
            {content.langs.includes("en") && <PushPreview title={content.content.title.en} message={content.content.body.en} lang="en" />}
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}
