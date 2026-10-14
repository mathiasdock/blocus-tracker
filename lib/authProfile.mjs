import { ENTRY_PATHS, PUBLIC_PAGE_PATHS } from "./publicRoutes.mjs";

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

// Le site public (français et anglais) et les pages d'entrée, lus dans le
// registre (lib/publicRoutes.mjs).
const PROFILE_REPAIR_BYPASS_PATHS = new Set([...PUBLIC_PAGE_PATHS, ...ENTRY_PATHS]);

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
