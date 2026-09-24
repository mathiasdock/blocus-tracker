// Cadre commun des pages /admin/* : contrôle d'accès, navigation entre les
// six sections, titre de page.
//
// Le contrôle ici n'est qu'un confort d'affichage : chaque lecture admin_*
// et chaque route /api/admin/* revérifie côté serveur que l'appelant est un
// admin non suspendu. Un non-admin qui forcerait la page ne recevrait rien.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../Layout";
import LoadingScreen from "../LoadingScreen";
import { useAuth } from "../../contexts/AuthContext";
import { useI18n } from "../../contexts/I18nContext";
import { adminRpc } from "../../lib/adminApi";
import s from "./admin.module.css";

export const ADMIN_SECTIONS = [
  { key: "today", href: "/admin" },
  { key: "members", href: "/admin/members" },
  { key: "activation", href: "/admin/activation" },
  { key: "inbox", href: "/admin/inbox" },
  { key: "communications", href: "/admin/communications" },
  { key: "system", href: "/admin/system" },
];

// La file « à traiter » (signalements ouverts + suggestions nouvelles) vient
// d'admin_today. Gardée une minute entre deux pages ; la boîte de réception
// la fait relire après chaque décision (événement bt-admin-queue).
const QUEUE_TTL_MS = 60_000;
let queueCache = { at: 0, today: null, pending: null };

export async function loadAdminToday({ force = false } = {}) {
  if (!force && queueCache.today && Date.now() - queueCache.at < QUEUE_TTL_MS) {
    return { data: queueCache.today, error: null };
  }
  if (!force && queueCache.pending) return queueCache.pending;
  queueCache.pending = adminRpc("admin_today").then((result) => {
    queueCache.pending = null;
    if (!result.error && result.data) queueCache = { at: Date.now(), today: result.data, pending: null };
    return result;
  });
  return queueCache.pending;
}

export function refreshAdminQueue() {
  queueCache = { at: 0, today: null, pending: null };
  if (typeof window !== "undefined") window.dispatchEvent(new Event("bt-admin-queue"));
}

function useInboxCount(enabled) {
  const [count, setCount] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const read = async () => {
      const { data } = await loadAdminToday();
      if (!alive || !data?.queue) return;
      setCount((data.queue.open_reports || 0) + (data.queue.new_feedback || 0));
    };
    read();
    window.addEventListener("bt-admin-queue", read);
    return () => { alive = false; window.removeEventListener("bt-admin-queue", read); };
  }, [enabled]);
  return count;
}

export default function AdminShell({ section, title, lead, aside, children }) {
  const { profile, loading } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const isAdmin = profile?.is_admin === true;
  const inboxCount = useInboxCount(!loading && isAdmin);

  useEffect(() => {
    if (loading) return;
    if (!isAdmin) router.replace("/dashboard");
  }, [loading, isAdmin, router]);

  if (loading || !isAdmin) {
    return <Layout><LoadingScreen compact /></Layout>;
  }

  return (
    <Layout>
      <div className={s.page}>
        <p className={s.eyebrow}>{t("adm.eyebrow")}</p>
        <nav className={s.nav} aria-label={t("adm.nav.label")}>
          {ADMIN_SECTIONS.map((item) => {
            const current = item.key === section;
            return (
              <Link key={item.key} href={item.href} className={s.navLink} aria-current={current ? "page" : undefined}>
                {t(`adm.nav.${item.key}`)}
                {item.key === "inbox" && inboxCount > 0 && (
                  <span className={s.count} aria-label={t("adm.nav.inboxCount").replace("{n}", String(inboxCount))}>
                    {inboxCount > 99 ? "99+" : inboxCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <header className={s.head}>
          <h1 className={s.title}>{title}</h1>
          {aside}
        </header>
        {lead && <p className={s.lead}>{lead}</p>}

        <div className="pb-6">{children}</div>
      </div>
    </Layout>
  );
}
