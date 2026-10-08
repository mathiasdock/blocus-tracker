import Head from "next/head";
import { useState } from "react";
import Layout from "../../components/Layout";
import BadgeSheet from "../../components/BadgeSheet";
import { BadgeGroup } from "../badges";
import { BADGES } from "../../lib/badges";
import { groupBadges } from "../../lib/badgeGroups";
import { useI18n } from "../../contexts/I18nContext";

export function getServerSideProps() {
  return process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_OFFLINE_DEV === "true"
    ? { props: {} } : { notFound: true };
}

// Explicit synthetic states of the real collection/detail. No awards, DB
// writes or changes to the offline account's badge list.
export default function BadgePreview() {
  const { t, setLang } = useI18n();
  const [state, setState] = useState("mixed");
  const [selected, setSelected] = useState(null);
  const earnedIds = BADGES.filter((_, index) => state === "earned" || (state === "mixed" && index % 2 === 0)).map(b => b.id);
  return <Layout>
    <Head><title>Badges — local visual fixtures</title><meta name="robots" content="noindex" /></Head>
    <div className="mx-auto w-full" style={{ maxWidth: 900 }}>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span>Local fixtures</span>
        <label>State <select value={state} onChange={e => setState(e.target.value)}>
          {["mixed", "earned", "locked"].map(value => <option key={value}>{value}</option>)}
        </select></label>
        <button className="btn-secondary" onClick={() => setLang("fr")}>FR</button>
        <button className="btn-secondary" onClick={() => setLang("en")}>EN</button>
        <button className="btn-secondary" onClick={() => document.documentElement.classList.toggle("dark")}>Light / dark</button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        {groupBadges(BADGES).map(group => <BadgeGroup key={group.id} group={group} earnedIds={earnedIds} onPick={setSelected} t={t} />)}
      </div>
    </div>
    <BadgeSheet badge={selected} earned={selected ? earnedIds.includes(selected.id) : false}
      earnedAt={selected && earnedIds.includes(selected.id) ? "2026-10-08T12:00:00Z" : null} t={t} onClose={() => setSelected(null)} />
  </Layout>;
}
