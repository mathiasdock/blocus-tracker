// Fiche membre admin — état des notifications.
//
// Deux sources, chacune pour ce qu'elle sait :
//   • la base (admin_member_notifications, v62) : ses réglages (général,
//     rappels, social, annonces), les appareils qu'il a déclarés, son dernier
//     échec d'activation, ses derniers envois ;
//   • OneSignal, lu pour ce seul compte (/api/admin/members/[id]/notifications) :
//     abonnements réellement actifs. Si OneSignal ne répond pas, la fiche le
//     dit (« non vérifiable ») au lieu d'affirmer quoi que ce soit.

import { useCallback, useEffect, useState } from "react";
import { SkeletonRows, StateMark, adminStyles as s, errorText, plural } from "./AdminUi";
import { kindLabel } from "./NotificationHistory";
import { useI18n } from "../../contexts/I18nContext";
import { adminFetch, adminRpc } from "../../lib/adminApi";
import { formatAgo } from "../../lib/adminFormat.mjs";

const PREFS = ["push_enabled", "push_reminders", "push_social", "push_announcements"];
const RECIPIENT_TONE = { sent: "ok", scheduled: "ok", failed: "danger", unreachable: "quiet", cancelled: "quiet", queued: "quiet" };

function Fact({ label, children }) {
  return (
    <div className={s.fact}>
      <dt>{label}</dt>
      <dd>{children ?? "—"}</dd>
    </div>
  );
}

export default function MemberNotifications({ userId, pushReason }) {
  const { t, lang } = useI18n();
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [check, setCheck] = useState({ data: null, loading: true });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    setCheck({ data: null, loading: true });
    const [facts, live] = await Promise.all([
      adminRpc("admin_member_notifications", { p_user: userId }),
      adminFetch(`/api/admin/members/${encodeURIComponent(userId)}/notifications`),
    ]);
    setState({ data: facts.data, error: facts.error, loading: false });
    setCheck({ data: live.error ? { checked: false, reason: live.error } : live.data, loading: false });
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  if (state.loading && !state.data) return <SkeletonRows rows={3} />;
  if (state.error && !state.data) return <p className={s.note} role="alert">{errorText(t, state.error)}</p>;
  const data = state.data;
  const prefs = data.prefs || {};
  const now = new Date(data.generated_at || Date.now());
  const active = (data.devices || []).filter((device) => device.status === "active");
  const general = prefs.push_enabled !== false;

  let oneSignal;
  if (check.loading) oneSignal = <span className={s.muted}>{t("common.loading")}</span>;
  else if (!check.data?.checked) {
    oneSignal = <StateMark tone="quiet">{check.data?.reason === "unconfigured" ? t("adm.notif.member.osUnconfigured") : t("adm.notif.member.osUnknown")}</StateMark>;
  } else if (check.data.reachable) {
    const types = [...new Set(check.data.subscriptions.filter((sub) => sub.enabled).map((sub) => t(`adm.notif.member.subType.${sub.type}`) === `adm.notif.member.subType.${sub.type}` ? sub.type : t(`adm.notif.member.subType.${sub.type}`)))];
    oneSignal = <StateMark tone="ok">{`${plural(t, "adm.notif.member.osActive", check.data.subscriptions.filter((sub) => sub.enabled).length)} · ${types.join(", ")}`}</StateMark>;
  } else {
    oneSignal = <StateMark tone="quiet">{check.data.found ? t("adm.notif.member.osInactive") : t("adm.notif.member.osNone")}</StateMark>;
  }

  return (
    <>
      <dl className={s.facts}>
        {PREFS.map((key) => {
          // Général coupé : les catégories ne sont pas « refusées » une à une,
          // elles sont éteintes par l'interrupteur général — on le dit.
          const viaGeneral = key !== "push_enabled" && !general;
          const on = key === "push_enabled" ? general : general && prefs[key] !== false;
          return (
            <Fact key={key} label={t(`adm.notif.member.pref.${key}`)}>
              <StateMark tone={on ? "ok" : "quiet"}>
                {viaGeneral ? t("adm.notif.member.viaGeneral") : on ? t("adm.notif.member.on") : t("adm.notif.member.off")}
              </StateMark>
            </Fact>
          );
        })}
        <Fact label={t("adm.notif.member.devices")}>
          {active.length
            ? `${plural(t, "adm.notif.member.devicesActive", active.length)} · ${[...new Set(active.map((device) => t(`adm.notif.member.platform.${device.platform}`)))].join(", ")} · ${t("adm.notif.member.seen").replace("{ago}", formatAgo(active[0].last_seen_at, now, lang))}`
            : <span className={s.muted}>{t("adm.notif.member.noDevice")}</span>}
        </Fact>
        <Fact label={t("adm.notif.member.onesignal")}>{oneSignal}</Fact>
        <Fact label={t("adm.notif.member.lastDiag")}>
          {data.last_diagnostic
            ? `${pushReason(t, data.last_diagnostic.reason)} · ${formatAgo(data.last_diagnostic.at, now, lang)}`
            : <span className={s.muted}>{t("adm.notif.member.noDiag")}</span>}
        </Fact>
      </dl>
      <p className={s.fieldLabel} style={{ marginTop: 12 }}>{t("adm.notif.member.recent")}</p>
      {(data.recent || []).length === 0
        ? <p className={s.note} style={{ marginTop: 4 }}>{t("adm.notif.member.noRecent")}</p>
        : (
          <ul className={s.rows} style={{ marginTop: 4 }}>
            {data.recent.map((entry) => (
              <li key={`${entry.at}-${entry.kind}`} style={{ padding: "8px 0" }} className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className={s.rowTitle} style={{ display: "block" }}>{entry.title?.fr || kindLabel(t, entry.kind)}</span>
                  <span className={s.rowMeta} style={{ display: "block" }}>{`${kindLabel(t, entry.kind)} · ${formatAgo(entry.at, now, lang)}`}</span>
                </span>
                <StateMark tone={RECIPIENT_TONE[entry.status] || "neutral"}>{t(`adm.notif.recipientStatus.${entry.status}`)}</StateMark>
              </li>
            ))}
          </ul>
        )}
    </>
  );
}
