// Urgency belongs to the date, not to the course color or error state.
export function timerExamUrgency(days) {
  if (days == null || !Number.isFinite(days)) return "calm";
  if (days <= 1) return "urgent";
  if (days <= 7) return "week";
  return "calm";
}
