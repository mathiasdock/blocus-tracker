// Fiche d'un membre — panneau à droite sur ordinateur, plein écran sur
// téléphone. Lecture seule : admin_member_detail (v61), qui ne renvoie jamais
// l'email. Les seules actions sont celles de la phase 1 (modérer, suspendre,
// réactiver, supprimer), confirmées et motivées dans MemberActionDialog, et
// un lien vers l'envoi d'une notification ciblée. Pas d'édition libre du
// profil, pas de messagerie.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Avatar } from "../Layout";
import useDialogFocus from "../useDialogFocus";
import MemberActionDialog from "./MemberActionDialog";
import {
  BellIcon, CloseIcon, ErrorLine, SkeletonRows, StateMark, adminStyles as s, plural,
} from "./AdminUi";
import { useI18n } from "../../contexts/I18nContext";
import { adminRpc } from "../../lib/adminApi";
import { formatAgo, formatCount, formatDate, formatDuration } from "../../lib/adminFormat.mjs";

const ACTIVATION_TONE = { activated: "ok", pending: "quiet", late: "neutral", not_activated: "neutral" };

export function activationLabel(t, status) {
  return t(`adm.activationStatus.${status || "not_activated"}`);
}

export function auditActionLabel(t, action) {
  const key = `adm.audit.action.${action}`;
  const text = t(key);
  return text === key ? action : text;
}

function Facts({ rows }) {
  return (
    <dl className={s.facts}>
      {rows.filter(Boolean).map(([label, value]) => (
        <FactRow key={label} label={label} value={value} />
      ))}
    </dl>
  );
}

function FactRow({ label, value }) {
  return (
    <div className={s.fact}>
      <dt>{label}</dt>
      <dd>{value ?? "—"}</dd>
    </div>
  );
}

function DetailBody({ data, t, lang, onAction }) {
  const now = data.generated_at ? new Date(data.generated_at) : new Date();
  const { account, profile, activation, study, courses, social, level, push } = data;
  const yes = t("adm.common.yes");
  const no = t("adm.common.no");
  const firstReal = activation.first_real_session_at
    ? `${formatDate(activation.first_real_session_at, lang, "day")} · ${t("adm.member.afterHours").replace("{h}", formatCount(Math.round(activation.hours_to_first_real_session ?? 0), lang))}`
    : t("adm.member.never");
  const returned = activation.returned_week2 === null || activation.returned_week2 === undefined
    ? t("adm.member.returnPending").replace("{date}", formatDate(activation.return_window_ends_at, lang, "dayShort"))
    : activation.returned_week2 ? yes : no;
  const emailState = account.placeholder_email ? t("adm.member.emailPlaceholder")
    : account.email_confirmed ? t("adm.member.emailConfirmed") : t("adm.member.emailUnconfirmed");

  return (
    <>
      <div className={s.drawerSection}>
        <div className={s.actions}>
          <Link href={`/admin/communications?tab=send&to=${encodeURIComponent(data.user_id)}`}
            className="btn-ghost min-h-[44px]" aria-disabled={account.suspended || undefined}
            onClick={(event) => { if (account.suspended) event.preventDefault(); }}
            style={account.suspended ? { opacity: 0.45, pointerEvents: "none" } : undefined}>
            <BellIcon /> {t("adm.member.sendPush")}
          </Link>
          <button type="button" className="btn-ghost min-h-[44px]" onClick={() => onAction("moderate")}>{t("adminMod.actionModerate")}</button>
          {account.suspended
            ? <button type="button" className="btn-ghost min-h-[44px]" onClick={() => onAction("unsuspend")}>{t("adminMod.actionUnsuspend")}</button>
            : <button type="button" className={`btn min-h-[44px] ${s.danger}`} onClick={() => onAction("suspend")}>{t("adminMod.actionSuspend")}</button>}
          <button type="button" className={`btn min-h-[44px] ${s.danger}`} onClick={() => onAction("delete")}>{t("adminMod.actionDelete")}</button>
        </div>
      </div>

      <div className={s.drawerSection}>
        <h3 className={s.h3}>{t("adm.member.account")}</h3>
        <Facts rows={[
          [t("adm.member.signedUp"), formatDate(account.signed_up_at, lang, "dateTimeYear")],
          [t("adm.member.lastSignIn"), account.last_sign_in_at ? formatAgo(account.last_sign_in_at, now, lang) : t("adm.member.never")],
          [t("adm.member.email"), emailState],
          [t("adm.member.studies"), profile.studies_completed ? t("adm.member.studiesDone") : t("adm.member.studiesMissing")],
          level && [t("adm.member.level"), t("adm.member.levelValue")
            .replace("{level}", formatCount(level.level, lang))
            .replace("{xp}", formatCount(level.total_xp, lang))
            .replace("{streak}", formatCount(level.streak, lang))],
        ]} />
      </div>

      <div className={s.drawerSection}>
        <h3 className={s.h3}>{t("adm.member.activation")}</h3>
        <Facts rows={[
          [t("adm.member.status"), <StateMark key="st" tone={ACTIVATION_TONE[activation.status]}>{activationLabel(t, activation.status)}</StateMark>],
          [t("adm.member.firstReal"), firstReal],
          [t("adm.member.returned"), returned],
        ]} />
      </div>

      <div className={s.drawerSection}>
        <h3 className={s.h3}>{t("adm.member.study")}</h3>
        <Facts rows={[
          [t("adm.member.realSessions"), `${formatCount(study.real_sessions, lang)}${study.short_sessions ? ` · ${plural(t, "adm.member.shortSessions", study.short_sessions)}` : ""}`],
          [t("adm.member.realDays"), formatCount(study.real_days, lang)],
          [t("adm.member.lastReal"), study.last_real_session_at ? formatAgo(study.last_real_session_at, now, lang) : t("adm.member.never")],
          [t("adm.member.time7d"), formatDuration(study.real_seconds_7d, lang)],
          [t("adm.member.time30d"), formatDuration(study.real_seconds_30d, lang)],
          [t("adm.member.timeTotal"), formatDuration(study.real_seconds_total, lang)],
          study.long_sessions_total > 0 && [t("adm.member.longSessions"), formatCount(study.long_sessions_total, lang)],
        ]} />
        <p className={s.note} style={{ marginTop: 8 }}>{t("adm.member.timeNote")}</p>
      </div>

      <div className={s.drawerSection}>
        <h3 className={s.h3}>{t("adm.member.usage")}</h3>
        <Facts rows={[
          [t("adm.member.courses"), t("adm.member.coursesValue").replace("{active}", formatCount(courses.active, lang)).replace("{total}", formatCount(courses.total, lang))],
          [t("adm.member.exams"), formatCount(courses.upcoming_exams, lang)],
          [t("adm.member.objectives"), formatCount(courses.objectives_30d, lang)],
          [t("adm.member.friends"), formatCount(social.friends, lang)],
          [t("adm.member.rooms"), formatCount(social.course_rooms, lang)],
          [t("adm.member.roomPosts"), formatCount(social.course_room_posts_30d, lang)],
          [t("adm.member.groups"), formatCount(social.groups, lang)],
          [t("adm.member.referrals"), formatCount(social.referrals, lang)],
        ]} />
      </div>

      <div className={s.drawerSection}>
        <h3 className={s.h3}>{t("adm.member.push")}</h3>
        <Facts rows={[
          [t("adm.member.pushFailures"), formatCount(push.failures_30d, lang)],
          push.last_failure && [t("adm.member.pushLast"), `${pushReason(t, push.last_failure.reason)} · ${formatAgo(push.last_failure.at, now, lang)}`],
        ]} />
      </div>

      <div className={s.drawerSection}>
        <h3 className={s.h3}>{t("adm.member.recent")}</h3>
        {data.recent_sessions.length === 0 ? <p className={s.note} style={{ marginTop: 6 }}>{t("adm.member.noSessions")}</p> : (
          <dl className={s.facts} style={{ marginTop: 4 }}>
            {data.recent_sessions.map((session) => (
              <FactRow key={session.started_at}
                label={formatDate(session.started_at, lang, "dateTimeYear")}
                value={session.real
                  ? formatDuration(session.duration_seconds, lang)
                  : <span className={s.muted}>{`${formatDuration(session.duration_seconds, lang)} · ${t("adm.member.short")}`}</span>} />
            ))}
          </dl>
        )}
      </div>

      <div className={s.drawerSection}>
        <h3 className={s.h3}>{t("adm.member.history")}</h3>
        {data.admin_actions.length === 0 ? <p className={s.note} style={{ marginTop: 6 }}>{t("adm.member.noHistory")}</p> : (
          <ul className={s.rows} style={{ marginTop: 4 }}>
            {data.admin_actions.map((entry) => (
              <li key={`${entry.at}-${entry.action}`} style={{ padding: "8px 0" }}>
                <p className={s.rowTitle}>{auditActionLabel(t, entry.action)}</p>
                <p className={s.rowMeta}>
                  {formatDate(entry.at, lang, "dateTimeYear")}
                  {" · "}{entry.actor_kind === "admin" ? `@${entry.actor_pseudo || "?"}` : t(`adm.audit.actor.${entry.actor_kind}`)}
                  {entry.reason ? ` · ${entry.reason}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export function pushReason(t, reason) {
  const key = `adm.pushReason.${reason}`;
  const text = t(key);
  return text === key ? String(reason || "?") : text;
}

export default function MemberDetail({ userId, onClose, onChanged }) {
  const { t, lang } = useI18n();
  const ids = useId();
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [action, setAction] = useState(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    const result = await adminRpc("admin_member_detail", { p_user: userId });
    if (mine !== seq.current) return;
    setState({ data: result.data, error: result.error, loading: false });
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Fermeture stable : sinon le piège à focus se réinstalle à chaque rendu.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const actionOpen = useRef(false);
  actionOpen.current = Boolean(action);
  const close = useCallback(() => { if (!actionOpen.current) onCloseRef.current(); }, []);
  const panelRef = useDialogFocus(true, close);

  const data = state.data;
  const profile = data?.profile;
  const account = data?.account;
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");
  const school = [profile?.university, profile?.study_field, profile?.study_year].filter(Boolean).join(" · ");

  function done(result) {
    onChanged?.(result);
    if (result.kind === "delete") { onCloseRef.current(); return; }
    load();
  }

  return (
    <>
      <div className={s.scrim} onClick={close} aria-hidden="true" />
      <div ref={panelRef} className={s.drawer} role="dialog" aria-modal="true" aria-labelledby={`${ids}-title`} tabIndex={-1}>
        <div className={s.drawerHead}>
          {profile && <Avatar url={profile.avatar_url} pseudo={profile.pseudo} size={40} />}
          <div className="min-w-0 flex-1">
            <h2 id={`${ids}-title`} className={s.rowTitle} style={{ fontSize: 16 }}>
              {profile ? `@${profile.pseudo || "?"}` : t("adm.member.title")}
            </h2>
            {(name || school) && <p className={s.rowMeta}>{[name, school].filter(Boolean).join(" — ")}</p>}
          </div>
          <button type="button" className={s.iconBtn} onClick={close} aria-label={t("common.close")}>
            <CloseIcon />
          </button>
        </div>

        <div className={s.drawerBody}>
          {account && (account.suspended || account.placeholder_email || !account.has_profile) && (
            <div className={s.drawerSection} style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
              {account.suspended && <StateMark tone="danger">{t("adm.member.suspended")}</StateMark>}
              {account.placeholder_email && <StateMark tone="warn">{t("adm.member.placeholderShort")}</StateMark>}
              {!account.has_profile && <StateMark tone="warn">{t("adm.member.noProfile")}</StateMark>}
            </div>
          )}
          {state.loading && !data && <SkeletonRows rows={6} />}
          {state.error && !data && <ErrorLine code={state.error} onRetry={load} />}
          {data && <DetailBody data={data} t={t} lang={lang} onAction={setAction} />}
        </div>
      </div>

      {action && data && (
        <MemberActionDialog kind={action} member={{ id: data.user_id, pseudo: profile?.pseudo || "" }}
          onClose={() => setAction(null)} onDone={done} />
      )}
    </>
  );
}
