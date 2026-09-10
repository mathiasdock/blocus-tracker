import { useState } from "react";
import Head from "next/head";
import ProfileAchievementCards from "../../components/ProfileAchievementCards";
import { useI18n } from "../../contexts/I18nContext";
import { getLevelInfo } from "../../lib/xp";
import { BADGES } from "../../lib/badges";

export function getServerSideProps() {
  return process.env.NODE_ENV === "development" ? { props: {} } : { notFound: true };
}

export default function ProfileCardsPreview() {
  const { t } = useI18n();
  const [scenario, setScenario] = useState("collection");
  const scenarios = {
    collection: { xp: 5375, ids: ["first_session", "hours_50", "streak_7", "planner", "first_friend", "team_spirit"] },
    empty: { xp: 0, ids: [] },
    one: { xp: 70, ids: ["first_session"] },
    two: { xp: 320, ids: ["first_session", "streak_3"] },
    max: { xp: 45000, ids: BADGES.map(badge => badge.id) },
  };
  const data = scenarios[scenario];
  return <main className="mx-auto max-w-[1200px] p-5 sm:p-9">
    <Head><title>Cartes du profil — aperçu local</title><meta name="robots" content="noindex" /></Head>
    <h1 className="text-xl font-bold mb-3">Cartes du profil — données de démonstration</h1>
    <label className="block mb-8">Scénario <select aria-label="Scénario" value={scenario} onChange={event => setScenario(event.target.value)}>
      {Object.keys(scenarios).map(key => <option key={key}>{key}</option>)}
    </select></label>
    <div className="lg:w-[calc(50%-10px)]" id="profile-cards-preview">
      <ProfileAchievementCards levelInfo={getLevelInfo(data.xp)} earnedBadgeIds={data.ids} t={t} />
    </div>
  </main>;
}
