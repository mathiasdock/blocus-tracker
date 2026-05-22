// 21 badges covering all dimensions of the app.
// labelKey / descKey reference keys in lib/i18n.js.

export const BADGES = [
  { id: "first_session",    icon: "⭐", labelKey: "badge.first_session",    descKey: "badge.first_session.desc",    xp: 50 },
  { id: "streak_3",         icon: "🔥", labelKey: "badge.streak_3",          descKey: "badge.streak_3.desc",          xp: 50 },
  { id: "streak_7",         icon: "⚡", labelKey: "badge.streak_7",          descKey: "badge.streak_7.desc",          xp: 50 },
  { id: "streak_14",        icon: "🌊", labelKey: "badge.streak_14",         descKey: "badge.streak_14.desc",         xp: 50 },
  { id: "streak_30",        icon: "💫", labelKey: "badge.streak_30",         descKey: "badge.streak_30.desc",         xp: 50 },
  { id: "hours_10",         icon: "📚", labelKey: "badge.hours_10",          descKey: "badge.hours_10.desc",          xp: 50 },
  { id: "hours_50",         icon: "🎓", labelKey: "badge.hours_50",          descKey: "badge.hours_50.desc",          xp: 50 },
  { id: "hours_100",        icon: "🏆", labelKey: "badge.hours_100",         descKey: "badge.hours_100.desc",         xp: 50 },
  { id: "hours_250",        icon: "🌟", labelKey: "badge.hours_250",         descKey: "badge.hours_250.desc",         xp: 50 },
  { id: "marathon_day",     icon: "🏃", labelKey: "badge.marathon_day",      descKey: "badge.marathon_day.desc",      xp: 50 },
  { id: "planner",          icon: "📅", labelKey: "badge.planner",           descKey: "badge.planner.desc",           xp: 50 },
  { id: "strategist",       icon: "🎯", labelKey: "badge.strategist",        descKey: "badge.strategist.desc",        xp: 50 },
  { id: "blocus_architect", icon: "🏛", labelKey: "badge.blocus_architect",  descKey: "badge.blocus_architect.desc",  xp: 50 },
  { id: "first_exam",       icon: "📝", labelKey: "badge.first_exam",        descKey: "badge.first_exam.desc",        xp: 50 },
  { id: "first_post",       icon: "📸", labelKey: "badge.first_post",        descKey: "badge.first_post.desc",        xp: 50 },
  { id: "influencer",       icon: "🎬", labelKey: "badge.influencer",        descKey: "badge.influencer.desc",        xp: 50 },
  { id: "first_friend",     icon: "🤝", labelKey: "badge.first_friend",      descKey: "badge.first_friend.desc",      xp: 50 },
  { id: "social",           icon: "👥", labelKey: "badge.social",            descKey: "badge.social.desc",            xp: 50 },
  { id: "motivator",        icon: "💬", labelKey: "badge.motivator",         descKey: "badge.motivator.desc",         xp: 50 },
  { id: "team_spirit",      icon: "👊", labelKey: "badge.team_spirit",       descKey: "badge.team_spirit.desc",       xp: 50 },
  { id: "community_pillar", icon: "🌍", labelKey: "badge.community_pillar",  descKey: "badge.community_pillar.desc",  xp: 50 },
  { id: "referrer",         icon: "🤝", labelKey: "badge.referrer",          descKey: "badge.referrer.desc",          xp: 50 },
];

export function computeEarnedBadgeIds({
  streak,
  totalHours,
  maxDailyHours,
  sessionCount,
  examCount,
  objectiveCount,
  completedObjCount,
  friendCount,
  postCount,
  reactionsCount,
  groupMemberCount,
  communityMsgCount,
  referralCount,
}) {
  const ids = [];
  if (sessionCount >= 1)        ids.push("first_session");
  if (streak >= 3)              ids.push("streak_3");
  if (streak >= 7)              ids.push("streak_7");
  if (streak >= 14)             ids.push("streak_14");
  if (streak >= 30)             ids.push("streak_30");
  if (totalHours >= 10)         ids.push("hours_10");
  if (totalHours >= 50)         ids.push("hours_50");
  if (totalHours >= 100)        ids.push("hours_100");
  if (totalHours >= 250)        ids.push("hours_250");
  if (maxDailyHours >= 6)       ids.push("marathon_day");
  if (objectiveCount >= 10)     ids.push("planner");
  if (completedObjCount >= 25)  ids.push("strategist");
  if (completedObjCount >= 75)  ids.push("blocus_architect");
  if (examCount >= 1)           ids.push("first_exam");
  if (postCount >= 1)           ids.push("first_post");
  if (postCount >= 10)          ids.push("influencer");
  if (friendCount >= 1)         ids.push("first_friend");
  if (friendCount >= 20)        ids.push("social");
  if (reactionsCount >= 25)     ids.push("motivator");
  if (groupMemberCount >= 1)    ids.push("team_spirit");
  if (communityMsgCount >= 50)  ids.push("community_pillar");
  if (referralCount >= 5)       ids.push("referrer");
  return ids;
}
