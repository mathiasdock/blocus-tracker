// Admin · Communications — le centre de contrôle des notifications.
//
//   Envoyer      : FR/EN, cible, « qui recevra » calculé par le serveur,
//                  aperçu, test à soi-même, confirmation.
//   Historique   : notre registre (manuel / automatique / social, période,
//                  auteur, ciblés / envoyés / échecs, livraison OneSignal).
//   Automatiques : rappel du soir (dernier et prochain passage, chiffres,
//                  plafond, « qui recevrait ce soir »), textes FR/EN.
//   Annonces     : dans l'app, FR/EN, datées, ciblées, push facultatif.
//
// L'onglet est dans l'URL (?tab=) ; « ?to=<membre> » ouvre l'envoi ciblé
// depuis une fiche membre. Aucune liste de membres n'est chargée ici : tout
// ce qui cible ou filtre se calcule côté serveur ou base.

import { useRouter } from "next/router";
import AdminShell from "../../components/admin/AdminShell";
import AnnouncementsPanel from "../../components/admin/AnnouncementsPanel";
import AutomationsList from "../../components/admin/AutomationsList";
import NotificationHistory from "../../components/admin/NotificationHistory";
import PushComposer from "../../components/admin/PushComposer";
import { Freshness, StateMark, adminStyles as s, useAdminLoad } from "../../components/admin/AdminUi";
import { useI18n } from "../../contexts/I18nContext";
import { adminFetch } from "../../lib/adminApi";

const TABS = ["send", "history", "automatic", "announcements"];

export default function AdminCommunications() {
  const { t } = useI18n();
  const router = useRouter();
  const tab = TABS.includes(router.query.tab) ? router.query.tab : "send";
  const to = typeof router.query.to === "string" && /^[0-9a-f-]{36}$/i.test(router.query.to) ? router.query.to : null;
  const push = useAdminLoad(() => adminFetch("/api/admin/push"), []);

  function setTab(next) {
    router.replace(next === "send" ? "/admin/communications" : `/admin/communications?tab=${next}`, undefined, { shallow: true, scroll: false });
  }

  return (
    <AdminShell section="communications" title={t("adm.nav.communications")}
      aside={tab === "send" ? <Freshness busy={push.loading} onRefresh={push.reload} /> : null}>

      <div className={`${s.chips} mt-5`} role="tablist" aria-label={t("adm.comm.tabsLabel")}>
        {TABS.map((key) => (
          <button key={key} type="button" role="tab" className={s.chip} aria-selected={tab === key} onClick={() => setTab(key)}>
            {t(`adm.comm.tab.${key}`)}
          </button>
        ))}
      </div>

      {push.data && push.data.configured === false && (
        <p className="mt-4 text-sm" role="status"><StateMark tone="warn">{t("adm.notif.unconfigured")}</StateMark></p>
      )}

      <div className="mt-5" role="tabpanel">
        {tab === "send" && (
          <PushComposer key={to || "all"} push={push.data} pushError={push.error} initialTo={to} onSent={push.reload} />
        )}
        {tab === "history" && <NotificationHistory />}
        {tab === "automatic" && <AutomationsList />}
        {tab === "announcements" && <AnnouncementsPanel universities={push.data?.universities || []} />}
      </div>
    </AdminShell>
  );
}
