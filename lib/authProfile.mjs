export function canStartProfileRequest(requestedUserId, activeUserId) {
  return Boolean(requestedUserId) && requestedUserId === activeUserId;
}

export function isCurrentProfileRequest({
  requestId,
  currentRequestId,
  requestedUserId,
  activeUserId,
}) {
  return requestId === currentRequestId && requestedUserId === activeUserId;
}

const PROFILE_REPAIR_BYPASS_PATHS = new Set([
  "/",
  "/application-etudiant",
  "/blocus-belgique",
  "/forgot-password",
  "/legal",
  "/login",
  "/objectifs-etude",
  "/onboarding",
  "/planning-revision",
  "/pomodoro",
  "/reset-password",
  "/signup",
  "/stats-etude",
]);

export function shouldRedirectToProfileRepair({
  authLoading,
  hasUser,
  profileStatus,
  pathname,
}) {
  return (
    !authLoading
    && hasUser
    && profileStatus === "missing"
    && !PROFILE_REPAIR_BYPASS_PATHS.has(pathname)
  );
}
