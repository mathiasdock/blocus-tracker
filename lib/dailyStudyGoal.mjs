// Daily UI goal shared by Stats and Timer. This is planned study time, not
// a session target, an XP mission, or a streak qualification threshold.
export const DEFAULT_DAILY_GOAL_SECONDS = 2 * 60 * 60;

export function dailyStudyGoalSeconds(objectives = [], today) {
  if (!today) return DEFAULT_DAILY_GOAL_SECONDS;
  const plannedMinutes = (objectives || []).reduce((total, objective) => {
    if (objective?.scheduled_date !== today) return total;
    if (!["number", "string"].includes(typeof objective.target_minutes)) return total;
    const minutes = Number(objective.target_minutes);
    // Completed objectives still belong to today's plan. Missing/invalid
    // durations never receive a made-up allocation of time.
    return Number.isFinite(minutes) && minutes > 0 ? total + minutes : total;
  }, 0);
  return plannedMinutes > 0 ? plannedMinutes * 60 : DEFAULT_DAILY_GOAL_SECONDS;
}

// Both surfaces read the same date/owner scope; Timer also needs the titles
// and completion flags for its existing objectives list.
export function fetchDailyObjectives(supabase, userId, today, columns = "*") {
  return supabase.from("objectives").select(columns)
    .eq("user_id", userId).eq("scheduled_date", today).order("done");
}
