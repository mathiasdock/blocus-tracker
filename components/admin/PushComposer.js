// Envoi d'une notification push — onglet « Envoyer » de Communications.
//
// Une notification part sur des téléphones et ne se rattrape pas : l'aperçu
// montre le résultat, et l'envoi passe par une confirmation qui récapitule
// la cible. Toute la mécanique OneSignal vit dans /api/admin/push (clé REST
// server-only, comptes suspendus exclus, chaque envoi dans le journal).
//
// Choisir des membres : recherche côté serveur (admin_members), jamais une
// liste complète chargée dans la page.

import { useEffect, useId, useState } from "react";
import { BellIcon, ConfirmDialog, StateMark, adminStyles as s, errorText } from "./AdminUi";
import { useI18n } from "../../contexts/I18nContext";
import { adminFetch, adminRpc } from "../../lib/adminApi";
import { formatCount, formatDate } from "../../lib/adminFormat.mjs";
import { isSafeInternalHref } from "../../lib/security";

const MAX_TITLE = 60;
const MAX_BODY = 160;

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

export function PushPreview({ title, message }) {
  const { t } = useI18n();
  return (
    <div className={s.preview} aria-label={t("adm.push.preview")}>
      <span className={s.previewIcon}><BellIcon /></span>
      <span className="min-w-0">
        <span className={s.rowTitle} style={{ display: "block" }}>{title || t("adm.push.previewTitle")}</span>
        <span className={s.rowMeta} style={{ display: "block" }}>{message || t("adm.push.previewBody")}</span>
        <span className={s.rowMeta} style={{ display: "block", fontSize: 12 }}>{t("adm.push.previewApp")}</span>
      </span>
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

export default function PushComposer({ push, pushError, initialTo, onSent }) {
  const { t, lang } = useI18n();
  const ids = useId();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("");
  const [target, setTarget] = useState(initialTo ? "users" : "all");
  const [university, setUniversity] = useState("");
  const [picked, setPicked] = useState([]);
  const [sendAfter, setSendAfter] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const urlOk = isSafeInternalHref(url);
  const ready = title.trim() && message.trim() && urlOk
    && (target !== "university" || university)
    && (target !== "users" || picked.length > 0);

  const universities = push?.universities || [];
  const picked1 = universities.find((item) => item.name === university);
  const audienceText = target === "all" ? t("adm.push.targetAllShort")
    : target === "university" ? t("adm.push.targetUniShort").replace("{name}", university).replace("{n}", formatCount(picked1?.members ?? 0, lang))
    : picked.length <= 3
      ? picked.map((row) => `@${row.pseudo || "?"}`).join(", ")
      : t("adm.push.targetUsersShort.other").replace("{n}", String(picked.length));

  async function send() {
    setSending(true);
    setError(null);
    const response = await adminFetch("/api/admin/push", {
      method: "POST",
      body: {
        title, message, url: url.trim(),
        sendAfter: sendAfter ? new Date(sendAfter).toISOString() : undefined,
        target: target === "university" ? { type: "university", university }
          : target === "users" ? { type: "users", userIds: picked.map((row) => row.user_id) }
          : { type: "all" },
      },
    });
    setSending(false);
    if (response.error) { setError(response.error); return; }
    setResult({ ...response.data, scheduled: Boolean(sendAfter) });
    setConfirming(false);
    setTitle(""); setMessage(""); setUrl(""); setPicked([]); setSendAfter("");
    onSent?.();
  }

  return (
    <div className="space-y-4">
      <div className={s.note}>
        {push?.audience
          ? t("adm.push.audience")
            .replace("{reachable}", formatCount(push.audience.messageable, lang))
            .replace("{total}", formatCount(push.audience.total, lang))
          : pushError ? <span style={{ color: "var(--bt-danger)" }}>{errorText(t, pushError)}</span> : t("common.loading")}
        {push?.audience && <span>{` ${t("adm.push.audienceHint")}`}</span>}
      </div>

      <div className={`${s.panel} ${s.panelPad}`}>
        <div className={s.formGrid}>
          <Field id={`${ids}-title`} label={t("adm.push.title")} counter={`${title.length}/${MAX_TITLE}`} hint={t("adm.push.titleHint")}>
            <input id={`${ids}-title`} className="input" style={{ fontSize: 16 }} maxLength={MAX_TITLE} value={title}
              onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field id={`${ids}-body`} label={t("adm.push.body")} counter={`${message.length}/${MAX_BODY}`} hint={t("adm.push.bodyHint")}>
            <textarea id={`${ids}-body`} className="input" style={{ fontSize: 16 }} rows={2} maxLength={MAX_BODY} value={message}
              onChange={(event) => setMessage(event.target.value)} />
          </Field>
          <Field id={`${ids}-url`} label={t("adm.push.link")} hint={urlOk ? t("adm.push.linkHint") : null}>
            <input id={`${ids}-url`} className={`input ${urlOk ? "" : "input-error"}`} style={{ fontSize: 16 }} value={url}
              placeholder="/planning" onChange={(event) => setUrl(event.target.value)} aria-invalid={!urlOk} />
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

          <PushPreview title={title} message={message} />

          {error && !confirming && <p className="text-sm" role="alert" style={{ color: "var(--bt-danger)" }}>{errorText(t, error)}</p>}
          {result?.ok && (
            <p className="text-sm" role="status" style={{ color: "var(--bt-accent-text)" }}>
              {result.scheduled ? t("adm.push.scheduled")
                : result.recipients !== null && result.recipients !== undefined
                  ? t(`adm.push.sentTo.${result.recipients === 1 ? "one" : "other"}`).replace("{n}", formatCount(result.recipients, lang))
                  : t("adm.push.sent")}
            </p>
          )}

          <div>
            <button type="button" className="btn-primary min-h-[44px]" disabled={!ready || sending || !push?.audience}
              onClick={() => { setError(null); setResult(null); setConfirming(true); }}>
              {sendAfter ? t("adm.push.schedule") : t("adm.push.send")}
            </button>
          </div>
        </div>
      </div>

      {confirming && (
        <ConfirmDialog
          title={sendAfter ? t("adm.push.confirmLaterTitle") : t("adm.push.confirmNowTitle")}
          confirmLabel={sendAfter ? t("adm.push.schedule") : t("adm.push.send")}
          busy={sending} error={error ? errorText(t, error) : null}
          onClose={() => setConfirming(false)} onConfirm={send}>
          <p>
            {t("adm.push.confirmTarget").replace("{target}", audienceText)}{" "}
            {sendAfter
              ? t("adm.push.confirmLater").replace("{date}", formatDate(new Date(sendAfter).toISOString(), lang, "dateTimeYear"))
              : t("adm.push.confirmNow")}
          </p>
          <div className="mt-3"><PushPreview title={title} message={message} /></div>
        </ConfirmDialog>
      )}
    </div>
  );
}
